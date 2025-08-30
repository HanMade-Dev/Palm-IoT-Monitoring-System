
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
    
    $liveData = [];
    
    // Read from buffer file first (real-time data)
    if (file_exists(BUFFER_FILE)) {
        $bufferData = file(BUFFER_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $deviceLatest = [];
        
        // Process buffer data (newest first)
        foreach (array_reverse($bufferData) as $line) {
            $data = json_decode($line, true);
            if ($data && isset($data['device_id']) && !isset($deviceLatest[$data['device_id']])) {
                $deviceLatest[$data['device_id']] = [
                    'device_id' => $data['device_id'],
                    'device_name' => $data['device_name'] ?? 'Unknown Device',
                    'location' => $data['device_location'] ?? 'Unknown Location',
                    'distance' => $data['distance'],
                    'distance_status' => getDistanceStatus($data['distance']),
                    'soil_moisture' => $data['soil_moisture'],
                    'moisture_status' => $data['moisture_status'] ?? 'Unknown',
                    'temperature' => $data['temperature'],
                    'temperature_status' => getTemperatureStatus($data['temperature']),
                    'rain_percentage' => $data['rain_percentage'],
                    'rain_status' => $data['rain_status'] ?? 'Unknown',
                    'timestamp' => $data['timestamp'],
                    'wifi_signal' => $data['wifi_signal'] ?? null,
                    'free_heap' => $data['free_heap'] ?? null,
                    'firmware_version' => $data['firmware_version'] ?? '1.0.0'
                ];
            }
        }
        
        $liveData = array_values($deviceLatest);
    }
    
    // If no buffer data, fall back to database
    if (empty($liveData)) {
        $pdo = getDBConnection();
        
        if (DB_TYPE === 'pgsql') {
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
                sd.timestamp,
                ds.is_online,
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
        } else {
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
                sd.timestamp,
                ds.is_online,
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
        }
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        $liveData = $stmt->fetchAll();
        
        // Add computed status for database data
        foreach ($liveData as &$data) {
            if (!$data['distance_status']) {
                $data['distance_status'] = getDistanceStatus($data['distance']);
            }
            if (!$data['temperature_status']) {
                $data['temperature_status'] = getTemperatureStatus($data['temperature']);
            }
        }
    }
    
    sendResponse(true, $liveData, 'Live data retrieved successfully');
    
} catch (Exception $e) {
    logMessage("Error getting live data: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, [], 'Failed to retrieve live data: ' . $e->getMessage());
}

function getDistanceStatus($distance) {
    if ($distance === null || $distance < 0) return 'No Data';
    if ($distance < 20) return 'Tinggi';
    if ($distance < 50) return 'Sedang';
    return 'Rendah';
}

function getTemperatureStatus($temperature) {
    if ($temperature === null) return 'No Data';
    if ($temperature < 20) return 'Dingin';
    if ($temperature < 30) return 'Normal';
    return 'Panas';
}
?>
