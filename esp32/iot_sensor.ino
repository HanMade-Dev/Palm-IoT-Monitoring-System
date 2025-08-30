
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// WiFi credentials - GANTI DENGAN KREDENSIAL WIFI ANDA
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server configuration - GANTI DENGAN URL SERVER ANDA
const char* serverURL = "http://your-server.com/api/receive_data.php";
const char* apiKey = "YOUR_API_KEY"; // Didapat dari dashboard saat menambah device

// Device information - GANTI SESUAI DEVICE ANDA
const String deviceId = "ESP32_SAWIT_01";
const String deviceName = "Sensor Area Utara";
const String deviceLocation = "Kebun Blok A";

// Pin definitions
#define SOIL_MOISTURE_PIN A0
#define RAIN_SENSOR_PIN A1
#define ULTRASONIC_TRIG_PIN 2
#define ULTRASONIC_ECHO_PIN 3
#define TEMP_SENSOR_PIN 4

// Temperature sensor setup
OneWire oneWire(TEMP_SENSOR_PIN);
DallasTemperature tempSensor(&oneWire);

// Timing
unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 10000; // 10 seconds

// Status LED
#define STATUS_LED 2

void setup() {
  Serial.begin(115200);
  
  // Initialize pins
  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);
  pinMode(STATUS_LED, OUTPUT);
  
  // Initialize temperature sensor
  tempSensor.begin();
  
  // Connect to WiFi
  Serial.println("=== IoT Kelapa Sawit Monitor ===");
  Serial.println("Device ID: " + deviceId);
  Serial.println("Device Name: " + deviceName);
  Serial.println("Location: " + deviceLocation);
  Serial.println();
  
  connectToWiFi();
  
  Serial.println("Setup completed successfully!");
  Serial.println("Starting sensor readings...");
  Serial.println();
}

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, reconnecting...");
    connectToWiFi();
  }
  
  // Read and send sensor data
  if (millis() - lastSensorRead >= SENSOR_INTERVAL) {
    readAndSendSensorData();
    lastSensorRead = millis();
  }
  
  // Blink status LED to show device is alive
  blinkStatusLED();
  
  delay(100);
}

void connectToWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi connected successfully!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal strength: ");
    Serial.println(WiFi.RSSI());
    digitalWrite(STATUS_LED, HIGH);
  } else {
    Serial.println("");
    Serial.println("Failed to connect to WiFi!");
    digitalWrite(STATUS_LED, LOW);
  }
}

void readAndSendSensorData() {
  Serial.println("--- Reading Sensors ---");
  
  // Read all sensors
  int soilMoisture = readSoilMoisture();
  int rainPercentage = readRainSensor();
  float temperature = readTemperature();
  int distance = readUltrasonic();
  
  // Display readings
  Serial.println("Sensor Readings:");
  Serial.println("- Soil Moisture: " + String(soilMoisture) + "%");
  Serial.println("- Rain: " + String(rainPercentage) + "%");
  Serial.println("- Temperature: " + String(temperature) + "°C");
  Serial.println("- Water Distance: " + String(distance) + " cm");
  Serial.println("- WiFi Signal: " + String(WiFi.RSSI()) + " dBm");
  Serial.println("- Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  
  // Send data to server
  sendDataToServer(soilMoisture, rainPercentage, temperature, distance);
  
  Serial.println("----------------------");
  Serial.println();
}

void sendDataToServer(int soilMoisture, int rainPercentage, float temperature, int distance) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected, skipping data transmission");
    return;
  }
  
  // Create JSON payload
  DynamicJsonDocument doc(1024);
  doc["device_id"] = deviceId;
  doc["device_name"] = deviceName;
  doc["device_location"] = deviceLocation;
  doc["soil_moisture"] = soilMoisture;
  doc["moisture_status"] = getMoistureStatus(soilMoisture);
  doc["rain_percentage"] = rainPercentage;
  doc["rain_status"] = getRainStatus(rainPercentage);
  doc["temperature"] = temperature;
  doc["temperature_status"] = getTemperatureStatus(temperature);
  doc["distance"] = distance;
  doc["distance_status"] = getDistanceStatus(distance);
  doc["wifi_signal"] = WiFi.RSSI();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["firmware_version"] = "2.0.0";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Send HTTP POST request
  HTTPClient http;
  http.begin(serverURL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", apiKey);
  http.setTimeout(10000); // 10 second timeout
  
  Serial.println("Sending data to server...");
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("✓ Data sent successfully!");
    Serial.println("HTTP Response: " + String(httpResponseCode));
    
    // Parse response to check if successful
    DynamicJsonDocument responseDoc(512);
    deserializeJson(responseDoc, response);
    
    if (responseDoc["success"]) {
      Serial.println("✓ Server confirmed data received");
      digitalWrite(STATUS_LED, HIGH);
    } else {
      Serial.println("⚠ Server error: " + String(responseDoc["message"].as<String>()));
    }
  } else {
    Serial.println("✗ HTTP Error: " + String(httpResponseCode));
    Serial.println("Error: " + http.errorToString(httpResponseCode));
    digitalWrite(STATUS_LED, LOW);
  }
  
  http.end();
}

int readSoilMoisture() {
  int raw = analogRead(SOIL_MOISTURE_PIN);
  // Convert to percentage (adjust these values based on your sensor calibration)
  // Dry soil = high resistance = high reading = low moisture
  // Wet soil = low resistance = low reading = high moisture
  int moisture = map(raw, 0, 4095, 100, 0); // ESP32 has 12-bit ADC (0-4095)
  return constrain(moisture, 0, 100);
}

int readRainSensor() {
  int raw = analogRead(RAIN_SENSOR_PIN);
  // Convert to percentage (adjust based on your sensor)
  int rain = map(raw, 0, 4095, 0, 100);
  return constrain(rain, 0, 100);
}

float readTemperature() {
  tempSensor.requestTemperatures();
  float temp = tempSensor.getTempCByIndex(0);
  
  // Check if reading is valid
  if (temp == DEVICE_DISCONNECTED_C) {
    Serial.println("⚠ Temperature sensor error!");
    return -999; // Error value
  }
  
  return temp;
}

int readUltrasonic() {
  // Send trigger pulse
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  
  // Read echo pulse
  long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, 30000); // 30ms timeout
  
  if (duration == 0) {
    Serial.println("⚠ Ultrasonic sensor timeout!");
    return -1; // Error value
  }
  
  // Calculate distance in cm
  int distance = duration * 0.034 / 2;
  
  // Validate distance (HC-SR04 range is 2-400cm)
  if (distance < 2 || distance > 400) {
    return -1; // Out of range
  }
  
  return distance;
}

String getMoistureStatus(int moisture) {
  if (moisture < 30) return "Kering";
  if (moisture < 60) return "Sedang";
  return "Basah";
}

String getRainStatus(int rain) {
  if (rain < 20) return "Cerah";
  if (rain < 60) return "Gerimis";
  return "Hujan";
}

String getTemperatureStatus(float temp) {
  if (temp == -999) return "Error";
  if (temp < 20) return "Dingin";
  if (temp < 30) return "Normal";
  if (temp < 35) return "Hangat";
  return "Panas";
}

String getDistanceStatus(int distance) {
  if (distance == -1) return "Error";
  if (distance < 20) return "Tinggi";
  if (distance < 50) return "Sedang";
  return "Rendah";
}

void blinkStatusLED() {
  static unsigned long lastBlink = 0;
  static bool ledState = false;
  
  if (millis() - lastBlink > 2000) { // Blink every 2 seconds
    ledState = !ledState;
    digitalWrite(STATUS_LED, ledState);
    lastBlink = millis();
  }
}
