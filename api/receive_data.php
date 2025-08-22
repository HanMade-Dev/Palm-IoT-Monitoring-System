<?php
require_once 'config.php';

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    sendResponse(false, null, 'Method not allowed');
    exit;
}

try {
    // Get input data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    
    // Log received data for debugging
    logMessage("Received data: " . $input);
    
    // Validate JSON data
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Invalid JSON data');
    }
    
    // Validate required fields (with device_id)
    $requiredFields = ['device_id', 'distance', 'soil_moisture', 'moisture_status', 'temperature', 'rain_percentage', 'rain_status'];
    foreach ($requiredFields as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Missing required field: $field");
        }
    }
    
    // Sanitize and validate data (with device_id and all statuses)
    $deviceId = sanitizeInput($data['device_id']);
    $distance = $data['distance'] === -1 ? null : (int)$data['distance'];
    $distanceStatus = sanitizeInput($data['distance_status'] ?? 'Unknown');
    $soilMoisture = max(0, min(100, (int)$data['soil_moisture']));
    $moistureStatus = sanitizeInput($data['moisture_status']);
    $temperature = $data['temperature'] === 'DEVICE_DISCONNECTED_C' ? null : (float)$data['temperature'];
    $temperatureStatus = sanitizeInput($data['temperature_status'] ?? 'Unknown');
    $rainPercentage = max(0, min(100, (int)$data['rain_percentage']));
    $rainStatus = sanitizeInput($data['rain_status']);
    
    // Additional validation
    if ($distance !== null && ($distance < 0 || $distance > 500)) {
        $distance = null; // Invalid distance reading
    }
    
    if ($temperature !== null && ($temperature < -50 || $temperature > 100)) {
        $temperature = null; // Invalid temperature reading
    }
    
    // Validate status values for all parameters
    $validDistanceStatuses = ['Error', 'Tinggi', 'Normal', 'Rendah'];
    $validMoistureStatuses = ['Kering', 'Cukup', 'Basah'];
    $validTemperatureStatuses = ['Error', 'Dingin', 'Normal', 'Panas'];
    $validRainStatuses = ['Kering', 'Cukup', 'Hujan'];
    
    if (!in_array($distanceStatus, $validDistanceStatuses)) {
        $distanceStatus = 'Unknown';
    }
    
    if (!in_array($moistureStatus, $validMoistureStatuses)) {
        $moistureStatus = 'Unknown';
    }
    
    if (!in_array($temperatureStatus, $validTemperatureStatuses)) {
        $temperatureStatus = 'Unknown';
    }
    
    if (!in_array($rainStatus, $validRainStatuses)) {
        $rainStatus = 'Unknown';
    }
    
    // Connect to database
    $pdo = getDBConnection();
    
    // Check if device exists, if not create it
    $deviceCheckSql = "SELECT device_id FROM devices WHERE device_id = ?";
    $deviceCheckStmt = $pdo->prepare($deviceCheckSql);
    $deviceCheckStmt->execute([$deviceId]);
    
    if (!$deviceCheckStmt->fetch()) {
        // Auto-register new device
        $deviceInsertSql = "INSERT INTO devices (device_id, device_name, location, description) VALUES (?, ?, ?, ?)";
        $deviceInsertStmt = $pdo->prepare($deviceInsertSql);
        $deviceInsertStmt->execute([
            $deviceId,
            'Auto-registered: ' . $deviceId,
            'Unknown Location',
            'Device automatically registered from data submission'
        ]);
    }
    
    // Insert sensor data
    $sql = "INSERT INTO sensor_data (
        device_id,
        distance, 
        distance_status,
        soil_moisture, 
        moisture_status, 
        temperature,
        temperature_status, 
        rain_percentage, 
        rain_status,
        timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())";
    
    $stmt = $pdo->prepare($sql);
    $result = $stmt->execute([
        $deviceId,
        $distance,
        $distanceStatus,
        $soilMoisture,
        $moistureStatus,
        $temperature,
        $temperatureStatus,
        $rainPercentage,
        $rainStatus
    ]);
    
    if ($result) {
        // Update device status
        $statusUpdateSql = "INSERT INTO device_status (
            device_id, is_online, last_seen, wifi_signal, free_heap
        ) VALUES (?, TRUE, CURRENT_TIMESTAMP, ?, ?)
        ON CONFLICT (device_id) DO UPDATE SET
            is_online = TRUE,
            last_seen = CURRENT_TIMESTAMP,
            wifi_signal = EXCLUDED.wifi_signal,
            free_heap = EXCLUDED.free_heap";
        
        $statusUpdateStmt = $pdo->prepare($statusUpdateSql);
        $statusUpdateStmt->execute([
            $deviceId,
            $data['wifi_signal'] ?? null,
            $data['free_heap'] ?? null
        ]);
        
        logMessage("Data inserted successfully for device $deviceId - Distance: $distance, Moisture: $soilMoisture%, Temp: {$temperature}°C, Rain: $rainPercentage%");
        sendResponse(true, ['id' => $pdo->lastInsertId(), 'device_id' => $deviceId], 'Data received and stored successfully');
    } else {
        throw new Exception('Failed to insert data');
    }
    
} catch (Exception $e) {
    logMessage("Error: " . $e->getMessage());
    http_response_code(400);
    sendResponse(false, null, $e->getMessage());
}
?>
