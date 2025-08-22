<?php
require_once 'config.php';

try {
    // Connect to database
    $pdo = getDBConnection();
    
    // Get all active devices with their latest status
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
            WHEN ds.last_seen > (CURRENT_TIMESTAMP - INTERVAL '5 minutes') THEN 'online'
            WHEN ds.last_seen > (CURRENT_TIMESTAMP - INTERVAL '30 minutes') THEN 'warning'
            ELSE 'offline'
        END as connection_status,
        (SELECT COUNT(*) FROM sensor_data WHERE device_id = d.device_id) as total_readings,
        (SELECT timestamp FROM sensor_data WHERE device_id = d.device_id ORDER BY timestamp DESC LIMIT 1) as last_reading
    FROM devices d
    LEFT JOIN device_status ds ON d.device_id = ds.device_id
    WHERE d.is_active = TRUE
    ORDER BY d.device_name";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $devices = $stmt->fetchAll();
    
    // Format the data
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
    logMessage("Error getting devices: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, null, 'Failed to retrieve devices');
}
?>