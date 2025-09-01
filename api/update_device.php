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

    // Sanitize input
    $deviceId = sanitizeInput($data['device_id']);
    $deviceName = isset($data['device_name']) ? sanitizeInput($data['device_name']) : null;
    $location = isset($data['location']) ? sanitizeInput($data['location']) : null;
    $description = isset($data['description']) ? sanitizeInput($data['description']) : null;

    $pdo = getDBConnection();

    // Check if device exists
    $checkSql = "SELECT device_id FROM devices WHERE device_id = ? AND is_active = TRUE";
    $checkStmt = $pdo->prepare($checkSql);
    $checkStmt->execute([$deviceId]);
    
    if (!$checkStmt->fetch()) {
        throw new Exception('Device not found');
    }

    // Build update query dynamically
    $updateFields = [];
    $updateValues = [];

    if ($deviceName !== null) {
        $updateFields[] = "device_name = ?";
        $updateValues[] = $deviceName;
    }

    if ($location !== null) {
        $updateFields[] = "location = ?";
        $updateValues[] = $location;
    }

    if ($description !== null) {
        $updateFields[] = "description = ?";
        $updateValues[] = $description;
    }

    if (empty($updateFields)) {
        throw new Exception('No fields to update');
    }

    $updateFields[] = "updated_at = NOW()"; // Always update updated_at
    $updateValues[] = $deviceId;

    $updateSql = "UPDATE devices SET " . implode(', ', $updateFields) . " WHERE device_id = ?";
    $updateStmt = $pdo->prepare($updateSql);
    $updateStmt->execute($updateValues);

    logMessage("Device updated successfully: $deviceId");
    sendResponse(true, ['device_id' => $deviceId], 'Device updated successfully');

} catch (Exception $e) {
    logMessage("Error updating device: " . $e->getMessage());
    http_response_code(400);
    sendResponse(false, null, $e->getMessage());
}
?>