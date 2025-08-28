-- Database schema for IoT Kelapa Sawit Monitoring System
-- Run this script in PHPMyAdmin to create the database and tables

-- Create database
CREATE DATABASE IF NOT EXISTS fare1399_sawit_iot_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fare1399_sawit_iot_db;

-- Create devices table
CREATE TABLE devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL UNIQUE,
    device_name VARCHAR(100) NOT NULL,
    location VARCHAR(100) NULL,
    description TEXT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device_id (device_id),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB COMMENT='Registered IoT devices';

-- Create sensor_data table (modified for multi-device)
CREATE TABLE sensor_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    distance INT NULL COMMENT 'Water distance in cm (NULL if sensor error)',
    distance_status ENUM('Error', 'Tinggi', 'Normal', 'Rendah', 'Unknown') NOT NULL DEFAULT 'Unknown',
    soil_moisture INT NOT NULL COMMENT 'Soil moisture percentage (0-100)',
    moisture_status ENUM('Kering', 'Cukup', 'Basah', 'Unknown') NOT NULL DEFAULT 'Unknown',
    temperature FLOAT NULL COMMENT 'Temperature in Celsius (NULL if sensor error)',
    temperature_status ENUM('Error', 'Dingin', 'Normal', 'Panas', 'Unknown') NOT NULL DEFAULT 'Unknown',
    rain_percentage INT NOT NULL COMMENT 'Rain percentage (0-100)',
    rain_status ENUM('Kering', 'Cukup', 'Hujan', 'Unknown') NOT NULL DEFAULT 'Unknown',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_device_id (device_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_device_timestamp (device_id, timestamp),
    INDEX idx_moisture (soil_moisture),
    INDEX idx_temperature (temperature),
    INDEX idx_rain (rain_percentage)
) ENGINE=InnoDB COMMENT='Main sensor data table for multiple devices';

-- Create alerts table for storing alert history
CREATE TABLE alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sensor_type ENUM('distance', 'moisture', 'temperature', 'rain', 'system') NOT NULL,
    alert_level ENUM('info', 'warning', 'danger') NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    sensor_value FLOAT NULL COMMENT 'The sensor value that triggered the alert',
    threshold_value FLOAT NULL COMMENT 'The threshold that was exceeded',
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at),
    INDEX idx_sensor_type (sensor_type),
    INDEX idx_alert_level (alert_level),
    INDEX idx_is_resolved (is_resolved)
) ENGINE=InnoDB COMMENT='Alert history and management';

-- Create device_status table for monitoring ESP32 connection (modified for multi-device)
CREATE TABLE device_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    is_online BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) NULL,
    wifi_signal INT NULL COMMENT 'WiFi signal strength in dBm',
    battery_level INT NULL COMMENT 'Battery level percentage (if applicable)',
    firmware_version VARCHAR(20) NULL,
    free_heap INT NULL COMMENT 'ESP32 free heap memory',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY unique_device_status (device_id),
    INDEX idx_device_id (device_id),
    INDEX idx_last_seen (last_seen),
    INDEX idx_is_online (is_online)
) ENGINE=InnoDB COMMENT='Device connection status tracking for multiple devices';

-- Create system_config table for storing system settings
CREATE TABLE system_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT NOT NULL,
    description TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_config_key (config_key)
) ENGINE=InnoDB COMMENT='System configuration settings';

-- Insert default system configuration
INSERT INTO system_config (config_key, config_value, description) VALUES
('data_retention_days', '365', 'Number of days to keep sensor data'),
('alert_distance_min', '10', 'Minimum water distance threshold (cm)'),
('alert_distance_max', '100', 'Maximum water distance threshold (cm)'),
('alert_moisture_min', '30', 'Minimum soil moisture threshold (%)'),
('alert_moisture_max', '80', 'Maximum soil moisture threshold (%)'),
('alert_temperature_min', '20', 'Minimum temperature threshold (°C)'),
('alert_temperature_max', '35', 'Maximum temperature threshold (°C)'),
('alert_rain_threshold', '50', 'Rain detection threshold (%)'),
('update_interval', '3000', 'Dashboard update interval in milliseconds'),
('email_notifications', 'false', 'Enable email notifications for alerts'),
('sms_notifications', 'false', 'Enable SMS notifications for alerts');

-- Create data_summary table for daily/hourly aggregations
CREATE TABLE data_summary (
    id INT AUTO_INCREMENT PRIMARY KEY,
    summary_date DATE NOT NULL,
    summary_hour TINYINT NULL COMMENT 'Hour (0-23) for hourly summary, NULL for daily',
    avg_distance FLOAT NULL,
    min_distance INT NULL,
    max_distance INT NULL,
    avg_soil_moisture FLOAT NOT NULL,
    min_soil_moisture INT NOT NULL,
    max_soil_moisture INT NOT NULL,
    avg_temperature FLOAT NULL,
    min_temperature FLOAT NULL,
    max_temperature FLOAT NULL,
    avg_rain_percentage FLOAT NOT NULL,
    min_rain_percentage INT NOT NULL,
    max_rain_percentage INT NOT NULL,
    total_readings INT NOT NULL DEFAULT 0,
    rain_detected_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_summary (summary_date, summary_hour),
    INDEX idx_summary_date (summary_date),
    INDEX idx_summary_hour (summary_hour)
) ENGINE=InnoDB COMMENT='Daily and hourly data summaries';

-- Create stored procedure for data cleanup
DELIMITER //
CREATE PROCEDURE CleanupOldData()
BEGIN
    DECLARE retention_days INT DEFAULT 365;
    
    -- Get retention setting
    SELECT config_value INTO retention_days 
    FROM system_config 
    WHERE config_key = 'data_retention_days';
    
    -- Delete old sensor data
    DELETE FROM sensor_data 
    WHERE timestamp < DATE_SUB(NOW(), INTERVAL retention_days DAY);
    
    -- Delete old resolved alerts
    DELETE FROM alerts 
    WHERE is_resolved = TRUE 
    AND resolved_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
    
    -- Delete old device status records (keep last 7 days)
    DELETE FROM device_status 
    WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
    
END//
DELIMITER ;

-- Create stored procedure for generating daily summaries
DELIMITER //
CREATE PROCEDURE GenerateDailySummary(IN target_date DATE)
BEGIN
    INSERT INTO data_summary (
        summary_date,
        avg_distance,
        min_distance,
        max_distance,
        avg_soil_moisture,
        min_soil_moisture,
        max_soil_moisture,
        avg_temperature,
        min_temperature,
        max_temperature,
        avg_rain_percentage,
        min_rain_percentage,
        max_rain_percentage,
        total_readings,
        rain_detected_count
    )
    SELECT 
        target_date,
        AVG(distance),
        MIN(distance),
        MAX(distance),
        AVG(soil_moisture),
        MIN(soil_moisture),
        MAX(soil_moisture),
        AVG(temperature),
        MIN(temperature),
        MAX(temperature),
        AVG(rain_percentage),
        MIN(rain_percentage),
        MAX(rain_percentage),
        COUNT(*),
        SUM(CASE WHEN rain_status = 'Hujan' THEN 1 ELSE 0 END)
    FROM sensor_data
    WHERE DATE(timestamp) = target_date
    ON DUPLICATE KEY UPDATE
        avg_distance = VALUES(avg_distance),
        min_distance = VALUES(min_distance),
        max_distance = VALUES(max_distance),
        avg_soil_moisture = VALUES(avg_soil_moisture),
        min_soil_moisture = VALUES(min_soil_moisture),
        max_soil_moisture = VALUES(max_soil_moisture),
        avg_temperature = VALUES(avg_temperature),
        min_temperature = VALUES(min_temperature),
        max_temperature = VALUES(max_temperature),
        avg_rain_percentage = VALUES(avg_rain_percentage),
        min_rain_percentage = VALUES(min_rain_percentage),
        max_rain_percentage = VALUES(max_rain_percentage),
        total_readings = VALUES(total_readings),
        rain_detected_count = VALUES(rain_detected_count);
END//
DELIMITER ;

-- Create events for automatic maintenance (if EVENT scheduler is enabled)
-- Uncomment the following lines if you want automatic cleanup

-- SET GLOBAL event_scheduler = ON;

-- CREATE EVENT IF NOT EXISTS daily_cleanup
-- ON SCHEDULE EVERY 1 DAY
-- STARTS CURRENT_TIMESTAMP
-- DO CALL CleanupOldData();

-- CREATE EVENT IF NOT EXISTS daily_summary
-- ON SCHEDULE EVERY 1 DAY
-- STARTS CURRENT_TIMESTAMP + INTERVAL 1 HOUR
-- DO CALL GenerateDailySummary(CURDATE() - INTERVAL 1 DAY);

-- Insert default devices
INSERT INTO devices (device_id, device_name, location, description) VALUES
('ESP32_SAWIT_01', 'Sensor Utama', 'Area Utama', 'Sensor monitoring kelapa sawit area utama'),
('ESP32_SAWIT_02', 'Sensor Timur', 'Area Timur', 'Sensor monitoring kelapa sawit area timur'),
('ESP32_SAWIT_03', 'Sensor Barat', 'Area Barat', 'Sensor monitoring kelapa sawit area barat');

-- Insert sample device status (optional)
INSERT INTO device_status (device_id, is_online, ip_address, firmware_version) VALUES
('ESP32_SAWIT_01', TRUE, '192.168.1.100', '2.0.0'),
('ESP32_SAWIT_02', FALSE, NULL, '2.0.0'),
('ESP32_SAWIT_03', FALSE, NULL, '2.0.0');

-- Create views for easier data access (modified for multi-device)
CREATE VIEW latest_sensor_reading AS
SELECT 
    sd.device_id,
    d.device_name,
    d.location,
    sd.distance,
    sd.distance_status,
    sd.soil_moisture,
    sd.moisture_status,
    sd.temperature,
    sd.temperature_status,
    sd.rain_percentage,
    sd.rain_status,
    sd.timestamp,
    CASE 
        WHEN sd.timestamp > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'online'
        WHEN sd.timestamp > DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 'warning'
        ELSE 'offline'
    END as connection_status
FROM sensor_data sd
JOIN devices d ON sd.device_id = d.device_id
WHERE d.is_active = TRUE
AND sd.id IN (
    SELECT MAX(id) FROM sensor_data 
    GROUP BY device_id
);

CREATE VIEW daily_averages AS
SELECT 
    DATE(timestamp) as date,
    AVG(distance) as avg_distance,
    AVG(soil_moisture) as avg_soil_moisture,
    AVG(temperature) as avg_temperature,
    AVG(rain_percentage) as avg_rain_percentage,
    COUNT(*) as reading_count
FROM sensor_data 
WHERE timestamp >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
GROUP BY DATE(timestamp)
ORDER BY date DESC;

-- Show created tables
SHOW TABLES;

-- Display table structures for verification
DESCRIBE sensor_data;
DESCRIBE alerts;
DESCRIBE device_status;
DESCRIBE system_config;
DESCRIBE data_summary;
