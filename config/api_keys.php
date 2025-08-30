
<?php
/**
 * API Keys Management for IoT Device Authentication
 */

// Load API keys from JSON file
function loadApiKeys() {
    $keysFile = __DIR__ . '/keys.json';
    if (!file_exists($keysFile)) {
        // Create default keys file if it doesn't exist
        $defaultKeys = [
            "1f11fa20102377bc01ea17d87311604be3cdf56083139026472af0db6f6db6a0" => [
                "device_id" => "DEVICE_TEST",
                "name" => "Test Device",
                "created_at" => date('Y-m-d H:i:s'),
                "active" => true
            ]
        ];
        file_put_contents($keysFile, json_encode($defaultKeys, JSON_PRETTY_PRINT));
        return $defaultKeys;
    }
    
    $content = file_get_contents($keysFile);
    return json_decode($content, true) ?? [];
}

// Save API keys to JSON file
function saveApiKeys($keys) {
    $keysFile = __DIR__ . '/keys.json';
    return file_put_contents($keysFile, json_encode($keys, JSON_PRETTY_PRINT));
}

// Verify API key
function verifyApiKey($providedKey, $deviceId = null) {
    $keys = loadApiKeys();
    
    // Debug logging
    error_log("Verifying API key: $providedKey for device: $deviceId");
    error_log("Available keys: " . json_encode(array_keys($keys)));
    
    if (!isset($keys[$providedKey])) {
        error_log("API key not found in keys array");
        return false;
    }
    
    $keyData = $keys[$providedKey];
    error_log("Key data: " . json_encode($keyData));
    
    // Check if key is active
    if (!$keyData['active']) {
        error_log("API key is not active");
        return false;
    }
    
    // If device_id is provided, verify it matches
    if ($deviceId !== null && $keyData['device_id'] !== $deviceId) {
        error_log("Device ID mismatch. Expected: " . $keyData['device_id'] . ", Got: $deviceId");
        return false;
    }
    
    error_log("API key verification successful");
    return true;
}

// Generate new API key for device
function generateApiKey($deviceId, $deviceName) {
    $keys = loadApiKeys();
    $newKey = bin2hex(random_bytes(32));
    
    $keys[$newKey] = [
        "device_id" => $deviceId,
        "name" => $deviceName,
        "created_at" => date('Y-m-d H:i:s'),
        "active" => true
    ];
    
    saveApiKeys($keys);
    return $newKey;
}

// Revoke API key
function revokeApiKey($apiKey) {
    $keys = loadApiKeys();
    if (isset($keys[$apiKey])) {
        $keys[$apiKey]['active'] = false;
        saveApiKeys($keys);
        return true;
    }
    return false;
}
?>
