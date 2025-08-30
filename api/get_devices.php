
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

// Set CORS headers for all requests
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

try {
    $pdo = getDBConnection();
    $deviceId = isset($_GET['device_id']) ? sanitizeInput($_GET['device_id']) : null;

    if ($deviceId) {
        // Get specific device
        if (DB_TYPE === 'pgsql') {
            $sql = "SELECT 
                d.device_id,
                d.device_name,
                d.location,
                d.description,
                d.is_active,
                d.created_at,
                COALESCE(ds.is_online, false) as is_online,
                ds.last_seen,
                ds.wifi_signal,
                ds.free_heap,
                ds.firmware_version,
                CASE 
                    WHEN ds.last_seen > NOW() - INTERVAL '5 minutes' THEN 'online'
                    WHEN ds.last_seen > NOW() - INTERVAL '30 minutes' THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                (SELECT COUNT(*) FROM sensor_data WHERE device_id = d.device_id) as total_readings,
                (SELECT timestamp FROM sensor_data WHERE device_id = d.device_id ORDER BY timestamp DESC LIMIT 1) as last_reading
            FROM devices d
            LEFT JOIN device_status ds ON d.device_id = ds.device_id
            WHERE d.device_id = ? AND d.is_active = TRUE";
        } else {
            $sql = "SELECT 
                d.device_id,
                d.device_name,
                d.location,
                d.description,
                d.is_active,
                d.created_at,
                COALESCE(ds.is_online, false) as is_online,
                ds.last_seen,
                ds.wifi_signal,
                ds.free_heap,
                ds.firmware_version,
                CASE 
                    WHEN ds.last_seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'online'
                    WHEN ds.last_seen > DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                (SELECT COUNT(*) FROM sensor_data WHERE device_id = d.device_id) as total_readings,
                (SELECT timestamp FROM sensor_data WHERE device_id = d.device_id ORDER BY timestamp DESC LIMIT 1) as last_reading
            FROM devices d
            LEFT JOIN device_status ds ON d.device_id = ds.device_id
            WHERE d.device_id = ? AND d.is_active = TRUE";
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$deviceId]);
        $devices = $stmt->fetchAll();

    } else {
        // Get all devices
        if (DB_TYPE === 'pgsql') {
            $sql = "SELECT 
                d.device_id,
                d.device_name,
                d.location,
                d.description,
                d.is_active,
                d.created_at,
                COALESCE(ds.is_online, false) as is_online,
                ds.last_seen,
                ds.wifi_signal,
                ds.free_heap,
                ds.firmware_version,
                CASE 
                    WHEN ds.last_seen > NOW() - INTERVAL '5 minutes' THEN 'online'
                    WHEN ds.last_seen > NOW() - INTERVAL '30 minutes' THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                (SELECT COUNT(*) FROM sensor_data WHERE device_id = d.device_id) as total_readings,
                (SELECT timestamp FROM sensor_data WHERE device_id = d.device_id ORDER BY timestamp DESC LIMIT 1) as last_reading
            FROM devices d
            LEFT JOIN device_status ds ON d.device_id = ds.device_id
            WHERE d.is_active = TRUE
            ORDER BY d.device_name";
        } else {
            $sql = "SELECT 
                d.device_id,
                d.device_name,
                d.location,
                d.description,
                d.is_active,
                d.created_at,
                COALESCE(ds.is_online, false) as is_online,
                ds.last_seen,
                ds.wifi_signal,
                ds.free_heap,
                ds.firmware_version,
                CASE 
                    WHEN ds.last_seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'online'
                    WHEN ds.last_seen > DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 'warning'
                    ELSE 'offline'
                END as connection_status,
                (SELECT COUNT(*) FROM sensor_data WHERE device_id = d.device_id) as total_readings,
                (SELECT timestamp FROM sensor_data WHERE device_id = d.device_id ORDER BY timestamp DESC LIMIT 1) as last_reading
            FROM devices d
            LEFT JOIN device_status ds ON d.device_id = ds.device_id
            WHERE d.is_active = TRUE
            ORDER BY d.device_name";
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        $devices = $stmt->fetchAll();
    }

    // Format the data for better presentation
    $formattedDevices = array_map(function($device) {
        return [
            'device_id' => $device['device_id'],
            'device_name' => $device['device_name'],
            'location' => $device['location'] ?: '',
            'description' => $device['description'] ?: '',
            'is_active' => (bool)$device['is_active'],
            'created_at' => $device['created_at'],
            'is_online' => (bool)$device['is_online'],
            'last_seen' => $device['last_seen'],
            'connection_status' => $device['connection_status'] ?: 'offline',
            'wifi_signal' => $device['wifi_signal'] !== null ? (int)$device['wifi_signal'] : null,
            'free_heap' => $device['free_heap'] !== null ? (int)$device['free_heap'] : null,
            'firmware_version' => $device['firmware_version'] ?: '1.0.0',
            'total_readings' => (int)$device['total_readings'],
            'last_reading' => $device['last_reading'],
            'last_reading_formatted' => $device['last_reading'] ? date('d/m/Y H:i:s', strtotime($device['last_reading'])) : null
        ];
    }, $devices);

    sendResponse(true, $formattedDevices, 'Devices retrieved successfully');

} catch (Exception $e) {
    logMessage("Error fetching devices: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, [], 'Failed to fetch devices: ' . $e->getMessage());
}
?>
