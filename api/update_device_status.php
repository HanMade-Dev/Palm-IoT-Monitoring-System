
<?php
require_once 'config.php';

try {
    $pdo = getDBConnection();
    
    // Update all devices to offline initially
    $sql = "UPDATE device_status SET is_online = FALSE WHERE last_seen < (CURRENT_TIMESTAMP - INTERVAL '5 minutes')";
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    
    // Get devices that have sent data in last 5 minutes (mark as online)
    $sql = "UPDATE device_status ds SET is_online = TRUE 
            WHERE ds.device_id IN (
                SELECT DISTINCT sd.device_id 
                FROM sensor_data sd 
                WHERE sd.timestamp > (CURRENT_TIMESTAMP - INTERVAL '5 minutes')
            )";
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    
    sendResponse(true, ['message' => 'Device status updated']);
    
} catch (Exception $e) {
    logMessage("Error updating device status: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, null, 'Failed to update device status');
}
?>
