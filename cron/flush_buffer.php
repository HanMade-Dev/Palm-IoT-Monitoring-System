#!/usr/bin/env php
<?php
require_once __DIR__ . '/../api/config.php';

// Run this script periodically via cron:
// Example: */5 * * * * /usr/bin/php /path/to/your/project/cron/flush_buffer.php >> /path/to/your/project/storage/logs/cron.log 2>&1

$startTime = microtime(true);

try {
    logMessage("Starting forced buffer flush process (cron)");
    
    ensureBufferDir();
    
    if (!file_exists(BUFFER_FILE) || filesize(BUFFER_FILE) === 0) {
        logMessage("Buffer file is empty or does not exist, exiting forced flush.");
        exit(0);
    }

    flushBufferToDatabase(); // This function handles reading, inserting, and clearing the buffer.
    
    $endTime = microtime(true);
    $executionTime = round($endTime - $startTime, 2);
    
    logMessage("Forced buffer flush completed successfully in {$executionTime}s");
    
} catch (Exception $e) {
    logMessage("Forced buffer flush error: " . $e->getMessage());
    exit(1);
}
?>