-- Database Schema for IoT Kelapa Sawit (Buffer-based Architecture)
-- Supports both PostgreSQL (Replit) and MySQL

-- For PostgreSQL (Replit)
-- CREATE DATABASE fare1399iot_monitoring;

-- For MySQL (hosting)
-- CREATE DATABASE IF NOT EXISTS fare1399_sawit_iot_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE fare1399_sawit_iot_db;

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(50) PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,
    location VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for devices
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_is_active ON devices(is_active);

-- Raw sensor data
CREATE TABLE IF NOT EXISTS sensor_data (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    distance INTEGER,
    distance_status VARCHAR(20) DEFAULT 'Unknown',
    soil_moisture INTEGER NOT NULL,
    moisture_status VARCHAR(20) DEFAULT 'Unknown',
    temperature REAL,
    temperature_status VARCHAR(20) DEFAULT 'Unknown',
    rain_percentage INTEGER NOT NULL,
    rain_status VARCHAR(20) DEFAULT 'Unknown',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

-- Create indexes for sensor_data
CREATE INDEX IF NOT EXISTS idx_sensor_data_device_timestamp ON sensor_data(device_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON sensor_data(timestamp);

-- Device status
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

-- Create index for device_status
CREATE INDEX IF NOT EXISTS idx_device_status_last_seen ON device_status(last_seen);

-- Insert sample devices
INSERT INTO devices (device_id, device_name, location, description) VALUES
('ESP32_SAWIT_01', 'Sensor Area Utama', 'Blok A - Area Utama', 'Sensor monitoring kelapa sawit area utama'),
('ESP32_SAWIT_02', 'Sensor Area Timur', 'Blok B - Area Timur', 'Sensor monitoring kelapa sawit area timur'),
('ESP32_SAWIT_03', 'Sensor Area Barat', 'Blok C - Area Barat', 'Sensor monitoring kelapa sawit area barat')
ON CONFLICT (device_id) DO NOTHING;

-- Initialize device status
INSERT INTO device_status (device_id, is_online, firmware_version) VALUES
('ESP32_SAWIT_01', FALSE, '2.0.0'),
('ESP32_SAWIT_02', FALSE, '2.0.0'),
('ESP32_SAWIT_03', FALSE, '2.0.0')
ON CONFLICT (device_id) DO NOTHING;