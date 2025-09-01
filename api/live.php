<?php
require_once 'config.php';

header('Content-Type: application/json');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    ensureBufferDir();
    
    // Auto flush buffer if needed
    autoFlushBuffer();
    
    $liveData = [];
    $deviceLatest = [];
    
    // Step 1: Get latest data from database
    try {
        $pdo = getDBConnection();
        
        // Select latest sensor data for each device
        $sql = "SELECT 
            sd.device_id,
            d.device_name,
            d.location,
            sd.distance,
            sd.soil_moisture,
            sd.temperature,
            sd.rain_percentage,
            sd.timestamp,
            ds.is_online,
            ds.last_seen,
            ds.wifi_signal,
            ds.free_heap,
            ds.firmware_version
        FROM sensor_data sd
        JOIN devices d ON sd.device_id = d.device_id
        LEFT JOIN device_status ds ON sd.device_id = ds.device_id
        WHERE sd.id IN (
            SELECT MAX(id) FROM sensor_data GROUP BY device_id
        )
        AND d.is_active = TRUE
        ORDER BY sd.timestamp DESC";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        $dbData = $stmt->fetchAll();
        
        // Store database data indexed by device_id
        foreach ($dbData as $data) {
            $deviceLatest[$data['device_id']] = [
                'device_id' => $data['device_id'],
                'device_name' => $data['device_name'] ?? 'Unknown Device',
                'location' => $data['location'] ?? 'Unknown Location',
                'distance' => $data['distance'],
                'distance_status' => getDistanceStatus($data['distance']),
                'soil_moisture' => $data['soil_moisture'],
                'moisture_status' => getMoistureStatus($data['soil_moisture']),
                'temperature' => $data['temperature'],
                'temperature_status' => getTemperatureStatus($data['temperature']),
                'rain_percentage' => $data['rain_percentage'],
                'rain_status' => getRainStatus($data['rain_percentage']),
                'timestamp' => $data['timestamp'],
                'wifi_signal' => $data['wifi_signal'],
                'free_heap' => $data['free_heap'],
                'firmware_version' => $data['firmware_version'] ?? '1.0.0',
                'source' => 'database',
                'is_online' => (bool)$data['is_online'],
                'last_seen' => $data['last_seen']
            ];
        }
    } catch (Exception $e) {
        logMessage("Database error in live.php: " . $e->getMessage());
        // Continue processing even if database read fails, buffer might still have data
    }
    
    // Step 2: Read from buffer file (real-time data) and override database data if newer
    if (file_exists(BUFFER_FILE)) {
        $bufferData = file(BUFFER_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        
        // Process buffer data (newest first)
        foreach (array_reverse($bufferData) as $line) {
            $data = json_decode($line, true);
            if (!$data || !isset($data['device_id'])) {
                continue;
            }
            
            $deviceId = $data['device_id'];
            
            // Check if this buffer data is newer than database data
            $isNewer = true;
            if (isset($deviceLatest[$deviceId])) {
                $dbTimestamp = strtotime($deviceLatest[$deviceId]['timestamp']);
                $bufferTimestamp = strtotime($data['timestamp']);
                $isNewer = $bufferTimestamp > $dbTimestamp;
            }
            
            // Only use buffer data if it's newer or if no database data exists
            if ($isNewer) {
                $deviceLatest[$deviceId] = [
                    'device_id' => $data['device_id'],
                    'device_name' => $data['device_name'] ?? 'Unknown Device',
                    'location' => $data['device_location'] ?? 'Unknown Location',
                    'distance' => $data['distance'],
                    'distance_status' => getDistanceStatus($data['distance']),
                    'soil_moisture' => $data['soil_moisture'],
                    'moisture_status' => getMoistureStatus($data['soil_moisture']),
                    'temperature' => $data['temperature'],
                    'temperature_status' => getTemperatureStatus($data['temperature']),
                    'rain_percentage' => $data['rain_percentage'],
                    'rain_status' => getRainStatus($data['rain_percentage']),
                    'timestamp' => $data['timestamp'],
                    'wifi_signal' => $data['wifi_signal'] ?? null,
                    'free_heap' => $data['free_heap'] ?? null,
                    'firmware_version' => $data['firmware_version'] ?? '1.0.0',
                    'source' => 'buffer',
                    'is_online' => true, // Assume online if data is coming from buffer
                    'last_seen' => $data['timestamp'] // Use buffer timestamp as last seen
                ];
            }
        }
    }
    
    $liveData = array_values($deviceLatest);
    
    // Sort by timestamp (newest first)
    usort($liveData, function($a, $b) {
        return strtotime($b['timestamp']) - strtotime($a['timestamp']);
    });
    
    sendResponse(true, $liveData, 'Live data retrieved successfully');
    
} catch (Exception $e) {
    logMessage("Error getting live data: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, [], 'Failed to retrieve live data: ' . $e->getMessage());
}
?>