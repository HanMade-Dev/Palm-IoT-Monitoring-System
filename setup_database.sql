-- IoT Kelapa Sawit Database Setup
-- Supports both PostgreSQL and MySQL

-- PostgreSQL Version (for Replit, cloud hosting)
-- Use this for PostgreSQL installations

-- Create devices table
CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(50) PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create device_status table
CREATE TABLE IF NOT EXISTS device_status (
    device_id VARCHAR(50) PRIMARY KEY,
    is_online BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP,
    wifi_signal INTEGER,
    free_heap BIGINT,
    firmware_version VARCHAR(20) DEFAULT '1.0.0',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- Create sensor_data table
CREATE TABLE IF NOT EXISTS sensor_data (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    distance FLOAT,
    distance_status VARCHAR(20),
    soil_moisture FLOAT,
    moisture_status VARCHAR(20),
    temperature FLOAT,
    temperature_status VARCHAR(20),
    rain_percentage FLOAT,
    rain_status VARCHAR(20),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sensor_data_device_timestamp ON sensor_data(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON sensor_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_device_status_last_seen ON device_status(last_seen DESC);

-- Insert sample devices
INSERT INTO devices (device_id, device_name, location, description) VALUES
('ESP32_SAWIT_01', 'Sensor Utama', 'Area Utama', 'Sensor monitoring kelapa sawit area utama'),
('ESP32_SAWIT_02', 'Sensor Timur', 'Area Timur', 'Sensor monitoring kelapa sawit area timur'),
('ESP32_SAWIT_03', 'Sensor Barat', 'Area Barat', 'Sensor monitoring kelapa sawit area barat')
ON CONFLICT (device_id) DO NOTHING;

-- Insert sample device status
INSERT INTO device_status (device_id, is_online, last_seen, firmware_version) VALUES
('ESP32_SAWIT_01', TRUE, CURRENT_TIMESTAMP, '2.0.0'),
('ESP32_SAWIT_02', FALSE, CURRENT_TIMESTAMP - INTERVAL '1 hour', '2.0.0'),
('ESP32_SAWIT_03', FALSE, CURRENT_TIMESTAMP - INTERVAL '2 hours', '2.0.0')
ON CONFLICT (device_id) DO UPDATE SET
    firmware_version = EXCLUDED.firmware_version;

-- ========================================
-- MySQL Version (for shared hosting)
-- Comment out PostgreSQL version above and use this for MySQL
-- ========================================

/*
-- Create devices table (MySQL)
CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(50) PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create device_status table (MySQL)
CREATE TABLE IF NOT EXISTS device_status (
    device_id VARCHAR(50) PRIMARY KEY,
    is_online BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP NULL,
    wifi_signal INT,
    free_heap BIGINT,
    firmware_version VARCHAR(20) DEFAULT '1.0.0',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- Create sensor_data table (MySQL)
CREATE TABLE IF NOT EXISTS sensor_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    distance FLOAT,
    distance_status VARCHAR(20),
    soil_moisture FLOAT,
    moisture_status VARCHAR(20),
    temperature FLOAT,
    temperature_status VARCHAR(20),
    rain_percentage FLOAT,
    rain_status VARCHAR(20),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- Create indexes for better performance (MySQL)
CREATE INDEX idx_sensor_data_device_timestamp ON sensor_data(device_id, timestamp DESC);
CREATE INDEX idx_sensor_data_timestamp ON sensor_data(timestamp DESC);
CREATE INDEX idx_device_status_last_seen ON device_status(last_seen DESC);

-- Insert sample devices (MySQL)
INSERT INTO devices (device_id, device_name, location, description) VALUES
('ESP32_SAWIT_01', 'Sensor Utama', 'Area Utama', 'Sensor monitoring kelapa sawit area utama'),
('ESP32_SAWIT_02', 'Sensor Timur', 'Area Timur', 'Sensor monitoring kelapa sawit area timur'),
('ESP32_SAWIT_03', 'Sensor Barat', 'Area Barat', 'Sensor monitoring kelapa sawit area barat')
ON DUPLICATE KEY UPDATE device_name = VALUES(device_name);

-- Insert sample device status (MySQL)
INSERT INTO device_status (device_id, is_online, last_seen, firmware_version) VALUES
('ESP32_SAWIT_01', TRUE, NOW(), '2.0.0'),
('ESP32_SAWIT_02', FALSE, NOW() - INTERVAL 1 HOUR, '2.0.0'),
('ESP32_SAWIT_03', FALSE, NOW() - INTERVAL 2 HOUR, '2.0.0')
ON DUPLICATE KEY UPDATE firmware_version = VALUES(firmware_version);
*/