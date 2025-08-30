
<?php
require_once 'api/config.php';

try {
    echo "Setting up database...\n";
    
    $pdo = getDBConnection();
    
    // Read and execute schema
    $schema = file_get_contents('database/schema.sql');
    
    // Split schema into individual statements
    $statements = array_filter(array_map('trim', explode(';', $schema)));
    
    foreach ($statements as $statement) {
        if (!empty($statement)) {
            echo "Executing: " . substr($statement, 0, 50) . "...\n";
            $pdo->exec($statement);
        }
    }
    
    echo "Database setup completed successfully!\n";
    
    // Test connection
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM devices");
    $result = $stmt->fetch();
    echo "Devices table has {$result['count']} records\n";
    
} catch (Exception $e) {
    echo "Database setup error: " . $e->getMessage() . "\n";
    exit(1);
}
?>
