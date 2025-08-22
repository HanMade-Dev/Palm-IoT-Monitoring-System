/***** BLYNK MACROS — HARUS DI ATAS SEBELUM INCLUDE BLYNK *****/
#define BLYNK_TEMPLATE_ID   "TMPL6A_8e3STx"
#define BLYNK_TEMPLATE_NAME "IoTMonitoringSawit"
#define BLYNK_AUTH_TOKEN    "cUnTIhLoHC3QqmPZZTT4-pvbQreAhrql"
#define BLYNK_PRINT Serial   // opsional: debug ke Serial

/***** LIBRARIES *****/
#include <WiFi.h>
#include <BlynkSimpleEsp32.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

/***** WIFI *****/
char auth[] = BLYNK_AUTH_TOKEN;
char ssid[] = "YOUR_WIFI_SSID";        // Ganti dengan nama WiFi Anda
char pass[] = "YOUR_WIFI_PASSWORD";    // Ganti dengan password WiFi Anda

/***** WEB SERVER CONFIG *****/
const char* serverURL = "https://yourdomain.com/api/receive_data.php";  // Ganti dengan domain Anda
const int webUpdateInterval = 5000; // Send data to web server every 5 seconds

/***** DEVICE CONFIG - UBAH SESUAI DEVICE MASING-MASING *****/
const char* DEVICE_ID = "ESP32_SAWIT_01";  // Ubah untuk setiap device: ESP32_SAWIT_01, ESP32_SAWIT_02, dst
const char* DEVICE_NAME = "Sensor Utama";  // Nama device untuk display LCD
const char* DEVICE_LOCATION = "Area Utama"; // Lokasi device

/***** PIN DEFINITIONS *****/
#define TRIG_PIN 23
#define ECHO_PIN 19
#define MOISTURE_SENSOR_PIN 34
#define ONE_WIRE_BUS 4
#define RAINDROP_AO_PIN 35
#define BUTTON_PIN 18   // tombol

/***** LCD I2C *****/
LiquidCrystal_I2C lcd(0x27, 16, 2);

/***** OBJECTS *****/
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
BlynkTimer timer;

/***** VARIABEL GLOBAL *****/
long  duration;
int   distance        = -1;
String distanceStatus = "Unknown";
int   moistureValue   = 0;
String moistureStatus = "N/A";
int   soilPct         = 0;
float temperature     = DEVICE_DISCONNECTED_C;
String temperatureStatus = "Unknown";
int   rd_adc          = 0;
int   rd_wetPct       = 0;
const char* rd_klas   = "N/A";
bool  rd_isRaining    = false;

int currentScreen = 0;
const int TOTAL_SCREENS = 5; // Increased for device info screen

// Variabel debouncing untuk switch
int lastStableState = HIGH;
int lastReading     = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

// Kalibrasi Rain Drop
const int   RD_ADC_MAX      = 4095;
const float RD_VREF         = 3.30f;
int   rd_thresholdWet   = 2100;
int   rd_thresholdDry   = 3850;

// Web server communication
unsigned long lastWebUpdate = 0;
bool webServerConnected = false;

// Error counters
int tempReadErrors = 0;
int distanceReadErrors = 0;
const int MAX_READ_ERRORS = 5;

/***** UTILITIES *****/
int readAnalogMedian(int pin, int samples = 9) {
  samples = max(3, samples | 1);
  samples = min(samples, 31);
  int buf[31];
  for (int i = 0; i < samples; i++) { buf[i] = analogRead(pin); delay(2); }
  for (int i = 1; i < samples; i++) {
    int k = buf[i], j = i - 1;
    while (j >= 0 && buf[j] > k) { buf[j+1] = buf[j]; j--; }
    buf[j+1] = k;
  }
  return buf[samples/2];
}

String classifyMoisture(int moisture) {
  if (moisture > 3000)      return "Kering";
  else if (moisture > 1500) return "Cukup";
  else                      return "Basah";
}

String getDistanceStatus(int distance) {
  if (distance < 0)         return "Error";
  else if (distance < 20)   return "Tinggi";
  else if (distance < 80)   return "Normal";
  else                      return "Rendah";
}

String getTemperatureStatus(float temp) {
  if (temp == DEVICE_DISCONNECTED_C) return "Error";
  else if (temp < 20)       return "Dingin";
  else if (temp < 30)       return "Normal";
  else                      return "Panas";
}

int rd_wetPercentFromADC(int adc, int dryHigh=4095, int wetLow=2000){
  adc    = constrain(adc, 0, RD_ADC_MAX);
  wetLow = constrain(wetLow, 0, dryHigh-1);
  long num = (long)(dryHigh - adc) * 100L;
  long den = (long)(dryHigh - wetLow);
  int pct  = (int)(num / den);
  return constrain(pct, 0, 100);
}

/***** WEB SERVER COMMUNICATION *****/
void sendDataToWebServer() {
  if (WiFi.status() != WL_CONNECTED) {
    webServerConnected = false;
    Serial.println("WiFi not connected, skipping web update");
    return;
  }
  
  HTTPClient http;
  http.begin(serverURL);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload with all statuses
  StaticJsonDocument<500> doc;
  doc["device_id"] = DEVICE_ID;
  doc["distance"] = distance;
  doc["distance_status"] = distanceStatus;
  doc["soil_moisture"] = soilPct;
  doc["moisture_status"] = moistureStatus;
  doc["temperature"] = (temperature == DEVICE_DISCONNECTED_C) ? "DEVICE_DISCONNECTED_C" : temperature;
  doc["temperature_status"] = temperatureStatus;
  doc["rain_percentage"] = rd_wetPct;
  doc["rain_status"] = rd_klas;
  doc["wifi_signal"] = WiFi.RSSI();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["firmware_version"] = "2.0.0";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Sending data to web server:");
  Serial.println(jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Web server response code: " + String(httpResponseCode));
    Serial.println("Response: " + response);
    
    if (httpResponseCode == 200) {
      webServerConnected = true;
      Serial.println("Data sent to web server successfully");
    } else {
      webServerConnected = false;
      Serial.println("Web server returned error code: " + String(httpResponseCode));
    }
  } else {
    webServerConnected = false;
    Serial.println("Error sending data to web server: " + String(httpResponseCode));
    Serial.println("HTTP error: " + http.errorToString(httpResponseCode));
  }
  
  http.end();
}

/***** LCD UPDATE *****/
void updateLCD() {
  lcd.clear();
  lcd.setCursor(0, 0);

  switch (currentScreen) {
    case 0: // Device Info Screen
      lcd.print(DEVICE_NAME);
      lcd.setCursor(0, 1);
      lcd.print(DEVICE_LOCATION);
      break;

    case 1: // Distance Screen
      lcd.print("Jarak Air:");
      lcd.setCursor(0, 1);
      if (distance < 0) lcd.print("Error!");
      else { 
        lcd.print(distance); 
        lcd.print(" cm (");
        lcd.print(distanceStatus);
        lcd.print(")");
      }
      break;

    case 2: // Moisture Screen
      lcd.print("Lembap Tanah:");
      lcd.setCursor(0, 1);
      lcd.print(soilPct);
      lcd.print("% (");
      lcd.print(moistureStatus);
      lcd.print(")");
      break;

    case 3: // Temperature Screen
      lcd.print("Suhu Udara:");
      lcd.setCursor(0, 1);
      if (temperature != DEVICE_DISCONNECTED_C) {
        lcd.print(temperature, 1); 
        lcd.print("C (");
        lcd.print(temperatureStatus);
        lcd.print(")");
      } else {
        lcd.print("Error!");
      }
      break;

    case 4: // Rain Screen
      lcd.print("Status Hujan:");
      lcd.setCursor(0, 1);
      lcd.print(rd_wetPct);
      lcd.print("% (");
      lcd.print(rd_klas);
      lcd.print(")");
      break;
  }
  
  // Show connection status indicator
  lcd.setCursor(15, 0);
  if (WiFi.status() == WL_CONNECTED) {
    if (webServerConnected) {
      lcd.print("*"); // Connected to both WiFi and web server
    } else {
      lcd.print("?"); // WiFi connected but web server issues
    }
  } else {
    lcd.print("X"); // No WiFi connection
  }
}

/***** IMPROVED SENSOR READING *****/
void readSensorsAndSendData() {
  // Read ultrasonic sensor (with improved timing and error handling)
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(5);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  duration = pulseIn(ECHO_PIN, HIGH, 30000UL);
  
  if (duration == 0) {
    distanceReadErrors++;
    if (distanceReadErrors >= MAX_READ_ERRORS) {
      distance = -1;
      distanceStatus = "Error";
    }
  } else {
    distance = duration * 0.0344 / 2;
    distanceStatus = getDistanceStatus(distance);
    distanceReadErrors = 0; // Reset error counter on successful read
  }

  // Delay between sensor readings to avoid conflicts
  delay(100);

  // Read moisture sensor (with averaging for stability)
  int moistureSum = 0;
  for(int i = 0; i < 5; i++) {
    moistureSum += analogRead(MOISTURE_SENSOR_PIN);
    delay(20);
  }
  moistureValue = moistureSum / 5;
  moistureStatus = classifyMoisture(moistureValue);
  soilPct = map(moistureValue, 4095, 0, 0, 100);
  soilPct = constrain(soilPct, 0, 100);

  // Delay before temperature reading
  delay(100);

  // Read temperature sensor (with improved error handling and retry)
  sensors.requestTemperatures();
  delay(750); // Wait for temperature conversion (DS18B20 needs 750ms)
  temperature = sensors.getTempCByIndex(0);
  
  // Retry mechanism for temperature sensor
  if (temperature == DEVICE_DISCONNECTED_C) {
    tempReadErrors++;
    if (tempReadErrors < MAX_READ_ERRORS) {
      delay(200);
      sensors.requestTemperatures();
      delay(750);
      temperature = sensors.getTempCByIndex(0);
    }
    
    if (temperature == DEVICE_DISCONNECTED_C) {
      temperatureStatus = "Error";
    } else {
      temperatureStatus = getTemperatureStatus(temperature);
      tempReadErrors = 0; // Reset error counter on successful read
    }
  } else {
    temperatureStatus = getTemperatureStatus(temperature);
    tempReadErrors = 0; // Reset error counter on successful read
  }

  // Delay before rain sensor reading
  delay(100);

  // Read rain sensor
  rd_adc = readAnalogMedian(RAINDROP_AO_PIN, 11);
  if (!rd_isRaining && rd_adc <= rd_thresholdWet) rd_isRaining = true;
  if ( rd_isRaining && rd_adc >= rd_thresholdDry) rd_isRaining = false;
  rd_wetPct = rd_wetPercentFromADC(rd_adc, 4095, 2000);
  if (rd_adc >= rd_thresholdDry)        rd_klas = "Kering";
  else if (rd_adc <= rd_thresholdWet)   rd_klas = "Hujan";
  else                                  rd_klas = "Cukup";

  // Send to Blynk (with all statuses)
  if (distance >= 0) {
    Blynk.virtualWrite(V0, distance);
    Blynk.virtualWrite(V6, distanceStatus);
  }
  Blynk.virtualWrite(V1, soilPct);
  Blynk.virtualWrite(V2, moistureStatus);
  if (temperature != DEVICE_DISCONNECTED_C) {
    Blynk.virtualWrite(V3, temperature);
    Blynk.virtualWrite(V7, temperatureStatus);
  }
  Blynk.virtualWrite(V4, rd_wetPct);
  Blynk.virtualWrite(V5, rd_klas);

  // Send to web server
  if (millis() - lastWebUpdate >= webUpdateInterval) {
    sendDataToWebServer();
    lastWebUpdate = millis();
  }

  updateLCD();
  
  // Enhanced Serial output for debugging and serial port communication
  Serial.println("=== " + String(DEVICE_ID) + " Sensor Readings ===");
  Serial.println("Distance: " + String(distance) + " cm (" + distanceStatus + ")");
  Serial.println("Soil Moisture: " + String(soilPct) + "% (" + moistureStatus + ")");
  Serial.println("Temperature: " + String(temperature) + "°C (" + temperatureStatus + ")");
  Serial.println("Rain: " + String(rd_wetPct) + "% (" + String(rd_klas) + ")");
  Serial.println("WiFi Signal: " + String(WiFi.RSSI()) + " dBm");
  Serial.println("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  Serial.println("Web Server: " + String(webServerConnected ? "Connected" : "Disconnected"));
  Serial.println("Temp Errors: " + String(tempReadErrors) + "/" + String(MAX_READ_ERRORS));
  Serial.println("Distance Errors: " + String(distanceReadErrors) + "/" + String(MAX_READ_ERRORS));
  Serial.println("========================");
  
  // Also output JSON for web serial parsing
  StaticJsonDocument<400> serialDoc;
  serialDoc["device_id"] = DEVICE_ID;
  serialDoc["distance"] = distance;
  serialDoc["distance_status"] = distanceStatus;
  serialDoc["soil_moisture"] = soilPct;
  serialDoc["moisture_status"] = moistureStatus;
  serialDoc["temperature"] = (temperature == DEVICE_DISCONNECTED_C) ? "DEVICE_DISCONNECTED_C" : temperature;
  serialDoc["temperature_status"] = temperatureStatus;
  serialDoc["rain_percentage"] = rd_wetPct;
  serialDoc["rain_status"] = rd_klas;
  
  String serialJsonString;
  serializeJson(serialDoc, serialJsonString);
  Serial.println("JSON: " + serialJsonString);
}

/***** SETUP *****/
void setup() {
  Serial.begin(115200);
  
  // Initialize LCD with device info
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print(DEVICE_NAME);
  lcd.setCursor(0, 1);
  lcd.print("Menyambung...");

  // Initialize pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Initialize sensors
  sensors.begin();

  // Initialize ADC
  analogReadResolution(12);
  analogSetPinAttenuation(MOISTURE_SENSOR_PIN, ADC_11db);
  analogSetPinAttenuation(RAINDROP_AO_PIN,     ADC_11db);
  pinMode(MOISTURE_SENSOR_PIN, INPUT);
  pinMode(RAINDROP_AO_PIN,     INPUT);

  // Connect to WiFi and Blynk
  Serial.println("Device ID: " + String(DEVICE_ID));
  Serial.println("Device Name: " + String(DEVICE_NAME));
  Serial.println("Location: " + String(DEVICE_LOCATION));
  Serial.println("Connecting to WiFi: " + String(ssid));
  
  WiFi.begin(ssid, pass);
  
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 20) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi connected!");
    Serial.println("IP address: " + WiFi.localIP().toString());
    Serial.println("Server URL: " + String(serverURL));
    
    // Initialize Blynk
    Blynk.begin(auth, ssid, pass);
    
    lcd.setCursor(0, 1);
    lcd.print("WiFi OK         ");
  } else {
    Serial.println();
    Serial.println("WiFi connection failed!");
    lcd.setCursor(0, 1);
    lcd.print("WiFi GAGAL      ");
  }

  // Set timer for sensor readings (reduced to 3 seconds for better responsiveness)
  timer.setInterval(3000L, readSensorsAndSendData);

  delay(2000);
  lcd.clear();
}

/***** LOOP *****/
void loop() {
  // Run Blynk (only if WiFi connected)
  if (WiFi.status() == WL_CONNECTED) {
    Blynk.run();
  }
  
  timer.run();

  // Handle button press for LCD screen switching
  int reading = digitalRead(BUTTON_PIN);

  if (reading != lastReading) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (reading != lastStableState) {
      lastStableState = reading;

      if (lastStableState == LOW) {
        currentScreen = (currentScreen + 1) % TOTAL_SCREENS;
        updateLCD();
        Serial.print("Tombol ditekan, pindah ke layar: ");
        Serial.println(currentScreen);
      }
    }
  }

  lastReading = reading;

  // Enhanced WiFi connection monitoring and automatic reconnection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi connection lost. Attempting to reconnect...");
    WiFi.begin(ssid, pass);
    
    int reconnectAttempts = 0;
    while (WiFi.status() != WL_CONNECTED && reconnectAttempts < 10) {
      delay(1000);
      Serial.print(".");
      reconnectAttempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println();
      Serial.println("WiFi reconnected!");
      Serial.println("IP address: " + WiFi.localIP().toString());
      webServerConnected = false; // Reset web server status
    } else {
      Serial.println();
      Serial.println("WiFi reconnection failed!");
    }
  }
}

/***** BLYNK FUNCTIONS (Enhanced for remote control) *****/
// Remote threshold control
BLYNK_WRITE(V10) {
  rd_thresholdWet = param.asInt();
  Serial.println("Rain wet threshold updated: " + String(rd_thresholdWet));
}

BLYNK_WRITE(V11) {
  rd_thresholdDry = param.asInt();
  Serial.println("Rain dry threshold updated: " + String(rd_thresholdDry));
}

// Remote reboot function
BLYNK_WRITE(V12) {
  if (param.asInt() == 1) {
    Serial.println("Remote reboot requested...");
    ESP.restart();
  }
}

// Remote device info request
BLYNK_WRITE(V13) {
  if (param.asInt() == 1) {
    Blynk.virtualWrite(V14, DEVICE_ID);
    Blynk.virtualWrite(V15, DEVICE_NAME);
    Blynk.virtualWrite(V16, DEVICE_LOCATION);
    Blynk.virtualWrite(V17, WiFi.localIP().toString());
    Blynk.virtualWrite(V18, ESP.getFreeHeap());
  }
}