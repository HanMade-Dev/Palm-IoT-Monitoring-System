<?php
require_once 'api/config.php';

echo "<h2>Database Setup</h2>";

try {
    $pdo = getDBConnection();
    echo "<p>✓ Database connection successful!</p>";

    // Read and execute schema
    $schema = file_get_contents('database/schema.sql');
    $statements = explode(';', $schema);

    foreach ($statements as $statement) {
        $statement = trim($statement);
        if (!empty($statement)) {
            try {
                $pdo->exec($statement);
                echo "<p>✓ Executed: " . substr($statement, 0, 50) . "...</p>";
            } catch (PDOException $e) {
                echo "<p>⚠ Warning: " . $e->getMessage() . "</p>";
            }
        }
    }

    echo "<h3>✓ Database setup completed!</h3>";
    echo "<p><a href='dashboard.html'>Go to Dashboard</a></p>";

} catch (Exception $e) {
    echo "<p style='color: red;'>✗ Error: " . $e->getMessage() . "</p>";
}
?>