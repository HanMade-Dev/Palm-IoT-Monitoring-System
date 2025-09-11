al.println("Using sensor timestamp for GPRS: " + sensorTimestamp);
  } else {
    Serial.println("No sensor timestamp available for GPRS - server will use server time");
  }

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
  sendCommand("AT+HTTPPARA=\"URL\",\"http://iotmonitoringbycodev.my.id/api/receive_data.php\""); // Gunakan HTTP dengan scheme
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
  
  // Initialize SIM800L with network time sync
  sendCommand("AT");         // Test modem
  sendCommand("ATE0");       // Turn off echo
  sendCommand("AT+CLTS=1");  // Enable network time sync
  sendCommand("AT&W");       // Save settings to NVRAM
  sendCommand("AT+CREG?");   // Check network registration
  
  Serial.println("SIM800L network time sync enabled");

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
    
    // Initialize NTP time synchronization when WiFi is connected
    initNTP();
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