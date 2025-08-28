
-- IoT Kelapa Sawit Database Setup for MySQL/phpMyAdmin
-- Copy and paste this script in phpMyAdmin SQL tab

-- Create database (if not exists)
CREATE DATABASE IF NOT EXISTS fare1399_sawit_iot_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fare1399_sawit_iot_db;

-- Create devices table
CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(50) PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_device_id (device_id),
    INDEX idx_is_active (is_active),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB COMMENT='Registered IoT devices';

-- Create device_status table
CREATE TABLE IF NOT EXISTS device_status (
    device_id VARCHAR(50) PRIMARY KEY,
    is_online BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP NULL DEFAULT NULL,
    wifi_signal INT,
    free_heap BIGINT,
    firmware_version VARCHAR(20) DEFAULT '1.0.0',
    ip_address VARCHAR(45) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_last_seen (last_seen),
    INDEX idx_is_online (is_online)
) ENGINE=InnoDB COMMENT='Device connection status tracking';

-- Create sensor_data table
CREATE TABLE IF NOT EXISTS sensor_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    distance FLOAT NULL COMMENT 'Water distance in cm (NULL if sensor error)',
    distance_status VARCHAR(20) DEFAULT 'Unknown',
    soil_moisture FLOAT NOT NULL COMMENT 'Soil moisture percentage (0-100)',
    moisture_status VARCHAR(20) DEFAULT 'Unknown',
    temperature FLOAT NULL COMMENT 'Temperature in Celsius (NULL if sensor error)',
    temperature_status VARCHAR(20) DEFAULT 'Unknown',
    rain_percentage FLOAT NOT NULL COMMENT 'Rain percentage (0-100)',
    rain_status VARCHAR(20) DEFAULT 'Unknown',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_device_id (device_id),
    INDEX idx_timestamp (timestamp DESC),
    INDEX idx_device_timestamp (device_id, timestamp DESC),
    INDEX idx_moisture (soil_moisture),
    INDEX idx_temperature (temperature),
    INDEX idx_rain (rain_percentage)
) ENGINE=InnoDB COMMENT='Main sensor data table for multiple devices';

-- Create alerts table for storing alert history
CREATE TABLE IF NOT EXISTS alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50) NULL,
    sensor_type ENUM('distance', 'moisture', 'temperature', 'rain', 'system') NOT NULL,
    alert_level ENUM('info', 'warning', 'danger') NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    sensor_value FLOAT NULL COMMENT 'The sensor value that triggered the alert',
    threshold_value FLOAT NULL COMMENT 'The threshold that was exceeded',
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_created_at (created_at),
    INDEX idx_sensor_type (sensor_type),
    INDEX idx_alert_level (alert_level),
    INDEX idx_is_resolved (is_resolved),
    INDEX idx_device_id (device_id)
) ENGINE=InnoDB COMMENT='Alert history and management';

-- Create system_config table for storing system settings
CREATE TABLE IF NOT EXISTS system_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT NOT NULL,
    description TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_config_key (config_key)
) ENGINE=InnoDB COMMENT='System configuration settings';

-- Create data_summary table for daily/hourly aggregations
CREATE TABLE IF NOT EXISTS data_summary (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    summary_date DATE NOT NULL,
    summary_hour TINYINT NULL COMMENT 'Hour (0-23) for hourly summary, NULL for daily',
    avg_distance FLOAT NULL,
    min_distance FLOAT NULL,
    max_distance FLOAT NULL,
    avg_soil_moisture FLOAT NOT NULL,
    min_soil_moisture FLOAT NOT NULL,
    max_soil_moisture FLOAT NOT NULL,
    avg_temperature FLOAT NULL,
    min_temperature FLOAT NULL,
    max_temperature FLOAT NULL,
    avg_rain_percentage FLOAT NOT NULL,
    min_rain_percentage FLOAT NOT NULL,
    max_rain_percentage FLOAT NOT NULL,
    total_readings INT NOT NULL DEFAULT 0,
    rain_detected_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY unique_summary (device_id, summary_date, summary_hour),
    INDEX idx_summary_date (summary_date),
    INDEX idx_summary_hour (summary_hour),
    INDEX idx_device_id (device_id)
) ENGINE=InnoDB COMMENT='Daily and hourly data summaries per device';

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
('sms_notifications', 'false', 'Enable SMS notifications for alerts')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);

-- Insert sample devices
INSERT INTO devices (device_id, device_name, location, description) VALUES
('ESP32_SAWIT_01', 'Sensor Utama', 'Area Utama', 'Sensor monitoring kelapa sawit area utama'),
('ESP32_SAWIT_02', 'Sensor Timur', 'Area Timur', 'Sensor monitoring kelapa sawit area timur'),
('ESP32_SAWIT_03', 'Sensor Barat', 'Area Barat', 'Sensor monitoring kelapa sawit area barat')
ON DUPLICATE KEY UPDATE device_name = VALUES(device_name);

-- Insert sample device status
INSERT INTO device_status (device_id, is_online, last_seen, firmware_version) VALUES
('ESP32_SAWIT_01', TRUE, NOW(), '2.0.0'),
('ESP32_SAWIT_02', FALSE, NOW() - INTERVAL 1 HOUR, '2.0.0'),
('ESP32_SAWIT_03', FALSE, NOW() - INTERVAL 2 HOUR, '2.0.0')
ON DUPLICATE KEY UPDATE firmware_version = VALUES(firmware_version);

-- Create views for easier data access
CREATE OR REPLACE VIEW latest_sensor_reading AS
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
    ds.is_online,
    CASE 
        WHEN sd.timestamp > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'online'
        WHEN sd.timestamp > DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 'warning'
        ELSE 'offline'
    END as connection_status
FROM sensor_data sd
JOIN devices d ON sd.device_id = d.device_id
LEFT JOIN device_status ds ON sd.device_id = ds.device_id
WHERE d.is_active = TRUE
AND sd.id IN (
    SELECT MAX(id) FROM sensor_data 
    WHERE device_id = sd.device_id
    GROUP BY device_id
);

CREATE OR REPLACE VIEW daily_averages AS
SELECT 
    device_id,
    DATE(timestamp) as date,
    AVG(distance) as avg_distance,
    AVG(soil_moisture) as avg_soil_moisture,
    AVG(temperature) as avg_temperature,
    AVG(rain_percentage) as avg_rain_percentage,
    COUNT(*) as reading_count
FROM sensor_data 
WHERE timestamp >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
GROUP BY device_id, DATE(timestamp)
ORDER BY date DESC;

-- Stored procedures for maintenance
DELIMITER //

CREATE PROCEDURE IF NOT EXISTS CleanupOldData()
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
    
END//

CREATE PROCEDURE IF NOT EXISTS GenerateDailySummary(IN target_date DATE)
BEGIN
    INSERT INTO data_summary (
        device_id,
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
        device_id,
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
    GROUP BY device_id
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

-- Insert sample data for testing (after tables are created)
INSERT INTO sensor_data (device_id, distance, distance_status, soil_moisture, moisture_status, temperature, temperature_status, rain_percentage, rain_status) VALUES
('ESP32_SAWIT_01', 50.5, 'Normal', 65, 'Cukup', 28.5, 'Normal', 15, 'Kering'),
('ESP32_SAWIT_02', 45.2, 'Normal', 70, 'Basah', 29.1, 'Normal', 20, 'Cukup'),
('ESP32_SAWIT_03', 55.8, 'Normal', 58, 'Cukup', 27.8, 'Normal', 10, 'Kering');

-- Show tables that were created successfully
SHOW TABLES;
