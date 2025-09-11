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

    // Step 1: Get all registered devices
    $pdo = getDBConnection();
    $allDevicesSql = "SELECT device_id, device_name, location FROM devices WHERE is_active = TRUE";
    $allDevicesStmt = $pdo->prepare($allDevicesSql);
    $allDevicesStmt->execute();
    $registeredDevices = $allDevicesStmt->fetchAll(PDO::FETCH_ASSOC);

    // Initialize deviceLatest with default values for all registered devices
    foreach ($registeredDevices as $device) {
        $deviceLatest[$device['device_id']] = [
            'device_id' => $device['device_id'],
            'device_name' => $device['device_name'],
            'location' => $device['location'],
            'distance' => null,
            'distance_status' => 'Unknown',
            'soil_moisture' => null,
            'moisture_status' => 'Unknown',
            'temperature' => null,
            'temperature_status' => 'Unknown',
            'rain_percentage' => null,
            'rain_status' => 'Unknown',
            'timestamp' => null, // Will be updated by actual data
            'wifi_signal' => null,
            'free_heap' => null,
            'firmware_version' => '1.0.0',
            'source' => 'none',
            'is_online' => false, // Assume offline until proven otherwise
            'last_seen' => null // Will be updated by actual data or device_status
        ];
    }

    // Step 2: Get latest sensor data from database for active devices
    try {
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
        AND d.is_active = TRUE"; // Only get data for active devices

        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        $dbData = $stmt->fetchAll();

        // Update deviceLatest with database data
        foreach ($dbData as $data) {
            // Clamp last_seen to prevent future timestamps from being displayed
            $clampedLastSeen = $data['last_seen'];
            if ($data['last_seen'] && strtotime($data['last_seen']) > time()) {
                $clampedLastSeen = date('Y-m-d H:i:s');
            }
            
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
                'is_online' => (bool)$data['is_online'], // Get from device_status
                'last_seen' => $clampedLastSeen // Clamped to prevent future timestamps
            ];
        }
    } catch (Exception $e) {
        logMessage("Database error in live.php: " . $e->getMessage());
        // Continue processing even if database read fails, buffer might still have data
    }

    // Step 3: Read from buffer file (real-time data) and override database data if newer
    if (file_exists(BUFFER_FILE)) {
        $bufferData = file(BUFFER_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

        // Process buffer data (newest first)
        foreach (array_reverse($bufferData) as $line) {
            $data = json_decode($line, true);
            if (!$data || !isset($data['device_id'])) {
                continue;
            }

            $deviceId = $data['device_id'];

            // Only process if the device is registered
            if (!isset($deviceLatest[$deviceId])) {
                continue;
            }

            $isNewer = true;
            if ($deviceLatest[$deviceId]['timestamp'] !== null) {
                $dbTimestamp = strtotime($deviceLatest[$deviceId]['timestamp']);
                $bufferTimestamp = strtotime($data['timestamp']);
                $isNewer = $bufferTimestamp > $dbTimestamp;
            }

            // Only use buffer data if it's newer or if no database data exists
            if ($isNewer) {
                // Clamp buffer timestamp for last_seen display
                $bufferTime = strtotime($data['timestamp']);
                $clampedBufferLastSeen = min($bufferTime, time());
                $clampedBufferLastSeenStr = date('Y-m-d H:i:s', $clampedBufferLastSeen);
                
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
                    'last_seen' => $clampedBufferLastSeenStr // Clamped buffer timestamp for last seen
                ];
            }
        }
    }

    // Step 4: Check device online status based on data age and clear sensor data if offline
    // Device sends data every ~15 seconds, so if no data for 45 seconds = offline
    $offlineThreshold = 45; // seconds
    $currentTime = time();
    
    foreach ($deviceLatest as &$device) {
        $lastDataTime = $device['timestamp'] ? strtotime($device['timestamp']) : 0;
        // Prevent future timestamps from affecting online status calculation
        $effectiveTime = min($lastDataTime, $currentTime);
        $secondsSinceLastData = $currentTime - $effectiveTime;
        
        // Update online status based on data freshness
        if ($secondsSinceLastData > $offlineThreshold) {
            $device['is_online'] = false;
            // Clear sensor data if offline
            $device['distance'] = null;
            $device['distance_status'] = 'Unknown';
            $device['soil_moisture'] = null;
            $device['moisture_status'] = 'Unknown';
            $device['temperature'] = null;
            $device['temperature_status'] = 'Unknown';
            $device['rain_percentage'] = null;
            $device['rain_status'] = 'Unknown';
            $device['wifi_signal'] = null;
            $device['free_heap'] = null;
            // Update device_status table for persistent offline status
            try {
                $updateStatusStmt = $pdo->prepare("UPDATE device_status SET is_online = FALSE, updated_at = NOW() WHERE device_id = ?");
                $updateStatusStmt->execute([$device['device_id']]);
            } catch (Exception $e) {
                logMessage("Failed to update offline status for device " . $device['device_id'] . ": " . $e->getMessage());
            }
        } else {
            $device['is_online'] = true;
            // Update device_status table for persistent online status
            try {
                // Use clamped effective time for database last_seen update
                $clampedLastSeenForDB = date('Y-m-d H:i:s', $effectiveTime);
                // Use INSERT ... ON DUPLICATE KEY UPDATE to handle cases where device_status might not exist yet
                $updateStatusStmt = $pdo->prepare("INSERT INTO device_status (device_id, is_online, last_seen, updated_at) VALUES (?, TRUE, ?, NOW()) ON DUPLICATE KEY UPDATE is_online = TRUE, last_seen = VALUES(last_seen), updated_at = NOW()");
                $updateStatusStmt->execute([$device['device_id'], $clampedLastSeenForDB]);
            } catch (Exception $e) {
                logMessage("Failed to update online status for device " . $device['device_id'] . ": " . $e->getMessage());
            }
        }
        
        $device['seconds_since_last_data'] = $secondsSinceLastData;
    }

    $liveData = array_values($deviceLatest);

    // Sort by device name for consistent display
    usort($liveData, function($a, $b) {
        return strcmp($a['device_name'], $b['device_name']);
    });

    sendResponse(true, $liveData, 'Live data retrieved successfully');

} catch (Exception $e) {
    logMessage("Error getting live data: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, [], 'Failed to retrieve live data: ' . $e->getMessage());
}
?>