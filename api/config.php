<?php
if (isset($_ENV['DATABASE_URL'])) {
    $url = parse_url($_ENV['DATABASE_URL']);
    define('DB_HOST', $url['host']);
    define('DB_NAME', ltrim($url['path'], '/'));
    define('DB_USER', $url['user']);
    define('DB_PASS', $url['pass']);
    define('DB_PORT', $url['port'] ?? 5432);
    define('DB_TYPE', 'pgsql');
} else {
    define('DB_HOST', 'localhost');
    define('DB_NAME', 'fare1399_sawit_iot_db');
    define('DB_USER', 'root');
    define('DB_PASS', '');
    define('DB_PORT', 3306);
    define('DB_TYPE', 'mysql');
}

// API configuration
define('API_KEY_LENGTH', 32);
define('RATE_LIMIT_REQUESTS', 100);
define('RATE_LIMIT_WINDOW', 3600); // 1 hour in seconds

/**
 * Establishes and returns a PDO database connection.
 */
function getDBConnection() {
    $host = DB_HOST;
    $db = DB_NAME;
    $user = DB_USER;
    $pass = DB_PASS;
    $port = DB_PORT;

    if (DB_TYPE === 'pgsql') {
        $dsn = "pgsql:host=$host;port=$port;dbname=$db";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
    } else {
        $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
    }

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
    header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

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
    error_log("[IoT Monitor] " . date('Y-m-d H:i:s') . " - " . $message);
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
 * Validates API key.
 */
function validateApiKey($providedKey) {
    require_once '../config/api_keys.php';
    return verifyApiKey($providedKey);
}

/**
 * Rate limiting check.
 */
function checkRateLimit($identifier) {
    // Simple rate limiting implementation
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
?>