<?php
/**
 * API Key management for IoT devices
 */

// In-memory storage for development (replace with database in production)
$API_KEYS = [];

/**
 * Store API key for a device
 */
function storeApiKey($deviceId, $apiKey) {
    global $API_KEYS;
    $API_KEYS[$deviceId] = $apiKey;

    // For production, store in database or secure storage
    $file = __DIR__ . '/keys.json';
    $existingKeys = [];

    if (file_exists($file)) {
        $existingKeys = json_decode(file_get_contents($file), true) ?: [];
    }

    $existingKeys[$deviceId] = $apiKey;
    file_put_contents($file, json_encode($existingKeys, JSON_PRETTY_PRINT));
}

/**
 * Verify API key for a device
 */
function verifyApiKey($providedKey) {
    global $API_KEYS;

    // Load from file
    $file = __DIR__ . '/keys.json';
    if (file_exists($file)) {
        $storedKeys = json_decode(file_get_contents($file), true) ?: [];
        return in_array($providedKey, $storedKeys);
    }

    return in_array($providedKey, $API_KEYS);
}

/**
 * Generate a secure API key
 */
function generateSecureApiKey() {
    return bin2hex(random_bytes(32));
}

/**
 * Remove API key for a device
 */
function removeApiKey($deviceId) {
    global $API_KEYS;

    // Remove from in-memory storage
    if (isset($API_KEYS[$deviceId])) {
        unset($API_KEYS[$deviceId]);
    }

    // Remove from file storage
    $file = __DIR__ . '/keys.json';
    if (file_exists($file)) {
        $existingKeys = json_decode(file_get_contents($file), true) ?: [];
        if (isset($existingKeys[$deviceId])) {
            unset($existingKeys[$deviceId]);
            file_put_contents($file, json_encode($existingKeys, JSON_PRETTY_PRINT));
        }
    }

    return true;
}
?>