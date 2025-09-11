#include <HardwareSerial.h>

#define MODEM_TX 17   // ESP32 TX2 -> SIM800L RX
#define MODEM_RX 16   // ESP32 RX2 <- SIM800L TX

HardwareSerial sim800l(1);

void sendCommand(String cmd, int waitMs = 1000) {
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

void setup() {
  Serial.begin(115200);
  sim800l.begin(9600, SERIAL_8N1, MODEM_RX, MODEM_TX);

  delay(3000);
  Serial.println("=== TES KEKUATAN SINYAL SIM800L ===");

  sendCommand("AT");      // tes komunikasi dasar
  sendCommand("ATE0");    // matikan echo
  sendCommand("AT+CSQ");  // cek sinyal awal
}

void loop() {
  sendCommand("AT+CSQ");  // cek sinyal setiap 10 detik
  delay(10000);
}
