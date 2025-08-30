
# ESP32 IoT Sensor Setup

## Hardware Requirements

1. **ESP32 Development Board**
2. **Sensors:**
   - Soil Moisture Sensor (Analog)
   - Rain Detection Sensor (Analog)
   - DS18B20 Temperature Sensor (Digital)
   - HC-SR04 Ultrasonic Distance Sensor
3. **Resistors:** 4.7kΩ pull-up resistor for DS18B20
4. **Jumper Wires & Breadboard**

## Pin Connections

| Sensor | ESP32 Pin | Notes |
|--------|-----------|--------|
| Soil Moisture | A0 (GPIO36) | Analog input |
| Rain Sensor | A1 (GPIO39) | Analog input |
| DS18B20 Data | GPIO4 | Digital with 4.7kΩ pull-up |
| HC-SR04 Trig | GPIO2 | Digital output |
| HC-SR04 Echo | GPIO3 | Digital input |
| Status LED | GPIO2 | Built-in LED (optional) |

## Library Dependencies

Install these libraries through Arduino IDE Library Manager:

1. **WiFi** (built-in with ESP32)
2. **HTTPClient** (built-in with ESP32)
3. **ArduinoJson** by Benoit Blanchon
4. **OneWire** by Jim Studt
5. **DallasTemperature** by Miles Burton

## Setup Instructions

1. **Install ESP32 Board Support:**
   - Open Arduino IDE
   - Go to File → Preferences
   - Add this URL to Additional Board Manager URLs:
     ```
     https://dl.espressif.com/dl/package_esp32_index.json
     ```
   - Go to Tools → Board → Boards Manager
   - Search "ESP32" and install "ESP32 by Espressif Systems"

2. **Install Required Libraries:**
   - Go to Sketch → Include Library → Manage Libraries
   - Install the libraries listed above

3. **Configure the Code:**
   - Open `iot_sensor.ino`
   - Update WiFi credentials:
     ```cpp
     const char* ssid = "YOUR_WIFI_SSID";
     const char* password = "YOUR_WIFI_PASSWORD";
     ```
   - Update server URL:
     ```cpp
     const char* serverURL = "http://your-server.com/api/receive_data.php";
     ```
   - Get API key from dashboard and update:
     ```cpp
     const char* apiKey = "YOUR_API_KEY";
     ```
   - Update device information:
     ```cpp
     const String deviceId = "ESP32_SAWIT_01";
     const String deviceName = "Sensor Area Utara";
     const String deviceLocation = "Kebun Blok A";
     ```

4. **Upload Code:**
   - Connect ESP32 to computer via USB
   - Select correct board: Tools → Board → ESP32 Dev Module
   - Select correct port: Tools → Port → (your ESP32 port)
   - Click Upload button

## Wiring Diagram

```
ESP32                    Sensors
-----                    -------
GPIO36 (A0) ──────────── Soil Moisture Sensor (Signal)
GPIO39 (A1) ──────────── Rain Sensor (Signal)
GPIO4 ────────┬─────────── DS18B20 (Data)
              │
            4.7kΩ
              │
3.3V ─────────┴─────────── DS18B20 (VCC) + Pull-up
GND ────────────────────── All sensors (GND)
GPIO2 ────────────────── HC-SR04 (Trig)
GPIO3 ────────────────── HC-SR04 (Echo)
```

## Calibration

1. **Soil Moisture Sensor:**
   - Place in dry soil, note reading
   - Place in wet soil, note reading
   - Adjust map() function in `readSoilMoisture()`

2. **Rain Sensor:**
   - Test with dry and wet conditions
   - Adjust map() function in `readRainSensor()`

## Troubleshooting

1. **WiFi Connection Issues:**
   - Check SSID and password
   - Ensure 2.4GHz WiFi (ESP32 doesn't support 5GHz)
   - Check WiFi signal strength

2. **Sensor Reading Issues:**
   - Verify wiring connections
   - Check sensor power supply (3.3V or 5V)
   - Test sensors individually

3. **Data Transmission Issues:**
   - Check server URL and API key
   - Monitor Serial output for error messages
   - Verify internet connectivity

## Serial Monitor Output

Expected output when working correctly:
```
=== IoT Kelapa Sawit Monitor ===
Device ID: ESP32_SAWIT_01
Device Name: Sensor Area Utara
Location: Kebun Blok A

Connecting to WiFi....
WiFi connected successfully!
IP address: 192.168.1.100
Signal strength: -45

--- Reading Sensors ---
Sensor Readings:
- Soil Moisture: 65%
- Rain: 15%
- Temperature: 28.5°C
- Water Distance: 45 cm
- WiFi Signal: -45 dBm
- Free Heap: 280000 bytes

Sending data to server...
✓ Data sent successfully!
HTTP Response: 200
✓ Server confirmed data received
```
