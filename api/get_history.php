<?php
require_once 'config.php';

header('Content-Type: application/json');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    // Ensure buffer is flushed before querying database for comprehensive history
    // This is crucial to get the latest buffered data into the database
    ensureBufferDir();
    flushBufferToDatabase(); // Directly call flush to ensure data is moved

    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = max(1, min(1000, (int)($_GET['limit'] ?? 50)));
    
    $deviceId = $_GET['device_id'] ?? null;
    $filterType = $_GET['filter_type'] ?? 'none'; // Default to 'none' for all data
    $startDate = $_GET['start_date'] ?? null;
    $endDate = $_GET['end_date'] ?? null;
    $targetDate = $_GET['target_date'] ?? null;
    $targetDatetime = $_GET['target_datetime'] ?? null;
    $timeGranularity = $_GET['time_granularity'] ?? 'hour'; 
    
    // Export functionality
    if (isset($_GET['export']) && $_GET['export'] === 'csv') {
        exportToCsv($deviceId, $filterType, $startDate, $endDate, $targetDate, $targetDatetime, $timeGranularity);
        exit;
    }
    
    // Build WHERE conditions for database query
    $whereConditions = ["d.is_active = TRUE"];
    $params = [];
    
    if ($deviceId && $deviceId !== 'all') {
        $whereConditions[] = "sd.device_id = ?";
        $params[] = $deviceId;
    }
    
    // Date filtering logic - ONLY apply if specific date filters are provided
    $dbStartDate = null;
    $dbEndDate = null;

    $applyDateFilter = false;
    if ($filterType === 'range' && $startDate && $endDate) {
        $dbStartDate = $startDate . ' 00:00:00';
        $dbEndDate = $endDate . ' 23:59:59';
        $whereConditions[] = "sd.timestamp BETWEEN ? AND ?";
        $params[] = $dbStartDate;
        $params[] = $dbEndDate;
        $applyDateFilter = true;
    } elseif ($filterType === 'day' && $targetDate) {
        $dbStartDate = $targetDate . ' 00:00:00';
        $dbEndDate = $targetDate . ' 23:59:59';
        $whereConditions[] = "DATE(sd.timestamp) = ?";
        $params[] = $targetDate;
        $applyDateFilter = true;
    } elseif (($filterType === 'hour' || $filterType === 'minute') && $targetDatetime) {
        $datetime = new DateTime($targetDatetime);
        if ($filterType === 'hour') {
            $dbStartDate = $datetime->format('Y-m-d H:00:00');
            $dbEndDate = $datetime->format('Y-m-d H:59:59');
        } else { // minute
            $dbStartDate = $datetime->format('Y-m-d H:i:00');
            $dbEndDate = $datetime->format('Y-m-d H:i:59');
        }
        $whereConditions[] = "sd.timestamp BETWEEN ? AND ?";
        $params[] = $dbStartDate;
        $params[] = $dbEndDate;
        $applyDateFilter = true;
    }
    // If filterType is 'none', no date conditions are added, fetching all data.
    
    $whereClause = implode(" AND ", $whereConditions);
    
    // Get data from database
    $pdo = getDBConnection();
    
    $sql = "SELECT 
            sd.device_id,
            d.device_name,
            d.location,
            sd.distance,
            sd.soil_moisture,
            sd.temperature,
            sd.rain_percentage,
            sd.timestamp
        FROM sensor_data sd
        JOIN devices d ON sd.device_id = d.device_id
        WHERE $whereClause
        ORDER BY sd.timestamp DESC"; 
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
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
            
            // Apply date filters only if they were applied to DB query
            if ($applyDateFilter) {
                $dataTimestamp = strtotime($data['timestamp']);
                $skip = false;
                if ($dbStartDate && $dbEndDate) {
                    $start = strtotime($dbStartDate);
                    $end = strtotime($dbEndDate);
                    if ($dataTimestamp < $start || $dataTimestamp > $end) $skip = true;
                }
                if ($skip) continue;
            }
            
            $bufferData[] = [
                'device_id' => $data['device_id'],
                'device_name' => $data['device_name'] ?? 'Unknown Device',
                'location' => $data['device_location'] ?? 'Unknown Location',
                'distance' => $data['distance'],
                'soil_moisture' => $data['soil_moisture'],
                'temperature' => $data['temperature'],
                'rain_percentage' => $data['rain_percentage'],
                'timestamp' => $data['timestamp'],
                'source' => 'buffer' // Keep source for internal debugging if needed, but not displayed
            ];
        }
    }
    
    // Combine and sort data
    $combinedData = array_merge($dbData, $bufferData);
    
    // Sort by timestamp (newest first)
    usort($combinedData, function($a, $b) {
        return strtotime($b['timestamp']) - strtotime($a['timestamp']);
    });
    
    // Calculate total records for pagination before slicing
    $totalCombined = count($combinedData);

    // Apply pagination to combined data
    $offset = ($page - 1) * $limit;
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
    
    sendResponse(true, $paginatedData, 'History data retrieved successfully', $pagination);
    
} catch (Exception $e) {
    logMessage("Error getting history data: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, [], 'Failed to retrieve history data: ' . $e->getMessage());
}

function exportToCsv($deviceId, $filterType, $startDate, $endDate, $targetDate, $targetDatetime, $timeGranularity) {
    // Re-fetch data without pagination for export
    // This logic is similar to the main get_history, but without LIMIT/OFFSET
    
    $whereConditions = ["d.is_active = TRUE"];
    $params = [];
    
    if ($deviceId && $deviceId !== 'all') {
        $whereConditions[] = "sd.device_id = ?";
        $params[] = $deviceId;
    }
    
    $dbStartDate = null;
    $dbEndDate = null;

    $applyDateFilter = false;
    if ($filterType === 'range' && $startDate && $endDate) {
        $dbStartDate = $startDate . ' 00:00:00';
        $dbEndDate = $endDate . ' 23:59:59';
        $whereConditions[] = "sd.timestamp BETWEEN ? AND ?";
        $params[] = $dbStartDate;
        $params[] = $dbEndDate;
        $applyDateFilter = true;
    } elseif ($filterType === 'day' && $targetDate) {
        $dbStartDate = $targetDate . ' 00:00:00';
        $dbEndDate = $targetDate . ' 23:59:59';
        $whereConditions[] = "DATE(sd.timestamp) = ?";
        $params[] = $targetDate;
        $applyDateFilter = true;
    } elseif (($filterType === 'hour' || $filterType === 'minute') && $targetDatetime) {
        $datetime = new DateTime($targetDatetime);
        if ($filterType === 'hour') {
            $dbStartDate = $datetime->format('Y-m-d H:00:00');
            $dbEndDate = $datetime->format('Y-m-d H:59:59');
        } else { // minute
            $dbStartDate = $datetime->format('Y-m-d H:i:00');
            $dbEndDate = $datetime->format('Y-m-d H:i:59');
        }
        $whereConditions[] = "sd.timestamp BETWEEN ? AND ?";
        $params[] = $dbStartDate;
        $params[] = $dbEndDate;
        $applyDateFilter = true;
    }
    
    $whereClause = implode(" AND ", $whereConditions);

    $pdo = getDBConnection();
    $sql = "SELECT 
            sd.device_id,
            d.device_name,
            d.location,
            sd.distance,
            sd.soil_moisture,
            sd.temperature,
            sd.rain_percentage,
            sd.timestamp
        FROM sensor_data sd
        JOIN devices d ON sd.device_id = d.device_id
        WHERE $whereClause
        ORDER BY sd.timestamp DESC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $dbData = $stmt->fetchAll();

    // Get buffer data that matches the filters (same logic as above)
    $bufferData = [];
    if (file_exists(BUFFER_FILE)) {
        $bufferLines = file(BUFFER_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($bufferLines as $line) {
            $data = json_decode($line, true);
            if (!$data || !isset($data['device_id'])) continue;
            if ($deviceId && $deviceId !== 'all' && $data['device_id'] !== $deviceId) continue;
            
            if ($applyDateFilter) {
                $dataTimestamp = strtotime($data['timestamp']);
                $skip = false;
                if ($dbStartDate && $dbEndDate) {
                    $start = strtotime($dbStartDate);
                    $end = strtotime($dbEndDate);
                    if ($dataTimestamp < $start || $dataTimestamp > $end) $skip = true;
                }
                if ($skip) continue;
            }

            $bufferData[] = [
                'device_id' => $data['device_id'],
                'device_name' => $data['device_name'] ?? 'Unknown Device',
                'location' => $data['device_location'] ?? 'Unknown Location',
                'distance' => $data['distance'],
                'soil_moisture' => $data['soil_moisture'],
                'temperature' => $data['temperature'],
                'rain_percentage' => $data['rain_percentage'],
                'timestamp' => $data['timestamp'],
                'source' => 'buffer'
            ];
        }
    }

    $combinedData = array_merge($dbData, $bufferData);
    usort($combinedData, function($a, $b) {
        return strtotime($b['timestamp']) - strtotime($a['timestamp']);
    });

    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="sensor_data_' . date('Y-m-d_H-i-s') . '.csv"');
    
    $output = fopen('php://output', 'w');
    fputcsv($output, ['Device ID', 'Device Name', 'Location', 'Timestamp', 'Distance (cm)', 'Soil Moisture (%)', 'Temperature (°C)', 'Rain (%)']);
    
    foreach ($combinedData as $row) {
        fputcsv($output, [
            $row['device_id'],
            $row['device_name'],
            $row['location'],
            $row['timestamp'],
            $row['distance'],
            $row['soil_moisture'],
            $row['temperature'],
            $row['rain_percentage']
        ]);
    }
    
    fclose($output);
}