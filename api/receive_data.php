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
    $requiredFields = ['device_id', 'device_name', 'device_location', 'soil_moisture', 'moisture_status', 'rain_percentage', 'rain_status'];
    foreach ($requiredFields as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Missing required field: $field");
        }
    }

    // Validate API key for device
    if (!validateApiKey($api_key, $data['device_id'])) {
        http_response_code(403);
        sendResponse(false, null, 'Invalid API key for device');
        exit;
    }

    // Sanitize and validate data
    $deviceId = sanitizeInput($data['device_id']);
    $deviceName = sanitizeInput($data['device_name']);
    $deviceLocation = sanitizeInput($data['device_location']);
    $distance = isset($data['distance']) && $data['distance'] !== -1 ? (int)$data['distance'] : null;
    $soilMoisture = max(0, min(100, (int)$data['soil_moisture']));
    $moistureStatus = sanitizeInput($data['moisture_status']);
    $temperature = isset($data['temperature']) && $data['temperature'] !== 'DEVICE_DISCONNECTED_C' ? (float)$data['temperature'] : null;
    $rainPercentage = max(0, min(100, (int)$data['rain_percentage']));
    $rainStatus = sanitizeInput($data['rain_status']);

    // Additional validation
    if ($distance !== null && ($distance < 0 || $distance > 500)) {
        $distance = null;
    }

    if ($temperature !== null && ($temperature < -50 || $temperature > 100)) {
        $temperature = null;
    }

    // Prepare buffer data
    $bufferData = [
        'timestamp' => date('Y-m-d H:i:s'),
        'device_id' => $deviceId,
        'device_name' => $deviceName,
        'device_location' => $deviceLocation,
        'distance' => $distance,
        'soil_moisture' => $soilMoisture,
        'moisture_status' => $moistureStatus,
        'temperature' => $temperature,
        'rain_percentage' => $rainPercentage,
        'rain_status' => $rainStatus,
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

    logMessage("Data buffered successfully for device $deviceId - Moisture: $soilMoisture%, Temp: {$temperature}°C, Rain: $rainPercentage%");
    sendResponse(true, ['device_id' => $deviceId, 'buffered' => true], 'Data received and buffered successfully');

} catch (Exception $e) {
    logMessage("Error: " . $e->getMessage());
    http_response_code(400);
    sendResponse(false, null, $e->getMessage());
}
?>