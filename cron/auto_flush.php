#!/usr/bin/env php
<?php
require_once __DIR__ . '/../api/config.php';

// This script can be called periodically to flush buffer data
// It's a simpler version of flush_buffer.php, primarily for auto-flush logic
// Usage: php auto_flush.php

$startTime = microtime(true);

try {
    logMessage("Starting auto-flush process (cron)");
    
    ensureBufferDir();
    flushBufferToDatabase(); // Directly call flush, autoFlushBuffer checks conditions internally
    
    $endTime = microtime(true);
    $executionTime = round($endTime - $startTime, 2);
    
    logMessage("Auto-flush (cron) completed in {$executionTime}s");
    
} catch (Exception $e) {
    logMessage("Auto-flush (cron) error: " . $e->getMessage());
    exit(1);
}
?>