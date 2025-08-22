<?php
require_once 'config.php';

try {
    // Get parameters
    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $limit = isset($_GET['limit']) ? min(100, max(10, (int)$_GET['limit'])) : 50;
    $sensorType = isset($_GET['sensor_type']) ? $_GET['sensor_type'] : 'all';
    $deviceId = isset($_GET['device_id']) ? sanitizeInput($_GET['device_id']) : null;
    $export = isset($_GET['export']) ? $_GET['export'] : false;
    $filterType = isset($_GET['filter_type']) ? $_GET['filter_type'] : 'range';
    
    // Handle different filter types
    $startDate = date('Y-m-d', strtotime('-7 days'));
    $endDate = date('Y-m-d');
    $startDateTime = null;
    $endDateTime = null;
    
    if ($filterType === 'range') {
        $startDate = isset($_GET['start_date']) ? $_GET['start_date'] : $startDate;
        $endDate = isset($_GET['end_date']) ? $_GET['end_date'] : $endDate;
        $startDateTime = $startDate . ' 00:00:00';
        $endDateTime = $endDate . ' 23:59:59';
    } elseif ($filterType === 'day') {
        $targetDate = isset($_GET['target_date']) ? $_GET['target_date'] : date('Y-m-d');
        $startDateTime = $targetDate . ' 00:00:00';
        $endDateTime = $targetDate . ' 23:59:59';
    } elseif ($filterType === 'hour') {
        $targetDatetime = isset($_GET['target_datetime']) ? $_GET['target_datetime'] : date('Y-m-d H:i');
        $targetHour = date('Y-m-d H:00:00', strtotime($targetDatetime));
        $startDateTime = $targetHour;
        $endDateTime = date('Y-m-d H:59:59', strtotime($targetHour));
    } elseif ($filterType === 'minute') {
        $targetDatetime = isset($_GET['target_datetime']) ? $_GET['target_datetime'] : date('Y-m-d H:i');
        $targetMinute = date('Y-m-d H:i:00', strtotime($targetDatetime));
        $startDateTime = $targetMinute;
        $endDateTime = date('Y-m-d H:i:59', strtotime($targetMinute));
    }
    
    // Validate datetime
    if (!strtotime($startDateTime) || !strtotime($endDateTime)) {
        throw new Exception('Invalid date/time format');
    }
    
    // Ensure end datetime is not before start datetime
    if (strtotime($endDateTime) < strtotime($startDateTime)) {
        throw new Exception('End date/time cannot be before start date/time');
    }
    
    // Connect to database
    $pdo = getDBConnection();
    
    // Build WHERE clause based on sensor type and device
    $whereClause = "WHERE sd.timestamp BETWEEN ? AND ?";
    $params = [$startDateTime, $endDateTime];
    
    // Add device filter if specified
    if ($deviceId && $deviceId !== 'all') {
        $whereClause .= " AND sd.device_id = ?";
        $params[] = $deviceId;
    }
    
    // Additional filters based on sensor type
    switch ($sensorType) {
        case 'distance':
            $whereClause .= " AND distance IS NOT NULL";
            break;
        case 'moisture':
            $whereClause .= " AND soil_moisture IS NOT NULL";
            break;
        case 'temperature':
            $whereClause .= " AND temperature IS NOT NULL";
            break;
        case 'rain':
            $whereClause .= " AND rain_percentage IS NOT NULL";
            break;
    }
    
    // Handle export
    if ($export === 'csv') {
        exportToCsv($pdo, $whereClause, $params, $sensorType);
        exit;
    }
    
    // Get total count
    $countSql = "SELECT COUNT(*) as total 
                FROM sensor_data sd 
                JOIN devices d ON sd.device_id = d.device_id 
                $whereClause AND d.is_active = TRUE";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $totalRecords = $countStmt->fetch()['total'];
    
    // Calculate pagination
    $totalPages = ceil($totalRecords / $limit);
    $offset = ($page - 1) * $limit;
    
    // Get data with pagination
    $sql = "SELECT 
        sd.id,
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
    $whereClause AND d.is_active = TRUE
    ORDER BY sd.timestamp DESC 
    LIMIT ? OFFSET ?";
    
    $params[] = $limit;
    $params[] = $offset;
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $data = $stmt->fetchAll();
    
    // Format data
    $formattedData = array_map(function($row) {
        return [
            'id' => (int)$row['id'],
            'device_id' => $row['device_id'],
            'device_name' => $row['device_name'],
            'location' => $row['location'],
            'distance' => $row['distance'] ? (int)$row['distance'] : null,
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
    
    // Get chart data (limited for performance)
    $chartData = getChartData($pdo, $whereClause, array_slice($params, 0, -2), $sensorType);
    
    // Prepare response
    $response = [
        'data' => $formattedData,
        'chart_data' => $chartData,
        'pagination' => [
            'current_page' => $page,
            'total_pages' => $totalPages,
            'total_records' => (int)$totalRecords,
            'records_per_page' => $limit,
            'has_next' => $page < $totalPages,
            'has_prev' => $page > 1
        ]
    ];
    
    sendResponse(true, $response);
    
} catch (Exception $e) {
    logMessage("Error getting history data: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, null, $e->getMessage());
}

function getChartData($pdo, $whereClause, $params, $sensorType) {
    // Limit chart data points for better performance
    $chartLimit = 200;
    
    $sql = "SELECT 
        sd.device_id,
        sd.distance,
        sd.soil_moisture,
        sd.temperature,
        sd.rain_percentage,
        sd.timestamp
    FROM sensor_data sd
    JOIN devices d ON sd.device_id = d.device_id 
    $whereClause AND d.is_active = TRUE
    ORDER BY sd.timestamp ASC 
    LIMIT ?";
    
    $params[] = $chartLimit;
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $chartData = $stmt->fetchAll();
    
    return array_map(function($row) {
        return [
            'device_id' => $row['device_id'],
            'distance' => $row['distance'] ? (int)$row['distance'] : 0,
            'soil_moisture' => (int)$row['soil_moisture'],
            'temperature' => $row['temperature'] ? (float)$row['temperature'] : 0,
            'rain_percentage' => (int)$row['rain_percentage'],
            'timestamp' => $row['timestamp']
        ];
    }, $chartData);
}

function exportToCsv($pdo, $whereClause, $params, $sensorType) {
    // Set CSV headers
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="iot_data_' . date('Y-m-d') . '.csv"');
    
    $output = fopen('php://output', 'w');
    
    // CSV headers
    $headers = ['Timestamp', 'Jarak Air (cm)', 'Kelembaban Tanah (%)', 'Status Kelembaban', 
               'Suhu Udara (°C)', 'Hujan (%)', 'Status Hujan'];
    fputcsv($output, $headers);
    
    // Get all data for export (limit to prevent memory issues)
    $sql = "SELECT 
        distance,
        soil_moisture,
        moisture_status,
        temperature,
        rain_percentage,
        rain_status,
        timestamp
    FROM sensor_data 
    $whereClause 
    ORDER BY timestamp DESC 
    LIMIT 10000";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    
    while ($row = $stmt->fetch()) {
        $csvRow = [
            $row['timestamp'],
            $row['distance'] ?: '-',
            $row['soil_moisture'],
            $row['moisture_status'],
            $row['temperature'] ?: '-',
            $row['rain_percentage'],
            $row['rain_status']
        ];
        fputcsv($output, $csvRow);
    }
    
    fclose($output);
}
?>
