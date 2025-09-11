<?php
require_once 'config.php';
require_once '../config/api_keys.php'; // Include API key management functions

// Handle CORS preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    http_response_code(200);
    exit;
}

// Set CORS headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    sendResponse(false, null, 'Method not allowed');
    exit;
}

/**
 * Generates ESP32 code for a device
 */
function generateEspCode($deviceId, $apiKey, $deviceName, $location) {
    $baseUrl = (isset($_SERVER['HTTPS']) ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'];
    $apiUrl = $baseUrl . '/api/receive_data.php';

    return '#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Ticker.h>

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Device Configuration
const String DEVICE_ID = "' . $deviceId . '";
const String DEVICE_NAME = "' . $deviceName . '";
const String LOCATION = "' . $location . '";
const String API_KEY = "' . $apiKey . '";
const String API_URL = "' . $apiUrl . '";

// Sensor pins (Adjust as per your hardware)
#define TRIG_PIN 23
#define ECHO_PIN 19
#define MOISTURE_SENSOR_PIN 34
#define ONE_WIRE_BUS 4
#define RAINDROP_AO_PIN 35
#define BUTTON_PIN 18 // Example button for LCD screen change

// LCD I2C (Adjust address if needed, common are 0x27 or 0x3F)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Objects
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
Ticker ticker;

// Global sensor variables
long  duration;
int   distance        = -1;
String distanceStatus = "Unknown";

int   moistureValue   = 0;
int   soilPct         = 0;
String moistureStatus = "Unknown";

float temperature     = DEVICE_DISCONNECTED_C;
String temperatureStatus = "Unknown";

int   rd_adc    = 0;
int   rd_wetPct = 0;
String rd_klas = "Unknown";

// LCD screen management
int currentScreen = 0;
const int TOTAL_SCREENS = 4;

// LCD auto sleep config
#define LCD_SLEEP_TIMEOUT_MS   30000UL // 30 seconds
bool lcdAwake = true;
unsigned long lastUserActionMs = 0;

// Function prototypes
void sampleSensors();
void sendDataToWebServer();
void updateLCD();
void lcdSleep();
void lcdWake(bool refreshNow);
int readAnalogMedian(int pin, int samples);
String classifyMoisture(int moisture);
String getDistanceStatus(int d);
String getTemperatureStatus(float t);
String getRainStatus(int rainPercentage);
int rd_wetPercentFromADC(int adc, int dryHigh, int wetLow);

void setup() {
  Serial.begin(115200);
  Serial.println("=== IoT Kelapa Sawit Monitor ===");
  Serial.println("Device ID: " + String(DEVICE_ID));
  Serial.println("Device Name: " + String(DEVICE_NAME));
  Serial.println("Location: " + String(LOCATION));

  Wire.begin();
  lcd.init(); 
  lcd.backlight();
  lcd.setCursor(0, 0); 
  lcd.print(DEVICE_NAME);
  lcd.setCursor(0, 1); 
  lcd.print("Connecting...");

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  sensors.begin(); 
  sensors.setWaitForConversion(false);

  analogReadResolution(12); // ESP32 ADC is 12-bit
  analogSetPinAttenuation(MOISTURE_SENSOR_PIN, ADC_11db); // Full range 0-3.3V
  analogSetPinAttenuation(RAINDROP_AO_PIN, ADC_11db);
  pinMode(MOISTURE_SENSOR_PIN, INPUT);
  pinMode(RAINDROP_AO_PIN, INPUT);

  // Connect to WiFi
  Serial.println("Connecting to WiFi: " + String(ssid));
  WiFi.begin(ssid, password);

  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 30) {
    delay(500); 
    Serial.print(".");
    wifiAttempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi connected successfully!");
    Serial.println("IP address: " + WiFi.localIP().toString());
    Serial.println("Signal strength: " + String(WiFi.RSSI()) + " dBm");
    lcd.setCursor(0, 1); 
    lcd.print("WiFi OK         ");
  } else {
    Serial.println();
    Serial.println("WiFi connection failed!");
    lcd.setCursor(0, 1); 
    lcd.print("WiFi FAILED     ");
  }

  // Start sensor reading
  ticker.attach_ms(5000, sampleSensors); // Read sensors every 5 seconds

  delay(2000); 
  lcd.clear();
  lcdAwake = true;
  lastUserActionMs = millis();

  Serial.println("Setup completed. Starting monitoring...");
}

void loop() {
  // Button debounce logic
  static int lastStableState = HIGH;
  static int lastReading     = HIGH;
  static unsigned long lastDebounceTime = 0;
  const unsigned long debounceDelay = 50;

  int reading = digitalRead(BUTTON_PIN);
  if (reading != lastReading) lastDebounceTime = millis();

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (reading != lastStableState) {
      lastStableState = reading;
      if (lastStableState == LOW) { // Button pressed
        lastUserActionMs = millis();
        if (!lcdAwake) { 
          lcdWake(true); 
          updateLCD(); 
        } else { 
          currentScreen = (currentScreen + 1) % TOTAL_SCREENS; 
          updateLCD(); 
        }
        Serial.print("BTN -> screen "); 
        Serial.println(currentScreen);
      }
    }
  }
  lastReading = reading;

  // LCD auto sleep
  if (lcdAwake && (millis() - lastUserActionMs >= LCD_SLEEP_TIMEOUT_MS)) {
    lcdSleep();
  }

  // Check WiFi connection periodically
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Attempting to reconnect...");
    WiFi.reconnect();
  }
}

// Sensor reading and data sending functions
void sampleSensors() {
  Serial.println("Reading sensors...");

  // Read ultrasonic sensor
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(5);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  duration = pulseIn(ECHO_PIN, HIGH, 30000UL); // Timeout 30ms

  if (duration == 0) {
    distance = -1; // Indicate error
  } else {
    distance = (int)(duration * 0.0343f / 2.0f);
  }
  distanceStatus = getDistanceStatus(distance);

  // Read soil moisture
  moistureValue = readAnalogMedian(MOISTURE_SENSOR_PIN, 11);
  // Calibrate based on your sensor and environment
  // Example: map(value, dry_analog_reading, wet_analog_reading, 0, 100)
  soilPct = map(constrain(moistureValue, 1200, 3600), 3600, 1200, 0, 100); 
  soilPct = constrain(soilPct, 0, 100);
  moistureStatus = classifyMoisture(moistureValue);

  // Read rain sensor
  rd_adc = readAnalogMedian(RAINDROP_AO_PIN, 11);
  // Calibrate based on your sensor and environment
  // Example: map(value, dry_analog_reading, wet_analog_reading, 0, 100)
  rd_wetPct = rd_wetPercentFromADC(rd_adc, 4095, 2000); // Assuming 4095 is dry, 2000 is wet
  rd_klas = getRainStatus(rd_wetPct);

  // Read temperature
  sensors.requestTemperatures();
  float t = sensors.getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C) {
    temperature = DEVICE_DISCONNECTED_C; // Indicate error
  } else {
    temperature = t;
  }
  temperatureStatus = getTemperatureStatus(temperature);

  // Print sensor readings to Serial
  Serial.println("=== " + String(DEVICE_ID) + " Sensor Readings ===");
  Serial.println("Distance: " + String(distance) + " cm (" + distanceStatus + ")");
  Serial.println("Soil Moisture: " + String(soilPct) + "% (" + moistureStatus + ")");
  Serial.println("Temperature: " + String(temperature) + "°C (" + temperatureStatus + ")");
  Serial.println("Rain: " + String(rd_wetPct) + "% (" + rd_klas + ")");
  Serial.println("WiFi Signal: " + String(WiFi.RSSI()) + " dBm");
  Serial.println("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");

  // Send data to web server
  sendDataToWebServer();
}

void sendDataToWebServer() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected, skipping web update");
    return;
  }

  Serial.println("Sending data to server...");

  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);
  http.setTimeout(10000); // 10 second timeout

  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["device_name"] = DEVICE_NAME;
  doc["device_location"] = LOCATION;
  doc["distance"] = distance;
  doc["soil_moisture"] = soilPct;
  doc["temperature"] = temperature;
  doc["rain_percentage"] = rd_wetPct;
  doc["wifi_signal"] = WiFi.RSSI();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["firmware_version"] = "2.0.0"; // Example firmware version

  String jsonString;
  serializeJson(doc, jsonString);

  Serial.println("JSON Data: " + jsonString);

  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("HTTP Response Code: " + String(httpResponseCode));
    Serial.println("Response: " + response);
  } else {
    Serial.println("Error sending data: " + String(httpResponseCode));
  }

  http.end();
}

void updateLCD() {
  if(!lcdAwake) return;
  lcd.clear();
  lcd.setCursor(0, 0);
  switch (currentScreen) {
    case 0:
      lcd.print("Jarak Air:");
      lcd.setCursor(0, 1);
      if (distance < 0) lcd.print("Error!");
      else { lcd.print(distance); lcd.print(" cm ("); lcd.print(distanceStatus); lcd.print(")"); }
      break;
    case 1:
      lcd.print("Lembap Tanah:");
      lcd.setCursor(0, 1);
      lcd.print(soilPct); lcd.print("% ("); lcd.print(moistureStatus); lcd.print(")");
      break;
    case 2:
      lcd.print("Suhu Udara:");
      lcd.setCursor(0, 1);
      if (temperature != DEVICE_DISCONNECTED_C) {
        lcd.print(temperature, 1); lcd.print("C ("); lcd.print(temperatureStatus); lcd.print(")");
      } else lcd.print("Error!");
      break;
    case 3:
      lcd.print("Status Hujan:");
      lcd.setCursor(0, 1);
      lcd.print(rd_wetPct); lcd.print("% ("); lcd.print(rd_klas); lcd.print(")");
      break;
  }
  lcd.setCursor(15, 0);
  if (WiFi.status() == WL_CONNECTED) {
    // You might want to add a check for web server connection status here
    lcd.print("O"); // Online
  } else {
    lcd.print("X"); // Offline
  }
}

void lcdSleep() {
  if (!lcdAwake) return;
  lcdAwake = false;
  lcd.noBacklight();
  Serial.println("[LCD] sleep");
}

void lcdWake(bool refreshNow) {
  if (lcdAwake) { lastUserActionMs = millis(); return; }
  lcdAwake = true;
  lcd.backlight();
  lastUserActionMs = millis();
  Serial.println("[LCD] wake");
  if (refreshNow) lcd.clear();
}

int readAnalogMedian(int pin, int samples) {
  samples = constrain(samples, 3, 15);
  int buf[15];
  for (int i = 0; i < samples; i++) buf[i] = analogRead(pin);
  for (int i = 1; i < samples; i++) {
    int k = buf[i], j = i - 1;
    while (j >= 0 && buf[j] > k) { buf[j+1] = buf[j]; j--; }
    buf[j+1] = k;
  }
  return buf[samples/2];
}

String classifyMoisture(int moisture) {
  // Adjust these thresholds based on your sensor and calibration
  if (moisture > 3000)      return "Kering"; // Low analog reading = wet, high = dry
  else if (moisture > 1500) return "Cukup";
  else                      return "Basah";
}

String getDistanceStatus(int d) {
  if (d < 0)         return "Error";
  else if (d < 20)   return "Tinggi";
  else if (d < 80)   return "Normal";
  else               return "Rendah";
}

String getTemperatureStatus(float t) {
  if (t == DEVICE_DISCONNECTED_C) return "Error";
  else if (t < 20)       return "Dingin";
  else if (t < 30)       return "Normal";
  else                   return "Panas";
}

String getRainStatus(int rainPercentage) {
  // rainPercentage is 0-100, 0=dry, 100=wet
  if (rainPercentage < 10) return "Kering";
  else if (rainPercentage < 50) return "Gerimis";
  else return "Hujan";
}

int rd_wetPercentFromADC(int adc, int dryHigh, int wetLow){
  // dryHigh is analog reading when dry, wetLow is analog reading when wet
  adc    = constrain(adc, 0, 4095); // ESP32 ADC range
  wetLow = constrain(wetLow, 0, dryHigh-1);
  long num = (long)(dryHigh - adc) * 100L;
  long den = (long)(dryHigh - wetLow);
  int pct  = (int)(num / den);
  return constrain(pct, 0, 100);
}
';
}

try {
    // Get input data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Invalid JSON data');
    }

    // Validate required fields
    $requiredFields = ['device_id', 'device_name'];
    foreach ($requiredFields as $field) {
        if (!isset($data[$field]) || empty(trim($data[$field]))) {
            throw new Exception("Missing required field: $field");
        }
    }

    // Sanitize input
    $deviceId = sanitizeInput($data['device_id']);
    $deviceName = sanitizeInput($data['device_name']);
    $location = isset($data['location']) ? sanitizeInput($data['location']) : '';
    $description = isset($data['description']) ? sanitizeInput($data['description']) : '';
    $latitude = isset($data['latitude']) ? $data['latitude'] : null;
    $longitude = isset($data['longitude']) ? $data['longitude'] : null;

    // Validate device_id format
    if (!preg_match('/^[A-Za-z0-9_]+$/', $deviceId)) {
        throw new Exception('Device ID can only contain letters, numbers, and underscores');
    }

    // Validate coordinates if provided
    if ($latitude !== null) {
        if (!is_numeric($latitude) || $latitude < -90 || $latitude > 90) {
            throw new Exception('Latitude must be a number between -90 and 90');
        }
        $latitude = (float) $latitude;
    }
    
    if ($longitude !== null) {
        if (!is_numeric($longitude) || $longitude < -180 || $longitude > 180) {
            throw new Exception('Longitude must be a number between -180 and 180');
        }
        $longitude = (float) $longitude;
    }

    $pdo = getDBConnection();

    // Check if device already exists
    $checkSql = "SELECT device_id FROM devices WHERE device_id = ?";
    $checkStmt = $pdo->prepare($checkSql);
    $checkStmt->execute([$deviceId]);

    if ($checkStmt->fetch()) {
        throw new Exception('Device ID already exists');
    }

    // Insert device
    $insertSql = "INSERT INTO devices (device_id, device_name, location, description, latitude, longitude, is_active, created_at, updated_at) 
                  VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())";
    $insertStmt = $pdo->prepare($insertSql);
    $insertStmt->execute([$deviceId, $deviceName, $location, $description, $latitude, $longitude]);

    // Insert device status
    $statusSql = "INSERT INTO device_status (device_id, is_online, firmware_version, created_at, updated_at) VALUES (?, FALSE, '2.0.0', NOW(), NOW())";
    $statusStmt = $pdo->prepare($statusSql);
    $statusStmt->execute([$deviceId]);

    // Generate API key
    $apiKey = generateApiKey($deviceId, $deviceName); // Use the new generateApiKey function

    // Generate ESP32 code
    $espCode = generateEspCode($deviceId, $apiKey, $deviceName, $location);

    logMessage("Device added successfully: $deviceId");
    sendResponse(true, [
        'device_id' => $deviceId,
        'api_key' => $apiKey,
        'esp_code' => $espCode
    ], 'Device added successfully');

} catch (Exception $e) {
    logMessage("Error adding device: " . $e->getMessage());
    http_response_code(400);
    sendResponse(false, null, $e->getMessage());
}
?>