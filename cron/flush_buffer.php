
#!/usr/bin/env php
<?php
require_once __DIR__ . '/../api/config.php';

// Run this script every 10 minutes via cron:
// */10 * * * * /usr/bin/php /path/to/your/project/cron/flush_buffer.php

$startTime = microtime(true);
$processedRecords = 0;

try {
    logMessage("Starting buffer flush process");
    
    if (!file_exists(BUFFER_FILE)) {
        logMessage("No buffer file found, exiting");
        exit(0);
    }
    
    // Read buffer file
    $lines = file(BUFFER_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    
    if (empty($lines)) {
        logMessage("Buffer file is empty, exiting");
        exit(0);
    }
    
    $pdo = getDBConnection();
    $pdo->beginTransaction();
    
    // Prepare statements for bulk insert
    $deviceInsertSql = "INSERT IGNORE INTO devices (device_id, device_name, location) VALUES (?, ?, ?)";
    $deviceStmt = $pdo->prepare($deviceInsertSql);
    
    $sensorInsertSql = "INSERT INTO sensor_data (
        device_id, distance, distance_status, soil_moisture, moisture_status, 
        temperature, temperature_status, rain_percentage, rain_status, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    $sensorStmt = $pdo->prepare($sensorInsertSql);
    
    $statusInsertSql = "INSERT INTO device_status (
        device_id, is_online, last_seen, wifi_signal, free_heap, firmware_version
    ) VALUES (?, TRUE, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
        is_online = TRUE,
        last_seen = VALUES(last_seen),
        wifi_signal = VALUES(wifi_signal),
        free_heap = VALUES(free_heap),
        firmware_version = VALUES(firmware_version)";
    $statusStmt = $pdo->prepare($statusInsertSql);
    
    $validLines = [];
    
    foreach ($lines as $line) {
        $data = json_decode($line, true);
        
        if (!$data || !isset($data['device_id'])) {
            continue;
        }
        
        $validLines[] = $data;
        
        // Calculate status values
        $distanceStatus = 'Unknown';
        if ($data['distance'] !== null) {
            if ($data['distance'] < 20) $distanceStatus = 'Tinggi';
            elseif ($data['distance'] < 50) $distanceStatus = 'Sedang';
            else $distanceStatus = 'Rendah';
        } else {
            $distanceStatus = 'Error';
        }
        
        $temperatureStatus = 'Unknown';
        if ($data['temperature'] !== null) {
            if ($data['temperature'] < 20) $temperatureStatus = 'Dingin';
            elseif ($data['temperature'] < 30) $temperatureStatus = 'Normal';
            else $temperatureStatus = 'Panas';
        } else {
            $temperatureStatus = 'Error';
        }
        
        // Insert/update device
        $deviceStmt->execute([
            $data['device_id'],
            $data['device_name'],
            $data['device_location']
        ]);
        
        // Insert sensor data
        $sensorStmt->execute([
            $data['device_id'],
            $data['distance'],
            $distanceStatus,
            $data['soil_moisture'],
            $data['moisture_status'],
            $data['temperature'],
            $temperatureStatus,
            $data['rain_percentage'],
            $data['rain_status'],
            $data['timestamp']
        ]);
        
        // Update device status
        $statusStmt->execute([
            $data['device_id'],
            $data['timestamp'],
            $data['wifi_signal'],
            $data['free_heap'],
            $data['firmware_version']
        ]);
        
        $processedRecords++;
    }
    
    $pdo->commit();
    
    // Create backup of buffer before truncating
    $backupFile = BUFFER_DIR . 'backup_' . date('Y-m-d_H-i-s') . '.jsonl';
    copy(BUFFER_FILE, $backupFile);
    
    // Truncate buffer file
    file_put_contents(BUFFER_FILE, '');
    
    // Clean old backups (keep last 24 hours)
    $backupFiles = glob(BUFFER_DIR . 'backup_*.jsonl');
    foreach ($backupFiles as $backupFile) {
        if (filemtime($backupFile) < (time() - 86400)) { // 24 hours
            unlink($backupFile);
        }
    }
    
    $endTime = microtime(true);
    $executionTime = round($endTime - $startTime, 2);
    
    logMessage("Buffer flush completed successfully. Processed: $processedRecords records in {$executionTime}s");
    
} catch (Exception $e) {
    if (isset($pdo)) {
        $pdo->rollBack();
    }
    logMessage("Buffer flush error: " . $e->getMessage());
    exit(1);
}
?>
