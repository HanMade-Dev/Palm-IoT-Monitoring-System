
<?php
require_once 'config.php';

try {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        http_response_code(400);
        sendResponse(false, null, 'Invalid JSON input');
        exit;
    }
    
    $deviceId = isset($input['device_id']) ? trim($input['device_id']) : '';
    
    if (empty($deviceId)) {
        http_response_code(400);
        sendResponse(false, null, 'Device ID is required');
        exit;
    }
    
    $pdo = getDBConnection();
    
    // Check if device exists
    $checkSql = "SELECT device_id, device_name FROM devices WHERE device_id = ?";
    $checkStmt = $pdo->prepare($checkSql);
    $checkStmt->execute([$deviceId]);
    $device = $checkStmt->fetch();
    
    if (!$device) {
        http_response_code(404);
        sendResponse(false, null, 'Device not found');
        exit;
    }
    
    // Start transaction
    $pdo->beginTransaction();
    
    try {
        // Delete device status
        $statusSql = "DELETE FROM device_status WHERE device_id = ?";
        $statusStmt = $pdo->prepare($statusSql);
        $statusStmt->execute([$deviceId]);
        
        // Delete sensor data
        $dataSql = "DELETE FROM sensor_data WHERE device_id = ?";
        $dataStmt = $pdo->prepare($dataSql);
        $dataStmt->execute([$deviceId]);
        
        // Delete device
        $deviceSql = "DELETE FROM devices WHERE device_id = ?";
        $deviceStmt = $pdo->prepare($deviceSql);
        $deviceStmt->execute([$deviceId]);
        
        // Commit transaction
        $pdo->commit();
        
        sendResponse(true, [
            'device_id' => $deviceId,
            'device_name' => $device['device_name']
        ]);
        
    } catch (Exception $e) {
        // Rollback transaction on error
        $pdo->rollback();
        throw $e;
    }
    
} catch (Exception $e) {
    logMessage("Error deleting device: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, null, 'Failed to delete device');
}
?>
