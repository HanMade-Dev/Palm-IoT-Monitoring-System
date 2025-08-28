
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
    $deviceName = isset($input['device_name']) ? trim($input['device_name']) : '';
    $location = isset($input['location']) ? trim($input['location']) : '';
    $description = isset($input['description']) ? trim($input['description']) : '';
    
    if (empty($deviceId) || empty($deviceName)) {
        http_response_code(400);
        sendResponse(false, null, 'Device ID and Device Name are required');
        exit;
    }
    
    $pdo = getDBConnection();
    
    // Check if device exists
    $checkSql = "SELECT device_id FROM devices WHERE device_id = ?";
    $checkStmt = $pdo->prepare($checkSql);
    $checkStmt->execute([$deviceId]);
    
    if (!$checkStmt->fetch()) {
        http_response_code(404);
        sendResponse(false, null, 'Device not found');
        exit;
    }
    
    // Update device
    $sql = "UPDATE devices SET device_name = ?, location = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE device_id = ?";
    $stmt = $pdo->prepare($sql);
    $result = $stmt->execute([$deviceName, $location, $description, $deviceId]);
    
    if ($result) {
        sendResponse(true, [
            'device_id' => $deviceId,
            'device_name' => $deviceName,
            'location' => $location,
            'description' => $description
        ]);
    } else {
        http_response_code(500);
        sendResponse(false, null, 'Failed to update device');
    }
    
} catch (Exception $e) {
    logMessage("Error updating device: " . $e->getMessage());
    http_response_code(500);
    sendResponse(false, null, 'Failed to update device');
}
?>
