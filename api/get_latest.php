<?php
require_once 'config.php';

try {
    // Get device_id parameter (optional)
    $deviceId = isset($_GET['device_id']) ? sanitizeInput($_GET['device_id']) : null;
    
    // Connect to database
    $pdo = getDBConnection();
    
    if ($deviceId) {
        // Get latest data for specific device
        $sql = "SELECT 
            sd.device_id,
            d.device_name,
            d.location,
            sd.distance,
            sd.distance_status,
            sd.soil_moisture,
            sd.moisture_status,
            sd.temperature,
            sd.temperature_status,
            sd.rain_percentage,
            sd.rain_status,
            sd.timestamp
        FROM sensor_data sd
        JOIN devices d ON sd.device_id = d.device_id
        WHERE sd.device_id = ? AND d.is_active = TRUE
        ORDER BY sd.timestamp DESC 
        LIMIT 1";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$deviceId]);
        $data = $stmt->fetch();
    } else {
        // Get latest data from all devices
        $sql = "SELECT 
            sd.device_id,
            d.device_name,
            d.location,
            sd.distance,
            sd.distance_status,
            sd.soil_moisture,
            sd.moisture_status,
            sd.temperature,
            sd.temperature_status,
            sd.rain_percentage,
            sd.rain_status,
            sd.timestamp
        FROM sensor_data sd
        JOIN devices d ON sd.device_id = d.device_id
        WHERE d.is_active = TRUE
        AND sd.id IN (
            SELECT MAX(id) FROM sensor_data 
            WHERE device_id IN (SELECT device_id FROM devices WHERE is_active = TRUE)
            GROUP BY device_id
        )
        ORDER BY sd.timestamp DESC";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        $data = $stmt->fetchAll();
    }
    
    if ($data) {
        if ($deviceId) {
            // Format single device data
            $response = [
                'device_id' => $data['device_id'],
                'device_name' => $data['device_name'],
                'location' => $data['location'],
                'distance' => $data['distance'],
                'distance_status' => $data['distance_status'],
                'soil_moisture' => (int)$data['soil_moisture'],
                'moisture_status' => $data['moisture_status'],
                'temperature' => $data['temperature'] ? (float)$data['temperature'] : null,
                'temperature_status' => $data['temperature_status'],
                'rain_percentage' => (int)$data['rain_percentage'],
                'rain_status' => $data['rain_status'],
                'timestamp' => $data['timestamp'],
                'formatted_time' => date('d/m/Y H:i:s', strtotime($data['timestamp']))
            ];
        } else {
            // Format multiple devices data
            $response = array_map(function($row) {
                return [
                    'device_id' => $row['device_id'],
                    'device_name' => $row['device_name'],
                    'location' => $row['location'],
                    'distance' => $row['distance'],
                    'distance_status' => $row['distance_status'],
                    'soil_moisture' => (int)$row['soil_moisture'],
                    'moisture_status' => $row['moisture_status'],
                    'temperature' => $row['temperature'] ? (float)$row['temperature'] : null,
                    'temperature_status' => $row['temperature_status'],
                    'rain_percentage' => (int)$row['rain_percentage'],
                    'rain_status' => $row['rain_status'],
                    'timestamp' => $row['timestamp'],
                    'formatted_time' => date('d/m/Y H:i:s', strtotime($row['timestamp']))
                ];
            }, $data);
        }
        
        sendResponse(true, $response);
    } else {
        sendResponse(false, null, 'No data available');
    }
    
} catch (Exception $e) {
    logMessage("Error getting latest data: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, null, 'Failed to retrieve data');
}
?>
