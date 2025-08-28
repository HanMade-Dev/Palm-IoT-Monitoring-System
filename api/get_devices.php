<?php
require_once 'config.php';

// Placeholder for helper functions if they are not defined elsewhere
if (!function_exists('getDBConnection')) {
    function getDBConnection() {
        // Replace with your actual database connection logic
        // For example, using PDO
        $host = 'localhost'; // Use environment variable for production
        $db   = 'your_database'; // Use environment variable for production
        $user = 'your_db_user'; // Use environment variable for production
        $pass = 'your_db_password'; // Use environment variable for production
        $charset = 'utf8mb4';

        $dsn = "mysql:host=$host;dbname=$db;charset=$charset";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        try {
            return new PDO($dsn, $user, $pass, $options);
        } catch (\PDOException $e) {
            logMessage("Database connection error: " . $e->getMessage());
            throw new \PDOException($e->getMessage(), (int)$e->getCode());
        }
    }
}

if (!function_exists('sendResponse')) {
    function sendResponse($success, $data = null, $message = null) {
        header('Content-Type: application/json');
        echo json_encode(['success' => $success, 'data' => $data, 'message' => $message]);
    }
}

if (!function_exists('logMessage')) {
    function logMessage($message) {
        // In a production environment, you would log to a file or a logging service
        // For this example, we'll just echo to error_log
        error_log($message);
    }
}

if (!function_exists('sanitizeInput')) {
    function sanitizeInput($data) {
        $data = trim($data);
        $data = stripslashes($data);
        $data = htmlspecialchars($data, ENT_QUOTES, 'UTF-8');
        // Additional sanitization might be needed depending on the data type and usage
        return $data;
    }
}

// --- Main logic for get_devices.php ---

try {
    $pdo = getDBConnection();
    $deviceId = isset($_GET['device_id']) ? sanitizeInput($_GET['device_id']) : null;

    if ($deviceId) {
        // Get specific device
        $sql = "SELECT 
            d.device_id,
            d.device_name,
            d.location,
            d.description,
            d.is_active,
            ds.is_online,
            ds.last_seen,
            ds.wifi_signal,
            ds.free_heap,
            ds.firmware_version,
            CASE 
                WHEN ds.last_seen > (NOW() - INTERVAL 5 MINUTE) THEN 'online'
                WHEN ds.last_seen > (NOW() - INTERVAL 30 MINUTE) THEN 'warning'
                ELSE 'offline'
            END as connection_status,
            (SELECT COUNT(*) FROM sensor_data WHERE device_id = d.device_id) as total_readings,
            (SELECT timestamp FROM sensor_data WHERE device_id = d.device_id ORDER BY timestamp DESC LIMIT 1) as last_reading
        FROM devices d
        LEFT JOIN device_status ds ON d.device_id = ds.device_id 
        WHERE d.device_id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$deviceId]);
    } else {
        // Get all devices
        $sql = "SELECT 
            d.device_id,
            d.device_name,
            d.location,
            d.description,
            d.is_active,
            ds.is_online,
            ds.last_seen,
            ds.wifi_signal,
            ds.free_heap,
            ds.firmware_version,
            CASE 
                WHEN ds.last_seen > (NOW() - INTERVAL 5 MINUTE) THEN 'online'
                WHEN ds.last_seen > (NOW() - INTERVAL 30 MINUTE) THEN 'warning'
                ELSE 'offline'
            END as connection_status,
            (SELECT COUNT(*) FROM sensor_data WHERE device_id = d.device_id) as total_readings,
            (SELECT timestamp FROM sensor_data WHERE device_id = d.device_id ORDER BY timestamp DESC LIMIT 1) as last_reading
        FROM devices d
        LEFT JOIN device_status ds ON d.device_id = ds.device_id
        WHERE d.is_active = TRUE
        ORDER BY d.device_name"; // Changed order to device_name as per original context
        $stmt = $pdo->prepare($sql);
        $stmt->execute();
    }

    $devices = $stmt->fetchAll();

    // Format the data for better presentation, similar to original request
    $formattedDevices = array_map(function($device) {
        return [
            'device_id' => $device['device_id'],
            'device_name' => $device['device_name'],
            'location' => $device['location'],
            'description' => $device['description'],
            'is_active' => (bool)$device['is_active'],
            'is_online' => (bool)$device['is_online'],
            'last_seen' => $device['last_seen'],
            'connection_status' => $device['connection_status'],
            'wifi_signal' => $device['wifi_signal'] ? (int)$device['wifi_signal'] : null,
            'free_heap' => $device['free_heap'] ? (int)$device['free_heap'] : null,
            'firmware_version' => $device['firmware_version'],
            'total_readings' => (int)$device['total_readings'],
            'last_reading' => $device['last_reading'],
            'last_reading_formatted' => $device['last_reading'] ? date('d/m/Y H:i:s', strtotime($device['last_reading'])) : null
        ];
    }, $devices);

    sendResponse(true, $formattedDevices);

} catch (Exception $e) {
    logMessage("Error fetching devices: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, null, 'Failed to fetch devices');
}
?>