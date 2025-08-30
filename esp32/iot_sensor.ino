
/***** LIBRARIES *****/
#include <WiFi.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Ticker.h>

/***** WIFI *****/
const char* ssid = "Mulkan";  // Ganti dengan SSID WiFi Anda
const char* password = "14171225";  // Ganti dengan password WiFi Anda

/***** WEB SERVER CONFIG *****/
const String DEVICE_ID = "DEVICE_TEST";
const String DEVICE_NAME = "Sensor Test";
const String LOCATION = "Area Test";
const String API_KEY = "1f11fa20102377bc01ea17d87311604be3cdf56083139026472af0db6f6db6a0";
const String API_URL = "http://iotmonitoringbycodev.my.id/api/receive_data.php";
const uint32_t webUpdateInterval = 10000;  // 10 detik

/***** PIN DEFINITIONS *****/
#define TRIG_PIN 23
#define ECHO_PIN 19
#define MOISTURE_SENSOR_PIN 34
#define ONE_WIRE_BUS 4
#define RAINDROP_AO_PIN 35
#define BUTTON_PIN 18

/***** LCD I2C *****/
LiquidCrystal_I2C lcd(0x27, 16, 2);

/***** OBJECTS *****/
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
Ticker ticker;

/***** KOMUNIKASI/STATUS *****/
unsigned long lastWebUpdate = 0;
bool webServerConnected = false;
int connectionRetries = 0;
const int maxRetries = 3;

/***** VARIABEL GLOBAL SENSOR *****/
long  duration;
int   distance        = -1;
String distanceStatus = "Unknown";

int   moistureValue   = 0;
int   soilPct         = 0;
String moistureStatus = "Unknown";

float temperature     = DEVICE_DISCONNECTED_C;
String temperatureStatus = "Unknown";

/***** RAIN SENSOR *****/
int   rd_adc    = 0;
int   rd_wetPct = 0;
String rd_klas = "Unknown";
bool  rd_isRaining = false;

/***** LAYAR *****/
int currentScreen = 0;
const int TOTAL_SCREENS = 4;

/***** TOMBOL (debounce) *****/
int lastStableState = HIGH;
int lastReading     = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

/***** RainDrop Calibration *****/
const int   RD_ADC_MAX      = 4095;
int         rd_thresholdWet = 2100;
int         rd_thresholdDry = 3850;

/***** Error Counters *****/
int tempReadErrors = 0;
int distanceReadErrors = 0;
const int MAX_READ_ERRORS = 5;

/***** LCD AUTO SLEEP CONFIG *****/
#define LCD_SLEEP_TIMEOUT_MS   30000UL
#define LCD_WAKE_ON_FIRST_PRESS 1
bool lcdAwake = true;
unsigned long lastUserActionMs = 0;

/***** UTILITIES *****/
int readAnalogMedian(int pin, int samples=11) {
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
  if (moisture > 3000)      return "Kering";
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

int rd_wetPercentFromADC(int adc, int dryHigh=4095, int wetLow=2000){
  adc    = constrain(adc, 0, RD_ADC_MAX);
  wetLow = constrain(wetLow, 0, dryHigh-1);
  long num = (long)(dryHigh - adc) * 100L;
  long den = (long)(dryHigh - wetLow);
  int pct  = (int)(num / den);
  return constrain(pct, 0, 100);
}

/***** LCD POWER HELPERS *****/
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

/***** KIRIM DATA KE WEB *****/
void sendDataToWebServer() {
  if (WiFi.status() != WL_CONNECTED) {
    webServerConnected = false;
    Serial.println("WiFi not connected, attempting reconnection...");
    reconnectWiFi();
    return;
  }

  Serial.println("=== " + DEVICE_ID + " Sensor Readings ===");
  Serial.println("Device Name: " + DEVICE_NAME);
  Serial.println("Location: " + LOCATION);
  Serial.println("Distance: " + String(distance) + " cm (" + distanceStatus + ")");
  Serial.println("Soil Moisture: " + String(soilPct) + "% (" + moistureStatus + ")");
  Serial.println("Temperature: " + String(temperature) + "°C (" + temperatureStatus + ")");
  Serial.println("Rain: " + String(rd_wetPct) + "% (" + rd_klas + ")");
  Serial.println("WiFi Signal: " + String(WiFi.RSSI()) + " dBm");
  Serial.println("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");

  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);
  http.setTimeout(15000);  // 15 second timeout

  StaticJsonDocument<1024> doc;
  doc["device_id"] = DEVICE_ID;
  doc["device_name"] = DEVICE_NAME;
  doc["device_location"] = LOCATION;
  doc["distance"] = distance;
  doc["soil_moisture"] = soilPct;
  doc["moisture_status"] = moistureStatus;
  
  if (temperature == DEVICE_DISCONNECTED_C) {
    doc["temperature"] = nullptr;
  } else {
    doc["temperature"] = temperature;
  }
  
  doc["rain_percentage"] = rd_wetPct;
  doc["rain_status"] = rd_klas;
  doc["wifi_signal"] = WiFi.RSSI();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["firmware_version"] = "2.1.0";

  String jsonString;
  serializeJson(doc, jsonString);

  Serial.println("Sending JSON: " + jsonString);

  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("HTTP Response Code: " + String(httpResponseCode));
    Serial.println("Response: " + response);
    
    if (httpResponseCode == 200) {
      webServerConnected = true;
      connectionRetries = 0;
      Serial.println("✓ Data sent successfully!");
    } else {
      webServerConnected = false;
      Serial.println("✗ Server error: " + String(httpResponseCode));
    }
  } else {
    webServerConnected = false;
    connectionRetries++;
    Serial.println("✗ Connection failed. Error: " + String(httpResponseCode));
    Serial.println("Retry count: " + String(connectionRetries));
    
    if (connectionRetries >= maxRetries) {
      Serial.println("Max retries reached. Will try to reconnect WiFi next time.");
      connectionRetries = 0;
    }
  }

  http.end();
}

/***** WiFi RECONNECTION *****/
void reconnectWiFi() {
  Serial.println("Attempting WiFi reconnection...");
  WiFi.disconnect();
  delay(1000);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi reconnected successfully!");
    Serial.println("IP address: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi reconnection failed!");
  }
}

/***** LCD UPDATE *****/
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
  
  // Status indicator
  lcd.setCursor(15, 0);
  if (WiFi.status() == WL_CONNECTED) {
    if (webServerConnected) lcd.print("*"); 
    else lcd.print("?");
  } else {
    lcd.print("X");
  }
}

/***** SENSOR READING *****/
void sampleSensors() {
  Serial.println("=== Reading Sensors ===");

  // Read ultrasonic sensor
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
    distanceReadErrors = 0;
    distance = (int)(duration * 0.0343f / 2.0f);
    distance = constrain(distance, 0, 500); // Limit to reasonable range
    distanceStatus = getDistanceStatus(distance);
  }

  // Read soil moisture
  moistureValue = readAnalogMedian(MOISTURE_SENSOR_PIN, 11);
  soilPct = map(constrain(moistureValue, 1200, 3600), 3600, 1200, 0, 100);
  soilPct = constrain(soilPct, 0, 100);
  moistureStatus = classifyMoisture(moistureValue);

  // Read rain sensor
  rd_adc = readAnalogMedian(RAINDROP_AO_PIN, 11);
  if (!rd_isRaining && rd_adc <= rd_thresholdWet) rd_isRaining = true;
  if ( rd_isRaining && rd_adc >= rd_thresholdDry) rd_isRaining = false;
  rd_wetPct = rd_wetPercentFromADC(rd_adc, 4095, 2000);

  if (rd_adc >= rd_thresholdDry) rd_klas = "Kering";
  else if (rd_adc <= rd_thresholdWet) rd_klas = "Hujan";
  else rd_klas = "Cukup";

  // Read temperature
  sensors.requestTemperatures();
  delay(750); // Wait for conversion
  float t = sensors.getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C || t < -50 || t > 100) {
    tempReadErrors++;
    if (tempReadErrors >= MAX_READ_ERRORS) {
      temperature = DEVICE_DISCONNECTED_C;
      temperatureStatus = "Error";
    }
  } else {
    temperature = t;
    temperatureStatus = getTemperatureStatus(t);
    tempReadErrors = 0;
  }

  // Send to web server
  if (millis() - lastWebUpdate >= webUpdateInterval) {
    sendDataToWebServer();
    lastWebUpdate = millis();
  }

  if (lcdAwake) updateLCD();
}

/***** SETUP *****/
void setup() {
  Serial.begin(115200);
  Serial.println("=== IoT Kelapa Sawit Monitor v2.1.0 ===");
  Serial.println("Device ID: " + DEVICE_ID);
  Serial.println("Device Name: " + DEVICE_NAME);
  Serial.println("Location: " + LOCATION);

  Wire.begin();
  lcd.init(); 
  lcd.backlight();
  lcd.setCursor(0, 0); 
  lcd.print(DEVICE_NAME);
  lcd.setCursor(0, 1); 
  lcd.print("Menyambung...");

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  sensors.begin(); 
  sensors.setWaitForConversion(false);

  analogReadResolution(12);
  analogSetPinAttenuation(MOISTURE_SENSOR_PIN, ADC_11db);
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
    lcd.print("WiFi GAGAL      ");
  }

  // Start sensor reading
  ticker.attach_ms(5000, sampleSensors);  // Read sensors every 5 seconds

  delay(2000); 
  lcd.clear();
  lcdAwake = true;
  lastUserActionMs = millis();

  Serial.println("Setup completed. Starting monitoring...");
}

/***** LOOP *****/
void loop() {
  int reading = digitalRead(BUTTON_PIN);
  if (reading != lastReading) lastDebounceTime = millis();

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (reading != lastStableState) {
      lastStableState = reading;
      if (lastStableState == LOW) {
        lastUserActionMs = millis();
#if LCD_WAKE_ON_FIRST_PRESS
        if (!lcdAwake) { 
          lcdWake(true); 
          updateLCD(); 
        } else { 
          currentScreen = (currentScreen + 1) % TOTAL_SCREENS; 
          updateLCD(); 
        }
#else
        if (!lcdAwake) lcdWake(false);
        currentScreen = (currentScreen + 1) % TOTAL_SCREENS; 
        updateLCD();
#endif
        Serial.print("BTN -> screen "); 
        Serial.println(currentScreen);
      }
    }
  }
  lastReading = reading;

  if (lcdAwake && (millis() - lastUserActionMs >= LCD_SLEEP_TIMEOUT_MS)) {
    lcdSleep();
  }

  // Check WiFi connection periodically
  static unsigned long lastWifiCheck = 0;
  if (millis() - lastWifiCheck > 30000) { // Check every 30 seconds
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("WiFi disconnected. Attempting to reconnect...");
      reconnectWiFi();
    }
    lastWifiCheck = millis();
  }
}
