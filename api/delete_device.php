
<?php
require_once 'config.php';

header('Content-Type: application/json');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    sendResponse(false, null, 'Method not allowed');
    exit;
}

try {
    // Get input data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Invalid JSON data');
    }

    // Validate required fields
    if (!isset($data['device_id']) || empty(trim($data['device_id']))) {
        throw new Exception('Device ID is required');
    }

    $deviceId = sanitizeInput($data['device_id']);
    $pdo = getDBConnection();

    // Check if device exists
    $checkSql = "SELECT device_id FROM devices WHERE device_id = ?";
    $checkStmt = $pdo->prepare($checkSql);
    $checkStmt->execute([$deviceId]);
    
    if (!$checkStmt->fetch()) {
        throw new Exception('Device not found');
    }

    // Start transaction
    $pdo->beginTransaction();

    try {
        // Delete device status first (due to foreign key)
        $deleteStatusSql = "DELETE FROM device_status WHERE device_id = ?";
        $deleteStatusStmt = $pdo->prepare($deleteStatusSql);
        $deleteStatusStmt->execute([$deviceId]);

        // Delete sensor data
        $deleteSensorSql = "DELETE FROM sensor_data WHERE device_id = ?";
        $deleteSensorStmt = $pdo->prepare($deleteSensorSql);
        $deleteSensorStmt->execute([$deviceId]);

        // Delete device
        $deleteDeviceSql = "DELETE FROM devices WHERE device_id = ?";
        $deleteDeviceStmt = $pdo->prepare($deleteDeviceSql);
        $deleteDeviceStmt->execute([$deviceId]);

        // Remove API key
        require_once '../config/api_keys.php';
        removeApiKey($deviceId);

        $pdo->commit();
        
        logMessage("Device deleted successfully: $deviceId");
        sendResponse(true, ['device_id' => $deviceId], 'Device deleted successfully');

    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }

} catch (Exception $e) {
    logMessage("Error deleting device: " . $e->getMessage());
    http_response_code(400);
    sendResponse(false, null, $e->getMessage());
}
?>
