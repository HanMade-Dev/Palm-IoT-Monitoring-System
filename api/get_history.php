
<?php
require_once 'config.php';

header('Content-Type: application/json');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = max(1, min(1000, (int)($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;
    
    $deviceId = $_GET['device_id'] ?? null;
    $sensorType = $_GET['sensor_type'] ?? 'all';
    $filterType = $_GET['filter_type'] ?? 'range';
    $startDate = $_GET['start_date'] ?? null;
    $endDate = $_GET['end_date'] ?? null;
    $targetDate = $_GET['target_date'] ?? null;
    $targetDatetime = $_GET['target_datetime'] ?? null;
    $timeGranularity = $_GET['time_granularity'] ?? 'hour';
    
    // Export functionality
    if (isset($_GET['export']) && $_GET['export'] === 'csv') {
        exportToCsv($deviceId, $sensorType, $filterType, $startDate, $endDate, $targetDate, $targetDatetime, $timeGranularity);
        exit;
    }
    
    ensureBufferDir();
    
    // Build WHERE conditions
    $whereConditions = ["d.is_active = TRUE"];
    $params = [];
    
    if ($deviceId && $deviceId !== 'all') {
        $whereConditions[] = "sd.device_id = ?";
        $params[] = $deviceId;
    }
    
    // Date filtering
    if ($filterType === 'range' && $startDate && $endDate) {
        $whereConditions[] = "DATE(sd.timestamp) BETWEEN ? AND ?";
        $params[] = $startDate;
        $params[] = $endDate;
    } elseif ($filterType === 'day' && $targetDate) {
        $whereConditions[] = "DATE(sd.timestamp) = ?";
        $params[] = $targetDate;
    } elseif (($filterType === 'hour' || $filterType === 'minute') && $targetDatetime) {
        $datetime = new DateTime($targetDatetime);
        if ($filterType === 'hour') {
            $startTime = $datetime->format('Y-m-d H:00:00');
            $endTime = $datetime->format('Y-m-d H:59:59');
        } else { // minute
            $startTime = $datetime->format('Y-m-d H:i:00');
            $endTime = $datetime->format('Y-m-d H:i:59');
        }
        $whereConditions[] = "sd.timestamp BETWEEN ? AND ?";
        $params[] = $startTime;
        $params[] = $endTime;
    }
    
    $whereClause = implode(" AND ", $whereConditions);
    
    // Get data from database
    $pdo = getDBConnection();
    
    // Count total records
    $countSql = "SELECT COUNT(*) as total 
                 FROM sensor_data sd 
                 JOIN devices d ON sd.device_id = d.device_id 
                 WHERE $whereClause";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $totalRecords = $countStmt->fetch()['total'];
    
    // Get paginated data
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
        WHERE $whereClause
        ORDER BY sd.timestamp DESC
        LIMIT ? OFFSET ?";
    
    $allParams = array_merge($params, [$limit, $offset]);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($allParams);
    $dbData = $stmt->fetchAll();
    
    // Get buffer data that matches the filters
    $bufferData = [];
    if (file_exists(BUFFER_FILE)) {
        $bufferLines = file(BUFFER_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        
        foreach ($bufferLines as $line) {
            $data = json_decode($line, true);
            if (!$data || !isset($data['device_id'])) continue;
            
            // Apply device filter
            if ($deviceId && $deviceId !== 'all' && $data['device_id'] !== $deviceId) {
                continue;
            }
            
            // Apply date filters
            $dataTimestamp = strtotime($data['timestamp']);
            $skip = false;
            
            if ($filterType === 'range' && $startDate && $endDate) {
                $start = strtotime($startDate);
                $end = strtotime($endDate . ' 23:59:59');
                if ($dataTimestamp < $start || $dataTimestamp > $end) $skip = true;
            } elseif ($filterType === 'day' && $targetDate) {
                $target = strtotime($targetDate);
                $targetEnd = strtotime($targetDate . ' 23:59:59');
                if ($dataTimestamp < $target || $dataTimestamp > $targetEnd) $skip = true;
            } elseif (($filterType === 'hour' || $filterType === 'minute') && $targetDatetime) {
                $datetime = new DateTime($targetDatetime);
                if ($filterType === 'hour') {
                    $startTime = strtotime($datetime->format('Y-m-d H:00:00'));
                    $endTime = strtotime($datetime->format('Y-m-d H:59:59'));
                } else {
                    $startTime = strtotime($datetime->format('Y-m-d H:i:00'));
                    $endTime = strtotime($datetime->format('Y-m-d H:i:59'));
                }
                if ($dataTimestamp < $startTime || $dataTimestamp > $endTime) $skip = true;
            }
            
            if (!$skip) {
                $bufferData[] = [
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
                    'source' => 'buffer'
                ];
            }
        }
    }
    
    // Combine and sort data
    $combinedData = array_merge($dbData, $bufferData);
    
    // Sort by timestamp (newest first)
    usort($combinedData, function($a, $b) {
        return strtotime($b['timestamp']) - strtotime($a['timestamp']);
    });
    
    // Apply pagination to combined data
    $totalCombined = count($combinedData);
    $paginatedData = array_slice($combinedData, $offset, $limit);
    
    // Calculate pagination info
    $totalPages = ceil($totalCombined / $limit);
    
    $pagination = [
        'current_page' => $page,
        'total_pages' => $totalPages,
        'total' => $totalCombined,
        'per_page' => $limit,
        'has_next' => $page < $totalPages,
        'has_prev' => $page > 1
    ];
    
    sendResponse(true, $paginatedData, 'History data retrieved successfully', null, $pagination);
    
} catch (Exception $e) {
    logMessage("Error getting history data: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, [], 'Failed to retrieve history data: ' . $e->getMessage());
}

function sendResponse($success, $data = null, $message = null, $chartData = null, $pagination = null) {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization');

    $response = [
        'success' => $success,
        'data' => $data,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ];
    
    if ($pagination) {
        $response['pagination'] = $pagination;
    }
    
    if ($chartData) {
        $response['chart_data'] = $chartData;
    }

    echo json_encode($response);
}

function exportToCsv($deviceId, $sensorType, $filterType, $startDate, $endDate, $targetDate, $targetDatetime, $timeGranularity) {
    // Implementation for CSV export
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="sensor_data_' . date('Y-m-d_H-i-s') . '.csv"');
    
    $output = fopen('php://output', 'w');
    fputcsv($output, ['Device ID', 'Device Name', 'Location', 'Timestamp', 'Distance (cm)', 'Soil Moisture (%)', 'Temperature (°C)', 'Rain (%)']);
    
    // Get data without pagination for export
    // Similar query logic but without LIMIT/OFFSET
    
    fclose($output);
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
