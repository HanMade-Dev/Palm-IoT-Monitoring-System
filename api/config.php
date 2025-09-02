<?php
// Database configuration for production
define('DB_HOST', 'localhost');
define('DB_NAME', 'fare1399_sawit_iot_db');
define('DB_USER', 'fare1399_adminiot');
define('DB_PASS', 'IoTMonitoring!');
define('DB_PORT', 3306);
define('DB_TYPE', 'mysql'); // 'mysql' or 'pgsql'

// Buffer configuration
define('BUFFER_DIR', __DIR__ . '/../storage/buffer/');
define('BUFFER_FILE', BUFFER_DIR . 'sensor_data.jsonl');
define('BUFFER_FLUSH_INTERVAL', 300); // 5 minutes (in seconds)
define('BUFFER_MAX_LINES', 50); // Auto flush after 50 lines

// API configuration
define('API_KEY_LENGTH', 32); // Length of generated API keys
define('RATE_LIMIT_REQUESTS', 200); // Max requests per window
define('RATE_LIMIT_WINDOW', 3600); // Window in seconds (1 hour)

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
        // In a production environment, you might want to show a generic error message
        // instead of the detailed exception message to the user.
        throw new PDOException("Database connection failed.", (int)$e->getCode());
    }
}

/**
 * Sends a JSON response.
 */
function sendResponse($success, $data = null, $message = null, $pagination = null) {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization');

    $response = [
        'success' => $success,
        'data' => $data,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ];
    
    if ($pagination) {
        $response['pagination'] = $pagination;
    }

    echo json_encode($response);
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
    // Mengurangi interval flush agar data lebih cepat masuk ke DB
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
            // Clear the file if it's empty but still exists, to prevent processing empty lines repeatedly
            file_put_contents(BUFFER_FILE, '');
            return false;
        }

        $pdo = getDBConnection();
        $pdo->beginTransaction();

        // Prepare statements
        // Using INSERT IGNORE for devices to prevent errors if device already exists
        $deviceStmt = $pdo->prepare("INSERT IGNORE INTO devices (device_id, device_name, location, is_active, created_at, updated_at) VALUES (?, ?, ?, TRUE, NOW(), NOW())");
        $sensorStmt = $pdo->prepare("INSERT INTO sensor_data (
            device_id, distance, distance_status, soil_moisture, moisture_status, 
            temperature, temperature_status, rain_percentage, rain_status, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $statusStmt = $pdo->prepare("INSERT INTO device_status (
            device_id, is_online, last_seen, wifi_signal, free_heap, firmware_version, created_at, updated_at
        ) VALUES (?, TRUE, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
            is_online = TRUE,
            last_seen = VALUES(last_seen),
            wifi_signal = VALUES(wifi_signal),
            free_heap = VALUES(free_heap),
            firmware_version = VALUES(firmware_version),
            updated_at = NOW()");

        $processedCount = 0;
        $tempBuffer = []; // Temporary buffer to hold lines that failed to process

        foreach ($lines as $line) {
            $data = json_decode($line, true);
            if (!$data || !isset($data['device_id'])) {
                // If data is invalid, add to tempBuffer and skip
                $tempBuffer[] = $line;
                continue;
            }

            try {
                // Insert device (if not exists)
                $deviceStmt->execute([
                    $data['device_id'],
                    $data['device_name'] ?? 'Unknown Device',
                    $data['device_location'] ?? 'Unknown Location'
                ]);

                // Calculate status
                $distanceStatus = getDistanceStatus($data['distance'] ?? null);
                $moistureStatus = getMoistureStatus($data['soil_moisture'] ?? null);
                $temperatureStatus = getTemperatureStatus($data['temperature'] ?? null);
                $rainStatus = getRainStatus($data['rain_percentage'] ?? null);

                // Insert sensor data
                $sensorStmt->execute([
                    $data['device_id'],
                    $data['distance'] ?? null,
                    $distanceStatus,
                    $data['soil_moisture'] ?? null,
                    $moistureStatus,
                    $data['temperature'] ?? null,
                    $temperatureStatus,
                    $data['rain_percentage'] ?? null,
                    $rainStatus,
                    $data['timestamp'] ?? date('Y-m-d H:i:s') // Use timestamp from buffer or current time
                ]);

                // Update device status
                $statusStmt->execute([
                    $data['device_id'],
                    $data['timestamp'] ?? date('Y-m-d H:i:s'), // Use timestamp from buffer or current time for last_seen
                    $data['wifi_signal'] ?? null,
                    $data['free_heap'] ?? null,
                    $data['firmware_version'] ?? '1.0.0'
                ]);

                $processedCount++;
            } catch (PDOException $e) {
                // Log specific PDO error for this line, but continue processing others
                logMessage("Failed to process buffer line for device {$data['device_id']}: " . $e->getMessage());
                $tempBuffer[] = $line; // Add back to tempBuffer if processing failed
            }
        }

        $pdo->commit();

        // Rewrite buffer file with only unprocessed lines
        file_put_contents(BUFFER_FILE, implode('', $tempBuffer));

        logMessage("Buffer flushed successfully: $processedCount records processed. " . count($tempBuffer) . " lines remaining in buffer.");
        return true;

    } catch (Exception $e) {
        if (isset($pdo)) {
            $pdo->rollBack();
        }
        logMessage("Buffer flush error: " . $e->getMessage());
        return false;
    }
}

// Fungsi-fungsi status ini sudah ada di kode Anda, pastikan mereka mengembalikan string yang sesuai
function getDistanceStatus($distance) {
    if ($distance === null || $distance < 0) return 'Error';
    if ($distance < 20) return 'Tinggi';
    if ($distance < 50) return 'Sedang';
    return 'Rendah';
}

function getMoistureStatus($moisture) {
    if ($moisture === null) return 'Error';
    if ($moisture < 30) return 'Kering';
    if ($moisture < 70) return 'Normal';
    return 'Basah';
}

function getTemperatureStatus($temperature) {
    if ($temperature === null) return 'Error';
    if ($temperature < 20) return 'Dingin';
    if ($temperature < 30) return 'Normal';
    return 'Panas';
}

function getRainStatus($rainPercentage) {
    if ($rainPercentage === null) return 'Error';
    if ($rainPercentage < 10) return 'Kering';
    if ($rainPercentage < 50) return 'Gerimis';
    return 'Hujan';
}