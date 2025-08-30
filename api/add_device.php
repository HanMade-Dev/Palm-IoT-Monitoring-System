<?php
require_once 'config.php';

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
 * Generates a unique API key for a device
 */
function generateApiKey($deviceId) {
    return hash('sha256', $deviceId . time() . rand());
}

/**
 * Generates ESP32 code for a device
 */
function generateEspCode($deviceId, $apiKey, $deviceName, $location) {
    $baseUrl = (isset($_SERVER['HTTPS']) ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'];

    return '#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Device Configuration
const String DEVICE_ID = "' . $deviceId . '";
const String DEVICE_NAME = "' . $deviceName . '";
const String LOCATION = "' . $location . '";
const String API_KEY = "' . $apiKey . '";
const String API_URL = "' . $baseUrl . '/api/receive_data.php";

// Sensor pins
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;
const int SOIL_MOISTURE_PIN = 34;
const int RAIN_SENSOR_PIN = 35;
const int DHT_PIN = 4;

void setup() {
  Serial.begin(115200);

  // Initialize pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Connect to WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("Connected to WiFi");
}

void loop() {
  // Read sensors
  float distance = readUltrasonicSensor();
  int soilMoisture = readSoilMoisture();
  float temperature = 25.0; // Replace with actual DHT22 reading
  int rainPercentage = readRainSensor();

  // Send data to API
  sendSensorData(distance, soilMoisture, temperature, rainPercentage);

  delay(10000); // Send data every 10 seconds
}

float readUltrasonicSensor() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH);
  float distance = duration * 0.034 / 2;

  return distance;
}

int readSoilMoisture() {
  int sensorValue = analogRead(SOIL_MOISTURE_PIN);
  int moisturePercent = map(sensorValue, 0, 4095, 0, 100);
  return moisturePercent;
}

int readRainSensor() {
  int sensorValue = analogRead(RAIN_SENSOR_PIN);
  int rainPercent = map(sensorValue, 0, 4095, 0, 100);
  return 100 - rainPercent; // Invert reading
}

void sendSensorData(float distance, int soilMoisture, float temperature, int rainPercentage) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(API_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", API_KEY);

    // Create JSON payload
    DynamicJsonDocument doc(1024);
    doc["device_id"] = DEVICE_ID;
    doc["distance"] = distance;
    doc["soil_moisture"] = soilMoisture;
    doc["temperature"] = temperature;
    doc["rain_percentage"] = rainPercentage;
    doc["wifi_signal"] = WiFi.RSSI();
    doc["free_heap"] = ESP.getFreeHeap();

    String jsonString;
    serializeJson(doc, jsonString);

    int httpResponseCode = http.POST(jsonString);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("HTTP Response: " + String(httpResponseCode));
      Serial.println("Response: " + response);
    } else {
      Serial.println("Error sending data: " + String(httpResponseCode));
    }

    http.end();
  }
}';
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

    // Validate device_id format
    if (!preg_match('/^[A-Za-z0-9_]+$/', $deviceId)) {
        throw new Exception('Device ID can only contain letters, numbers, and underscores');
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
    $insertSql = "INSERT INTO devices (device_id, device_name, location, description, is_active, created_at) 
                  VALUES (?, ?, ?, ?, TRUE, " . (DB_TYPE === 'pgsql' ? 'NOW()' : 'NOW()') . ")";
    $insertStmt = $pdo->prepare($insertSql);
    $insertStmt->execute([$deviceId, $deviceName, $location, $description]);

    // Insert device status
    $statusSql = "INSERT INTO device_status (device_id, is_online, firmware_version) VALUES (?, FALSE, '2.0.0')";
    $statusStmt = $pdo->prepare($statusSql);
    $statusStmt->execute([$deviceId]);

    // Generate API key
    $apiKey = generateApiKey($deviceId);

    // Store API key (you might want to store this in a separate table)
    require_once '../config/api_keys.php';
    storeApiKey($deviceId, $apiKey);

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