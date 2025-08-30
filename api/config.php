<?php
// Database configuration for production
define('DB_HOST', 'localhost');
define('DB_NAME', 'fare1399_sawit_iot_db');
define('DB_USER', 'fare1399_adminiot');
define('DB_PASS', 'IoTMonitoring!');
define('DB_PORT', 3306);
define('DB_TYPE', 'mysql');

// Buffer configuration
define('BUFFER_DIR', __DIR__ . '/../storage/buffer/');
define('BUFFER_FILE', BUFFER_DIR . 'sensor_data.jsonl');
define('BUFFER_FLUSH_INTERVAL', 300); // 5 minutes
define('BUFFER_MAX_LINES', 50); // Auto flush after 50 lines

// API configuration
define('API_KEY_LENGTH', 32);
define('RATE_LIMIT_REQUESTS', 200);
define('RATE_LIMIT_WINDOW', 3600);

/**
 * Establishes and returns a PDO database connection.
 */
function getDBConnection() {
    $host = DB_HOST;
    $db = DB_NAME;
    $user = DB_USER;
    $pass = DB_PASS;
    $port = DB_PORT;

    $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
    ];

    try {
        return new PDO($dsn, $user, $pass, $options);
    } catch (PDOException $e) {
        error_log("Database connection error: " . $e->getMessage());
        throw new PDOException($e->getMessage(), (int)$e->getCode());
    }
}

/**
 * Sends a JSON response.
 */
function sendResponse($success, $data = null, $message = null) {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization');

    echo json_encode([
        'success' => $success,
        'data' => $data,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ]);
}

/**
 * Logs a message.
 */
function logMessage($message) {
    $timestamp = date('Y-m-d H:i:s');
    $logFile = __DIR__ . '/../storage/logs/app.log';

    // Ensure log directory exists
    $logDir = dirname($logFile);
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }

    $logEntry = "[$timestamp] $message" . PHP_EOL;
    file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
}

/**
 * Sanitizes user input.
 */
function sanitizeInput($data) {
    if (is_null($data)) return null;
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data, ENT_QUOTES, 'UTF-8');
    return $data;
}

/**
 * Validates API key for specific device.
 */
function validateApiKey($apiKey, $deviceId = null) {
    require_once __DIR__ . '/../config/api_keys.php';
    return verifyApiKey($apiKey, $deviceId);
}

/**
 * Rate limiting check.
 */
function checkRateLimit($identifier) {
    $file = sys_get_temp_dir() . '/rate_limit_' . md5($identifier);
    $current_time = time();

    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        if ($current_time - $data['window_start'] < RATE_LIMIT_WINDOW) {
            if ($data['requests'] >= RATE_LIMIT_REQUESTS) {
                return false;
            }
            $data['requests']++;
        } else {
            $data = ['window_start' => $current_time, 'requests' => 1];
        }
    } else {
        $data = ['window_start' => $current_time, 'requests' => 1];
    }

    file_put_contents($file, json_encode($data));
    return true;
}

/**
 * Ensures buffer directory exists
 */
function ensureBufferDir() {
    if (!is_dir(BUFFER_DIR)) {
        mkdir(BUFFER_DIR, 0755, true);
    }
}

/**
 * Auto flush buffer to database when conditions are met
 */
function autoFlushBuffer() {
    if (!file_exists(BUFFER_FILE)) {
        return;
    }

    $lines = file(BUFFER_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $lineCount = count($lines);
    $lastModified = filemtime(BUFFER_FILE);
    $timeSinceModified = time() - $lastModified;

    // Flush if buffer has too many lines OR if it's been too long since last flush
    if ($lineCount >= BUFFER_MAX_LINES || $timeSinceModified >= BUFFER_FLUSH_INTERVAL) {
        flushBufferToDatabase();
    }
}

/**
 * Flush buffer data to database
 */
function flushBufferToDatabase() {
    if (!file_exists(BUFFER_FILE)) {
        return false;
    }

    try {
        $lines = file(BUFFER_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (empty($lines)) {
            return false;
        }

        $pdo = getDBConnection();
        $pdo->beginTransaction();

        // Prepare statements
        $deviceStmt = $pdo->prepare("INSERT IGNORE INTO devices (device_id, device_name, location) VALUES (?, ?, ?)");
        $sensorStmt = $pdo->prepare("INSERT INTO sensor_data (
            device_id, distance, distance_status, soil_moisture, moisture_status, 
            temperature, temperature_status, rain_percentage, rain_status, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $statusStmt = $pdo->prepare("INSERT INTO device_status (
            device_id, is_online, last_seen, wifi_signal, free_heap, firmware_version
        ) VALUES (?, TRUE, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            is_online = TRUE,
            last_seen = VALUES(last_seen),
            wifi_signal = VALUES(wifi_signal),
            free_heap = VALUES(free_heap),
            firmware_version = VALUES(firmware_version)");

        $processedCount = 0;
        foreach ($lines as $line) {
            $data = json_decode($line, true);
            if (!$data || !isset($data['device_id'])) continue;

            // Insert device
            $deviceStmt->execute([
                $data['device_id'],
                $data['device_name'] ?? 'Unknown Device',
                $data['device_location'] ?? 'Unknown Location'
            ]);

            // Calculate status
            $distanceStatus = getDistanceStatus($data['distance']);
            $temperatureStatus = getTemperatureStatus($data['temperature']);

            // Insert sensor data
            $sensorStmt->execute([
                $data['device_id'],
                $data['distance'],
                $distanceStatus,
                $data['soil_moisture'],
                $data['moisture_status'] ?? 'Unknown',
                $data['temperature'],
                $temperatureStatus,
                $data['rain_percentage'],
                $data['rain_status'] ?? 'Unknown',
                $data['timestamp']
            ]);

            // Update device status
            $statusStmt->execute([
                $data['device_id'],
                $data['timestamp'],
                $data['wifi_signal'] ?? null,
                $data['free_heap'] ?? null,
                $data['firmware_version'] ?? '1.0.0'
            ]);

            $processedCount++;
        }

        $pdo->commit();

        // Clear buffer file after successful flush
        file_put_contents(BUFFER_FILE, '');

        logMessage("Buffer flushed successfully: $processedCount records processed");
        return true;

    } catch (Exception $e) {
        if (isset($pdo)) {
            $pdo->rollBack();
        }
        logMessage("Buffer flush error: " . $e->getMessage());
        return false;
    }
}

function getDistanceStatus($distance) {
    if ($distance === null || $distance < 0) return 'Error';
    if ($distance < 20) return 'Tinggi';
    if ($distance < 50) return 'Sedang';
    return 'Rendah';
}

function getTemperatureStatus($temperature) {
    if ($temperature === null) return 'Error';
    if ($temperature < 20) return 'Dingin';
    if ($temperature < 30) return 'Normal';
    return 'Panas';
}
?>