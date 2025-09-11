/***** LIBRARIES *****/
#include <WiFi.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Ticker.h>
#include <HardwareSerial.h> // Tambahkan untuk SIM800L

/***** WIFI *****/
char ssid[] = "Mulka";  // Ganti dengan SSID WiFi Anda
char pass[] = "14171225";  // Ganti dengan password WiFi Anda

/***** WEB SERVER CONFIG *****/
const String API_URL = "https://iotmonitoringbycodev.my.id/api/receive_data.php";
const String API_URL_HTTP = "http://iotmonitoringbycodev.my.id/api/receive_data.php"; // Untuk SIM800L menggunakan HTTP
const uint32_t SENSOR_READ_INTERVAL_MS = 5000;  // Baca sensor setiap 5 detik
const uint32_t WEB_UPDATE_INTERVAL_MS = 10000; // Kirim data ke web setiap 10 detik

const String DEVICE_ID = "DEVICE_TEST"; 
const String DEVICE_NAME = "Sensor Test";
const String LOCATION = "Area Test"; 
const String API_KEY = "ec268cf585e0ed97afff8bf9319ba1b08aa4e3ca6bae079f23b594f6fef0b3de"; // API Key device ini

/***** SIM800L CONFIG *****/
#define MODEM_TX 17   // ESP32 TX2 -> SIM800L RX
#define MODEM_RX 16   // ESP32 RX2 <- SIM800L TX
HardwareSerial sim800l(1);
const char apn[] = "internet"; // APN Telkomsel

/***** PIN DEFINITIONS *****/
#define TRIG_PIN 23
#define ECHO_PIN 19
#define MOISTURE_SENSOR_PIN 34
#define ONE_WIRE_BUS 4
#define RAINDROP_AO_PIN 35
#define BUTTON_PIN 18 // Contoh pin untuk tombol navigasi LCD

/***** LCD I2C *****/
// Sesuaikan alamat I2C jika 0x27 tidak berfungsi (umumnya 0x3F atau 0x27)
LiquidCrystal_I2C lcd(0x27, 16, 2);

/***** OBJECTS *****/
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
Ticker ticker; // Untuk penjadwalan pembacaan sensor

/***** VARIABEL GLOBAL SENSOR *****/
long  duration;
int   distance        = -1; // -1 menandakan error atau tidak ada data
String distanceStatus = "Unknown";

int   moistureValue   = 0;
int   soilPct         = 0; // Persentase kelembaban tanah (0-100)
String moistureStatus = "Unknown";

float temperature     = DEVICE_DISCONNECTED_C; // DEVICE_DISCONNECTED_C dari DallasTemperature library
String temperatureStatus = "Unknown";

int   rd_adc    = 0; // Pembacaan analog dari sensor hujan
int   rd_wetPct = 0; // Persentase kebasahan hujan (0-100)
String rd_klas = "Unknown"; // Klasifikasi status hujan

/***** LAYAR LCD *****/
int currentScreen = 0;
const int TOTAL_SCREENS = 4; // Jumlah layar informasi yang akan ditampilkan

/***** TOMBOL (debounce) *****/
int lastStableState = HIGH;
int lastReading     = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50; // Waktu debounce untuk tombol

/***** RainDrop Calibration *****/
// Sesuaikan nilai ini berdasarkan kalibrasi sensor hujan Anda
// RD_ADC_MAX adalah nilai analog maksimum (4095 untuk ESP32 12-bit ADC)
// rd_thresholdWet adalah nilai ADC saat sensor basah (misal: 2000)
// rd_thresholdDry adalah nilai ADC saat sensor kering (misal: 3850)
const int   RD_ADC_MAX      = 4095;
const int   RD_WET_ANALOG_READING = 2000; // Analog reading when sensor is wet (lower value)
const int   RD_DRY_ANALOG_READING = 3850; // Analog reading when sensor is dry (higher value)

/***** LCD AUTO SLEEP CONFIG *****/
#define LCD_SLEEP_TIMEOUT_MS   30000UL // LCD akan mati setelah 30 detik tidak ada interaksi
bool lcdAwake = true;
unsigned long lastUserActionMs = 0;
unsigned long lastWebUpdate = 0; // Waktu terakhir data dikirim ke web

/***** WiFi Reconnect Timer *****/
unsigned long lastReconnectAttempt = 0;
const unsigned long RECONNECT_INTERVAL_MS = 30000; // Coba reconnect setiap 30 detik

/***** FUNCTION PROTOTYPES *****/
// Deklarasi fungsi agar bisa dipanggil sebelum definisinya
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
void sendDataViaGPRS(); // Fungsi baru untuk kirim via SIM800L
void sendCommand(String cmd, int waitMs = 1000); // Default parameter hanya di prototype

/***** UTILITIES *****/
// Membaca nilai analog beberapa kali dan mengambil median untuk stabilitas
int readAnalogMedian(int pin, int samples=11) {
  samples = constrain(samples, 3, 15); // Batasi jumlah sampel
  int buf[15];
  for (int i = 0; i < samples; i++) buf[i] = analogRead(pin);
  // Urutkan array
  for (int i = 1; i < samples; i++) {
    int k = buf[i], j = i - 1;
    while (j >= 0 && buf[j] > k) { buf[j+1] = buf[j]; j--; }
    buf[j+1] = k;
  }
  return buf[samples/2]; // Ambil nilai tengah (median)
}

// Mengklasifikasikan kelembaban tanah berdasarkan nilai analog
String classifyMoisture(int moisture) {
  // Sesuaikan ambang batas ini berdasarkan kalibrasi sensor Anda
  // Nilai analog yang lebih rendah = lebih basah, nilai analog yang lebih tinggi = lebih kering
  if (moisture > 3000)      return "Kering";
  else if (moisture > 1500) return "Cukup";
  else                      return "Basah";
}

// Mengklasifikasikan status jarak air
String getDistanceStatus(int d) {
  if (d < 0)         return "Error"; // Jika -1, berarti error
  else if (d < 20)   return "Tinggi"; // Air tinggi (jarak kecil)
  else if (d < 80)   return "Normal";
  else               return "Rendah"; // Air rendah (jarak besar)
}

// Mengklasifikasikan status suhu udara
String getTemperatureStatus(float t) {
  if (t == DEVICE_DISCONNECTED_C) return "Error"; // Jika sensor tidak terhubung
  else if (t < 20)       return "Dingin";
  else if (t < 30)       return "Normal";
  else                   return "Panas";
}

// Mengklasifikasikan status hujan berdasarkan persentase kebasahan
String getRainStatus(int rainPercentage) {
  // rainPercentage: 0 = kering, 100 = basah/hujan
  if (rainPercentage < 10) return "Kering";
  else if (rainPercentage < 50) return "Gerimis";
  else return "Hujan";
}

// Mengkonversi pembacaan ADC sensor hujan ke persentase kebasahan
int rd_wetPercentFromADC(int adc, int dryHigh, int wetLow){
  adc    = constrain(adc, 0, RD_ADC_MAX); // Batasi nilai ADC dalam rentang valid
  wetLow = constrain(wetLow, 0, dryHigh-1); // Pastikan wetLow lebih kecil dari dryHigh
  long num = (long)(dryHigh - adc) * 100L;
  long den = (long)(dryHigh - wetLow);
  int pct  = (int)(num / den);
  return constrain(pct, 0, 100); // Batasi persentase antara 0 dan 100
}

/***** LCD POWER HELPERS *****/
void lcdSleep() {
  if (!lcdAwake) return; // Jika sudah tidur, jangan lakukan apa-apa
  lcdAwake = false;
  lcd.noBacklight(); // Matikan backlight
  Serial.println("[LCD] sleep");
}

void lcdWake(bool refreshNow) {
  if (lcdAwake) { // Jika sudah bangun, cukup perbarui waktu interaksi terakhir
    lastUserActionMs = millis();
    return;
  }
  lcdAwake = true;
  lcd.backlight(); // Nyalakan backlight
  lastUserActionMs = millis(); // Perbarui waktu interaksi terakhir
  Serial.println("[LCD] wake");
  if (refreshNow) lcd.clear(); // Bersihkan layar jika diminta
}

/***** KIRIM DATA KE WEB *****/
void sendDataToWebServer() {
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected, sending data via WiFi...");
    
    HTTPClient http;
    http.begin(API_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", API_KEY); // Tambahkan API Key
    http.setTimeout(10000);  // Timeout 10 detik

    // Buat payload JSON
    StaticJsonDocument<512> doc; // Ukuran dokumen JSON, sesuaikan jika data lebih besar
    doc["device_id"] = DEVICE_ID;
    doc["device_name"] = DEVICE_NAME;
    doc["device_location"] = LOCATION;
    doc["distance"] = distance;
    doc["soil_moisture"] = soilPct;
    doc["temperature"] = temperature;
    doc["rain_percentage"] = rd_wetPct;
    doc["wifi_signal"] = WiFi.RSSI(); // Kekuatan sinyal WiFi
    doc["free_heap"] = ESP.getFreeHeap(); // Memori bebas ESP32
    doc["firmware_version"] = "2.0.0"; // Versi firmware device

    String jsonString;
    serializeJson(doc, jsonString); // Serialisasi JSON ke string

    Serial.println("JSON Data: " + jsonString);

    int httpResponseCode = http.POST(jsonString); // Kirim permintaan POST

    if (httpResponseCode > 0) { // Jika kode respons positif (misal: 200 OK)
      String response = http.getString(); // Ambil respons dari server
      Serial.println("HTTP Response Code: " + String(httpResponseCode));
      Serial.println("Response: " + response);
    } else {
      Serial.print("Error on sending POST: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  } else {
    Serial.println("WiFi not connected, sending data via SIM800L...");
    sendCommand("AT+CSQ"); // Cek kekuatan sinyal SIM800L sebelum kirim data
    sendDataViaGPRS(); // Kirim data via GPRS (SIM800L)
  }
}

/***** FUNGSI KIRIM DATA VIA SIM800L (GPRS) *****/
void sendDataViaGPRS() {
  // Buat payload JSON
  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["device_name"] = DEVICE_NAME;
  doc["device_location"] = LOCATION;
  doc["distance"] = distance;
  doc["soil_moisture"] = soilPct;
  doc["temperature"] = temperature;
  doc["rain_percentage"] = rd_wetPct;
  doc["wifi_signal"] = WiFi.RSSI(); // Tetap sertakan meski WiFi tidak connected
  doc["free_heap"] = ESP.getFreeHeap();
  doc["firmware_version"] = "2.0.0";

  String jsonString;
  serializeJson(doc, jsonString);

  // Inisialisasi GPRS
  sendCommand("AT+SAPBR=3,1,\"Contype\",\"GPRS\"");
  sendCommand(String("AT+SAPBR=3,1,\"APN\",\"") + apn + "\"");
  sendCommand("AT+SAPBR=1,1");
  sendCommand("AT+SAPBR=2,1");

  // Buka HTTP connection
  sendCommand("AT+HTTPINIT");
  sendCommand("AT+HTTPPARA=\"CID\",1");
  sendCommand("AT+HTTPPARA=\"URL\",\"iotmonitoringbycodev.my.id/api/receive_data.php\""); // Gunakan HTTP
  sendCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"");
  sendCommand(String("AT+HTTPPARA=\"USERDATA\",\"X-API-Key: ") + API_KEY + "\""); // Tambahkan header API Key
  sendCommand(String("AT+HTTPDATA=") + jsonString.length() + ",10000");
  sim800l.print(jsonString);
  delay(1000); // Tunggu data dikirim
  sendCommand("AT+HTTPACTION=1"); // POST
  sendCommand("AT+HTTPREAD"); // Baca respons
  sendCommand("AT+HTTPTERM"); // Tutup HTTP
  sendCommand("AT+SAPBR=0,1"); // Tutup GPRS
}

/***** FUNGSI SEND COMMAND KE SIM800L DAN CEK SINYAL *****/
void sendCommand(String cmd, int waitMs) { // Tanpa default parameter di definisi
  Serial.print("Kirim ke SIM800L: ");
  Serial.println(cmd);

  sim800l.println(cmd);
  delay(waitMs);

  if (sim800l.available()) {
    Serial.println("Respon dari SIM800L:");
    while (sim800l.available()) {
      String res = sim800l.readStringUntil('\n');
      res.trim();
      if (res.length() > 0) {
        Serial.println(">> " + res);

        // parsing respon CSQ
        if (res.startsWith("+CSQ:")) {
          int commaIndex = res.indexOf(',');
          String rssiStr = res.substring(6, commaIndex);
          int rssi = rssiStr.toInt();

          Serial.print("Kekuatan sinyal (RSSI): ");
          Serial.println(rssi);

          if (rssi == 99) {
            Serial.println("❌ Tidak ada sinyal");
          } else if (rssi <= 9) {
            Serial.println("📶 Sinyal sangat lemah");
          } else if (rssi <= 14) {
            Serial.println("📶 Sinyal cukup");
          } else if (rssi <= 19) {
            Serial.println("📶 Sinyal bagus");
          } else {
            Serial.println("📶 Sinyal sangat bagus");
          }
        }
      }
    }
  } else {
    Serial.println("⚠️ Tidak ada respon dari SIM800L!");
  }
}

/***** SENSOR READING *****/
void sampleSensors() {
  Serial.println("Reading sensors...");

  // Baca sensor ultrasonik (Jarak Air)
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(5);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  duration = pulseIn(ECHO_PIN, HIGH, 30000UL); // Timeout 30ms

  if (duration == 0) {
    distance = -1; // Tandai sebagai error
  } else {
    distance = (int)(duration * 0.0343f / 2.0f); // Hitung jarak dalam cm
  }
  distanceStatus = getDistanceStatus(distance);

  // Baca sensor kelembaban tanah
  moistureValue = readAnalogMedian(MOISTURE_SENSOR_PIN, 11); // Baca nilai analog
  // Konversi nilai analog ke persentase (0-100)
  // Sesuaikan pemetaan ini berdasarkan kalibrasi sensor Anda
  soilPct = map(constrain(moistureValue, 1200, 3600), 3600, 1200, 0, 100);
  soilPct = constrain(soilPct, 0, 100);
  moistureStatus = classifyMoisture(moistureValue);

  // Baca sensor hujan
  rd_adc = readAnalogMedian(RAINDROP_AO_PIN, 11); // Baca nilai analog
  // Konversi nilai analog ke persentase kebasahan
  rd_wetPct = rd_wetPercentFromADC(rd_adc, RD_DRY_ANALOG_READING, RD_WET_ANALOG_READING);
  rd_klas = getRainStatus(rd_wetPct);

  // Baca sensor suhu (DS18B20)
  sensors.requestTemperatures(); // Minta pembacaan suhu
  float t = sensors.getTempCByIndex(0); // Ambil suhu dari sensor pertama
  if (t == DEVICE_DISCONNECTED_C) {
    temperature = DEVICE_DISCONNECTED_C; // Tandai sebagai error
  } else {
    temperature = t;
  }
  temperatureStatus = getTemperatureStatus(temperature);

  // Cetak pembacaan sensor ke Serial Monitor
  Serial.println("=== " + String(DEVICE_ID) + " Sensor Readings ===");
  Serial.println("Distance: " + String(distance) + " cm (" + distanceStatus + ")");
  Serial.println("Soil Moisture: " + String(soilPct) + "% (" + moistureStatus + ")");
  Serial.println("Temperature: " + String(temperature) + "°C (" + temperatureStatus + ")");
  Serial.println("Rain: " + String(rd_wetPct) + "% (" + rd_klas + ")");
  Serial.println("WiFi Signal: " + String(WiFi.RSSI()) + " dBm");
  Serial.println("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");

  // Kirim data ke web server jika sudah waktunya
  if (millis() - lastWebUpdate >= WEB_UPDATE_INTERVAL_MS) {
    sendDataToWebServer();
    lastWebUpdate = millis();
  }

  // Perbarui tampilan LCD
  if (lcdAwake) updateLCD();
}

/***** SETUP *****/
void setup() {
  Serial.begin(115200);
  Serial.println("=== IoT Kelapa Sawit Monitor ===");
  Serial.println("Device ID: " + String(DEVICE_ID));
  Serial.println("Device Name: " + String(DEVICE_NAME));
  Serial.println("Location: " + String(LOCATION));

  // Inisialisasi SIM800L
  sim800l.begin(9600, SERIAL_8N1, MODEM_RX, MODEM_TX);
  Serial.println("SIM800L initialized.");
  sim800l.println("AT"); // Test modem
  delay(1000);
  while (sim800l.available()) {
    Serial.write(sim800l.read());
  }

  // Inisialisasi LCD I2C
  Wire.begin();
  lcd.init(); 
  lcd.backlight();
  lcd.setCursor(0, 0); 
  lcd.print(DEVICE_NAME);
  lcd.setCursor(0, 1); 
  lcd.print("Menyambung...");

  // Konfigurasi pin
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP); // Gunakan INPUT_PULLUP untuk tombol

  // Inisialisasi sensor DS18B20
  sensors.begin(); 
  sensors.setWaitForConversion(false); // Non-blocking conversion

  // Konfigurasi ADC ESP32
  analogReadResolution(12); // Resolusi ADC 12-bit (0-4095)
  analogSetPinAttenuation(MOISTURE_SENSOR_PIN, ADC_11db); // Atur atenuasi untuk rentang penuh 0-3.3V
  analogSetPinAttenuation(RAINDROP_AO_PIN, ADC_11db);
  pinMode(MOISTURE_SENSOR_PIN, INPUT);
  pinMode(RAINDROP_AO_PIN, INPUT);

  // Sambungkan ke WiFi
  Serial.println("Connecting to WiFi: " + String(ssid));
  WiFi.begin(ssid, pass);

  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 30) { // Coba 30 kali (15 detik)
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
    sendCommand("AT");      // Tes komunikasi dasar SIM800L
    sendCommand("ATE0");    // Matikan echo
    sendCommand("AT+CSQ");  // Cek sinyal awal
  }

  // Mulai pembacaan sensor secara periodik menggunakan Ticker
  ticker.attach_ms(SENSOR_READ_INTERVAL_MS, sampleSensors);

  delay(2000); // Tunggu sebentar sebelum memulai loop
  lcd.clear();
  lcdAwake = true;
  lastUserActionMs = millis(); // Set waktu interaksi terakhir

  Serial.println("Setup completed. Starting monitoring...");
}

/***** LOOP *****/
void loop() {
  // Logika debounce untuk tombol
  int reading = digitalRead(BUTTON_PIN);
  if (reading != lastReading) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (reading != lastStableState) {
      lastStableState = reading;
      if (lastStableState == LOW) { // Tombol ditekan (LOW karena INPUT_PULLUP)
        lastUserActionMs = millis(); // Perbarui waktu interaksi terakhir
        if (!lcdAwake) { // Jika LCD tidur, bangunkan dan perbarui layar
          lcdWake(true); 
          updateLCD(); 
        } else { // Jika LCD sudah bangun, ganti layar
          currentScreen = (currentScreen + 1) % TOTAL_SCREENS; 
          updateLCD(); 
        }
        Serial.print("BTN -> screen "); 
        Serial.println(currentScreen);
      }
    }
  }
  lastReading = reading;

  // Logika auto-sleep LCD
  if (lcdAwake && (millis() - lastUserActionMs >= LCD_SLEEP_TIMEOUT_MS)) {
    lcdSleep();
  }

  // Periksa koneksi WiFi secara periodik (jika terputus, coba sambung ulang setiap 30 detik)
  if (WiFi.status() != WL_CONNECTED && (millis() - lastReconnectAttempt >= RECONNECT_INTERVAL_MS)) {
    Serial.println("WiFi disconnected. Attempting to reconnect...");
    WiFi.reconnect();
    lastReconnectAttempt = millis();
    // Jika reconnect gagal, cek sinyal SIM800L
    if (WiFi.status() != WL_CONNECTED) {
      sendCommand("AT+CSQ");
    }
  }
}

/***** UPDATE LCD *****/
// Fungsi ini diasumsikan ada di kode asli yang truncated, jadi saya tambahkan placeholder berdasarkan konteks
void updateLCD() {
  lcd.clear();
  switch (currentScreen) {
    case 0:
      lcd.setCursor(0, 0);
      lcd.print("Distance: " + String(distance) + " cm");
      lcd.setCursor(0, 1);
      lcd.print(distanceStatus);
      break;
    case 1:
      lcd.setCursor(0, 0);
      lcd.print("Moisture: " + String(soilPct) + "%");
      lcd.setCursor(0, 1);
      lcd.print(moistureStatus);
      break;
    case 2:
      lcd.setCursor(0, 0);
      lcd.print("Temp: " + String(temperature) + " C");
      lcd.setCursor(0, 1);
      lcd.print(temperatureStatus);
      break;
    case 3:
      lcd.setCursor(0, 0);
      lcd.print("Rain: " + String(rd_wetPct) + "%");
      lcd.setCursor(0, 1);
      lcd.print(rd_klas);
      break;
  }
}