
<?php
require_once 'config.php';

try {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        http_response_code(400);
        sendResponse(false, null, 'Invalid JSON input');
        exit;
    }
    
    $deviceId = isset($input['device_id']) ? trim($input['device_id']) : '';
    $deviceName = isset($input['device_name']) ? trim($input['device_name']) : '';
    $location = isset($input['location']) ? trim($input['location']) : '';
    $description = isset($input['description']) ? trim($input['description']) : '';
    
    if (empty($deviceId) || empty($deviceName)) {
        http_response_code(400);
        sendResponse(false, null, 'Device ID and Device Name are required');
        exit;
    }
    
    $pdo = getDBConnection();
    
    // Check if device already exists
    $checkSql = "SELECT device_id FROM devices WHERE device_id = ?";
    $checkStmt = $pdo->prepare($checkSql);
    $checkStmt->execute([$deviceId]);
    
    if ($checkStmt->fetch()) {
        http_response_code(409);
        sendResponse(false, null, 'Device ID already exists');
        exit;
    }
    
    // Insert new device
    $sql = "INSERT INTO devices (device_id, device_name, location, description, is_active) VALUES (?, ?, ?, ?, TRUE)";
    $stmt = $pdo->prepare($sql);
    $result = $stmt->execute([$deviceId, $deviceName, $location, $description]);
    
    if ($result) {
        // Initialize device status
        $statusSql = "INSERT INTO device_status (device_id, is_online, last_seen) VALUES (?, FALSE, NULL)";
        $statusStmt = $pdo->prepare($statusSql);
        $statusStmt->execute([$deviceId]);
        
        // Generate ESP32 code
        $espCode = generateEspCode($deviceId, $deviceName, $location);
        
        sendResponse(true, [
            'device_id' => $deviceId,
            'device_name' => $deviceName,
            'location' => $location,
            'description' => $description,
            'esp_code' => $espCode
        ]);
    } else {
        http_response_code(500);
        sendResponse(false, null, 'Failed to add device');
    }
    
} catch (Exception $e) {
    logMessage("Error adding device: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, null, 'Failed to add device');
}

function generateEspCode($deviceId, $deviceName, $location) {
    return '/***** BLYNK MACROS — HARUS DI ATAS SEBELUM INCLUDE BLYNK *****/
#define BLYNK_TEMPLATE_ID   "TMPL6A_8e3STx"
#define BLYNK_TEMPLATE_NAME "IoTMonitoringSawit"
#define BLYNK_AUTH_TOKEN    "cUnTIhLoHC3QqmPZZTT4-pvbQreAhrql"
#define BLYNK_PRINT Serial

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
const char* serverURL = "' . (isset($_SERVER['HTTPS']) ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'] . '/api/receive_data.php";
const int webUpdateInterval = 5000;

/***** DEVICE CONFIG - UBAH SESUAI DEVICE MASING-MASING *****/
const char* DEVICE_ID = "' . $deviceId . '";
const char* DEVICE_NAME = "' . $deviceName . '";
const char* DEVICE_LOCATION = "' . $location . '";

/***** PIN DEFINITIONS *****/
#define TRIG_PIN 23
#define ECHO_PIN 19
#define MOISTURE_SENSOR_PIN 34
#define ONE_WIRE_BUS 4
#define RAINDROP_AO_PIN 35
#define BUTTON_PIN 18

// [Sisanya menggunakan kode yang sama seperti esp32_multi_device.ino]
';
}
?>
