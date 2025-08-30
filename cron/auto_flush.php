
#!/usr/bin/env php
<?php
require_once __DIR__ . '/../api/config.php';

// This script can be called periodically to flush buffer data
// Usage: php auto_flush.php

$startTime = microtime(true);

try {
    logMessage("Starting auto-flush process");
    
    ensureBufferDir();
    autoFlushBuffer();
    
    $endTime = microtime(true);
    $executionTime = round($endTime - $startTime, 2);
    
    logMessage("Auto-flush completed in {$executionTime}s");
    
} catch (Exception $e) {
    logMessage("Auto-flush error: " . $e->getMessage());
    exit(1);
}
?>
