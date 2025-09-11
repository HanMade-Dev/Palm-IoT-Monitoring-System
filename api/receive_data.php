<?php
require_once 'config.php';
require_once '../config/api_keys.php';

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

// Rate limiting
$client_ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if (!checkRateLimit($client_ip)) {
    http_response_code(429);
    sendResponse(false, null, 'Rate limit exceeded');
    exit;
}

try {
    // Check API key
    $headers = getallheaders();
    $api_key = $headers['X-API-Key'] ?? $headers['Authorization'] ?? '';

    if (empty($api_key)) {
        http_response_code(401);
        sendResponse(false, null, 'API key required');
        exit;
    }

    // Get input data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Invalid JSON data');
    }

    // Validate required fields
    $requiredFields = ['device_id', 'device_name', 'device_location', 'soil_moisture', 'rain_percentage'];
    foreach ($requiredFields as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Missing required field: $field");
        }
    }

    // Validate API key for device
    // logMessage("Validating API key: $api_key for device: " . $data['device_id']); // Debugging
    if (!verifyApiKey($api_key, $data['device_id'])) {
        logMessage("API key validation failed for device: " . $data['device_id']);
        http_response_code(403);
        sendResponse(false, null, 'Invalid API key for device');
        exit;
    }
    // logMessage("API key validation successful for device: " . $data['device_id']); // Debugging

    // Sanitize and validate data
    $deviceId = sanitizeInput($data['device_id']);
    $deviceName = sanitizeInput($data['device_name']);
    $deviceLocation = sanitizeInput($data['device_location']);
    $distance = isset($data['distance']) && $data['distance'] !== -1 ? (int)$data['distance'] : null;
    $soilMoisture = max(0, min(100, (int)$data['soil_moisture']));
    $temperature = isset($data['temperature']) && $data['temperature'] !== 'DEVICE_DISCONNECTED_C' ? (float)$data['temperature'] : null;
    $rainPercentage = max(0, min(100, (int)$data['rain_percentage']));

    // Additional validation for sensor values
    if ($distance !== null && ($distance < 0 || $distance > 500)) {
        $distance = null; // Invalid distance
    }
    if ($temperature !== null && ($temperature < -50 || $temperature > 100)) {
        $temperature = null; // Invalid temperature
    }

    // Get timestamp - prefer sensor timestamp over server timestamp
    $sensorTimestamp = $data['sensor_timestamp'] ?? null;
    $currentTimestamp = date('Y-m-d H:i:s'); // Server timestamp as fallback (WIB timezone assumed)
    
    // Validate and use sensor timestamp if provided and valid
    $useTimestamp = $currentTimestamp; // Default to server time
    $timestampSource = 'server';
    
    if (!empty($sensorTimestamp)) {
        // Validate sensor timestamp format and reasonableness
        $sensorTime = strtotime($sensorTimestamp);
        $serverTime = time();
        
        // Stricter validation: check if timestamp is reasonable
        // Use relative time windows instead of hard-coded years
        if ($sensorTime !== false && 
            $sensorTime >= strtotime('2023-01-01') && // Not older than 2023 (reasonable minimum)
            $sensorTime <= ($serverTime + 60) &&      // Max 1 minute in future
            $sensorTime >= ($serverTime - 600)) {     // Max 10 minutes in past (increased for GPRS delays)
            
            $useTimestamp = date('Y-m-d H:i:s', $sensorTime);
            $timestampSource = 'sensor';
            logMessage("Using sensor timestamp: $useTimestamp for device: $deviceId");
        } else {
            $sensorDate = date('Y-m-d H:i:s', $sensorTime ?: 0);
            $serverDate = date('Y-m-d H:i:s', $serverTime);
            logMessage("REJECTED sensor timestamp: $sensorTimestamp (parsed as: $sensorDate) for device: $deviceId. Server time: $serverDate. Using server time instead.");
        }
    } else {
        logMessage("No sensor timestamp provided for device: $deviceId, using server time: $useTimestamp");
    }
    
    // Add metadata for debugging
    $timestampInfo = [
        'used_timestamp' => $useTimestamp,
        'source' => $timestampSource,
        'sensor_timestamp_raw' => $sensorTimestamp,
        'server_timestamp' => $currentTimestamp
    ];
    logMessage("Timestamp info for $deviceId: " . json_encode($timestampInfo));

    // Prepare buffer data
    $bufferData = [
        'timestamp' => $useTimestamp, // Use sensor timestamp if valid, otherwise server time
        'device_id' => $deviceId,
        'device_name' => $deviceName,
        'device_location' => $deviceLocation,
        'distance' => $distance,
        'soil_moisture' => $soilMoisture,
        'temperature' => $temperature,
        'rain_percentage' => $rainPercentage,
        'wifi_signal' => $data['wifi_signal'] ?? null,
        'free_heap' => $data['free_heap'] ?? null,
        'firmware_version' => $data['firmware_version'] ?? '1.0.0',
        'client_ip' => $client_ip
    ];

    // Ensure buffer directory exists
    ensureBufferDir();

    // Append to buffer file (JSONL format)
    $jsonLine = json_encode($bufferData) . "\n";
    $result = file_put_contents(BUFFER_FILE, $jsonLine, FILE_APPEND | LOCK_EX);

    if ($result === false) {
        throw new Exception('Failed to write to buffer');
    }

    // Update device status to online when receiving data
    try {
        $pdo = getDBConnection();
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
        
        $statusStmt->execute([
            $deviceId,
            $useTimestamp, // Use sensor timestamp for last_seen if valid
            $bufferData['wifi_signal'],
            $bufferData['free_heap'],
            $bufferData['firmware_version']
        ]);
    } catch (Exception $e) {
        logMessage("Failed to update device status for $deviceId: " . $e->getMessage());
    }

    logMessage("Data buffered successfully for device $deviceId - Moisture: $soilMoisture%, Temp: {$temperature}°C, Rain: $rainPercentage%");
    sendResponse(true, ['device_id' => $deviceId, 'buffered' => true], 'Data received and buffered successfully');

    // Attempt to auto-flush buffer after receiving data
    autoFlushBuffer();

} catch (Exception $e) {
    logMessage("Error in receive_data.php: " . $e->getMessage());
    http_response_code(400);
    sendResponse(false, null, $e->getMessage());
}
?>