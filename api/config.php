<?php
// Database configuration
// For PostgreSQL (uncomment for PostgreSQL hosting)
$db_url = getenv('DATABASE_URL');
if ($db_url) {
    $db_info = parse_url($db_url);
    define('DB_HOST', $db_info['host']);
    define('DB_USERNAME', $db_info['user']);
    define('DB_PASSWORD', $db_info['pass']);
    define('DB_NAME', ltrim($db_info['path'], '/'));
    define('DB_PORT', $db_info['port'] ?? 5432);
    define('DB_TYPE', 'pgsql');
} else {
    // For MySQL hosting (RumahWeb, shared hosting)
    // Configure for MySQL hosting - UPDATE THESE VALUES:
    define('DB_HOST', 'localhost');
    define('DB_USERNAME', 'your_db_username');  // Change this
    define('DB_PASSWORD', 'your_db_password');  // Change this
    define('DB_NAME', 'fare1399_sawit_iot_db');      // Change this if different
    define('DB_PORT', 3306);
    define('DB_TYPE', 'mysql');
    
    // Alternative: Auto-detect from environment (if your host supports it)
    /*
    define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
    define('DB_USERNAME', getenv('DB_USERNAME') ?: 'root');
    define('DB_PASSWORD', getenv('DB_PASSWORD') ?: '');
    define('DB_NAME', getenv('DB_NAME') ?: 'iot_kelapa_sawit');
    define('DB_PORT', getenv('DB_PORT') ?: 3306);
    define('DB_TYPE', 'mysql');
    */
}

// Timezone
date_default_timezone_set('Asia/Jakarta');

// CORS headers for API
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Database connection (supports both PostgreSQL and MySQL)
function getDBConnection() {
    try {
        if (DB_TYPE === 'mysql') {
            $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        } else {
            $dsn = "pgsql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME;
        }
        
        $pdo = new PDO(
            $dsn,
            DB_USERNAME,
            DB_PASSWORD,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]
        );
        return $pdo;
    } catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Database connection failed'
        ]);
        exit;
    }
}

// Common response function
function sendResponse($success, $data = null, $message = '') {
    header('Content-Type: application/json');
    $response = ['success' => $success];
    
    if ($data !== null) {
        $response['data'] = $data;
    }
    
    if (!empty($message)) {
        $response['message'] = $message;
    }
    
    echo json_encode($response);
}

// Validate and sanitize input
function sanitizeInput($input) {
    return htmlspecialchars(strip_tags(trim($input)));
}

// Log function for debugging
function logMessage($message) {
    $timestamp = date('Y-m-d H:i:s');
    error_log("[$timestamp] $message");
}
?>
