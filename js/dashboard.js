// Dashboard JavaScript for IoT Monitoring System

class IoTDashboard {
    constructor() {
        this.apiBaseUrl = 'api/';
        this.updateInterval = 3000; // 3 seconds
        this.charts = {};
        this.alertThresholds = {
            distance: { min: 10, max: 100 },
            moisture: { min: 30, max: 80 },
            temperature: { min: 20, max: 35 },
            rain: { max: 50 }
        };
        
        // Serial communication
        this.serialPort = null;
        this.serialReader = null;
        this.serialConnected = false;
        this.usingSerial = false;
        
        // Multi-device support
        this.devices = [];
        this.selectedDevice = 'all';
        this.deviceData = {}; // Store data for each device
        
        this.init();
    }

    init() {
        this.setupCharts();
        this.loadDevices();
        this.startRealTimeUpdates();
        this.setupEventListeners();
        
        // Set initial date for filters
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        this.lastDataFetch = today;
    }

    setupCharts() {
        // Moisture & Temperature Chart
        const ctx1 = document.getElementById('moistureTempChart').getContext('2d');
        this.charts.moistureTemp = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Kelembaban Tanah (%)',
                    data: [],
                    borderColor: '#198754',
                    backgroundColor: 'rgba(25, 135, 84, 0.1)',
                    yAxisID: 'y'
                }, {
                    label: 'Suhu Udara (°C)',
                    data: [],
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Waktu'
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Kelembaban (%)'
                        },
                        min: 0,
                        max: 100
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Suhu (°C)'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                }
            }
        });

        // Distance & Rain Chart
        const ctx2 = document.getElementById('distanceRainChart').getContext('2d');
        this.charts.distanceRain = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Jarak Air (cm)',
                    data: [],
                    borderColor: '#0dcaf0',
                    backgroundColor: 'rgba(13, 202, 240, 0.1)',
                    yAxisID: 'y'
                }, {
                    label: 'Hujan (%)',
                    data: [],
                    borderColor: '#6f42c1',
                    backgroundColor: 'rgba(111, 66, 193, 0.1)',
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Waktu'
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Jarak (cm)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Hujan (%)'
                        },
                        min: 0,
                        max: 100,
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                }
            }
        });
    }

    async loadDevices() {
        try {
            const response = await fetch(`${this.apiBaseUrl}get_devices.php`);
            const data = await response.json();
            
            if (data.success) {
                this.devices = data.data;
                this.updateDeviceSelector();
            }
        } catch (error) {
            console.error('Error loading devices:', error);
        }
    }
    
    updateDeviceSelector() {
        const deviceSelect = document.getElementById('device-select');
        deviceSelect.innerHTML = '<option value="all">Semua Device</option>';
        
        this.devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.device_id;
            option.textContent = `${device.device_name} (${device.location})`;
            deviceSelect.appendChild(option);
        });
    }
    
    async fetchLatestData() {
        try {
            const deviceParam = this.selectedDevice !== 'all' ? `?device_id=${this.selectedDevice}` : '';
            const response = await fetch(`${this.apiBaseUrl}get_latest.php${deviceParam}`);
            const data = await response.json();
            
            if (data.success) {
                if (this.selectedDevice === 'all') {
                    // Handle multiple devices
                    this.updateMultiDeviceDisplay(data.data);
                } else {
                    // Handle single device
                    this.updateSensorCards(data.data);
                    this.updateCharts(data.data);
                    this.checkAlerts(data.data);
                }
                this.updateConnectionStatus(true);
                this.updateLastUpdateTime();
                this.hideNoDataMessage();
            } else {
                // Handle "no data available" gracefully
                if (data.message && data.message.toLowerCase().includes('no data available')) {
                    this.showNoDataMessage();
                    this.updateConnectionStatus(true); // Server is working, just no data
                } else {
                    throw new Error(data.message || 'Failed to fetch data');
                }
            }
        } catch (error) {
            // Only log actual network/server errors, not "no data" situations
            if (!error.message.toLowerCase().includes('no data')) {
                console.warn('Network error fetching latest data:', error.message);
            }
            this.updateConnectionStatus(false);
            this.showNetworkError();
        }
    }

    updateSensorCards(data) {
        // Update device info if single device is selected
        if (this.selectedDevice !== 'all' && data.device_id) {
            this.updateDeviceInfo(data);
        } else {
            this.hideDeviceInfo();
        }
        
        // Update Distance
        const distanceElement = document.getElementById('distance-value');
        const distanceStatusElement = document.getElementById('distance-status');
        if (data.distance !== null && data.distance >= 0) {
            distanceElement.textContent = `${data.distance} cm`;
            distanceStatusElement.textContent = data.distance_status || this.getDistanceStatus(data.distance);
            distanceStatusElement.className = `sensor-status ${this.getDistanceStatusClass(data.distance)}`;
        } else {
            distanceElement.textContent = 'Error';
            distanceStatusElement.textContent = 'Sensor tidak terbaca';
            distanceStatusElement.className = 'sensor-status text-danger';
        }

        // Update Moisture
        document.getElementById('moisture-value').textContent = `${data.soil_moisture}%`;
        const moistureStatus = document.getElementById('moisture-status');
        moistureStatus.textContent = data.moisture_status;
        moistureStatus.className = `sensor-status status-${data.moisture_status.toLowerCase()}`;

        // Update Temperature
        const tempElement = document.getElementById('temperature-value');
        const tempStatusElement = document.getElementById('temperature-status');
        if (data.temperature !== null) {
            tempElement.textContent = `${parseFloat(data.temperature).toFixed(1)}°C`;
            tempStatusElement.textContent = data.temperature_status || this.getTemperatureStatus(data.temperature);
            tempStatusElement.className = `sensor-status ${this.getTemperatureStatusClass(data.temperature)}`;
        } else {
            tempElement.textContent = 'Error';
            tempStatusElement.textContent = 'Sensor tidak terbaca';
            tempStatusElement.className = 'sensor-status text-danger';
        }

        // Update Rain
        document.getElementById('rain-value').textContent = `${data.rain_percentage}%`;
        const rainStatus = document.getElementById('rain-status');
        rainStatus.textContent = data.rain_status;
        rainStatus.className = `sensor-status status-${data.rain_status.toLowerCase()}`;
    }
    
    updateDeviceInfo(data) {
        const deviceInfoSection = document.getElementById('device-info-section');
        const deviceInfo = this.devices.find(d => d.device_id === data.device_id);
        
        if (deviceInfo) {
            document.getElementById('device-info-id').textContent = deviceInfo.device_id;
            document.getElementById('device-info-name').textContent = deviceInfo.device_name;
            document.getElementById('device-info-location').textContent = deviceInfo.location || 'Unknown';
            
            const connectionBadge = document.getElementById('device-connection-badge');
            const lastSeenElement = document.getElementById('device-last-seen');
            
            // Update connection status
            if (deviceInfo.connection_status === 'online') {
                connectionBadge.className = 'badge bg-success';
                connectionBadge.textContent = 'Online';
            } else if (deviceInfo.connection_status === 'warning') {
                connectionBadge.className = 'badge bg-warning';
                connectionBadge.textContent = 'Warning';
            } else {
                connectionBadge.className = 'badge bg-danger';
                connectionBadge.textContent = 'Offline';
            }
            
            // Update last seen
            if (deviceInfo.last_reading) {
                const lastSeenDate = new Date(deviceInfo.last_reading);
                lastSeenElement.textContent = `Last seen: ${lastSeenDate.toLocaleString('id-ID')}`;
            } else {
                lastSeenElement.textContent = 'Last seen: Never';
            }
            
            deviceInfoSection.style.display = 'block';
        }
    }
    
    hideDeviceInfo() {
        const deviceInfoSection = document.getElementById('device-info-section');
        deviceInfoSection.style.display = 'none';
    }
    
    updateMultiDeviceDisplay(devices) {
        if (!Array.isArray(devices) || devices.length === 0) {
            this.showNoDataMessage();
            return;
        }
        
        // Hide device info section for multi-device view
        this.hideDeviceInfo();
        
        // For multi-device, show aggregated or latest data
        const latestDevice = devices[0]; // Show data from most recent device
        this.updateSensorCards(latestDevice);
        this.updateCharts(latestDevice);
        
        // Check alerts for all devices
        devices.forEach(deviceData => {
            this.checkAlerts(deviceData, deviceData.device_name);
        });
    }

    updateCharts(data) {
        const currentTime = new Date().toLocaleTimeString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });

        // Update Moisture & Temperature Chart
        const moistureTempChart = this.charts.moistureTemp;
        moistureTempChart.data.labels.push(currentTime);
        moistureTempChart.data.datasets[0].data.push(data.soil_moisture);
        moistureTempChart.data.datasets[1].data.push(data.temperature);

        // Keep only last 20 data points
        if (moistureTempChart.data.labels.length > 20) {
            moistureTempChart.data.labels.shift();
            moistureTempChart.data.datasets[0].data.shift();
            moistureTempChart.data.datasets[1].data.shift();
        }
        moistureTempChart.update('none');

        // Update Distance & Rain Chart
        const distanceRainChart = this.charts.distanceRain;
        distanceRainChart.data.labels.push(currentTime);
        distanceRainChart.data.datasets[0].data.push(data.distance || 0);
        distanceRainChart.data.datasets[1].data.push(data.rain_percentage);

        // Keep only last 20 data points
        if (distanceRainChart.data.labels.length > 20) {
            distanceRainChart.data.labels.shift();
            distanceRainChart.data.datasets[0].data.shift();
            distanceRainChart.data.datasets[1].data.shift();
        }
        distanceRainChart.update('none');
    }

    checkAlerts(data, deviceName = '') {
        const alerts = [];
        const devicePrefix = deviceName ? `[${deviceName}] ` : '';

        // Check distance alert
        if (data.distance !== null) {
            if (data.distance < this.alertThresholds.distance.min) {
                alerts.push({
                    type: 'danger',
                    icon: 'fas fa-exclamation-triangle',
                    title: `${devicePrefix}Peringatan: Level Air Tinggi`,
                    message: `Jarak air hanya ${data.distance} cm. Segera periksa sistem drainase.`
                });
            } else if (data.distance > this.alertThresholds.distance.max) {
                alerts.push({
                    type: 'warning',
                    icon: 'fas fa-exclamation-circle',
                    title: `${devicePrefix}Peringatan: Level Air Rendah`,
                    message: `Jarak air ${data.distance} cm. Pertimbangkan untuk menambah irigasi.`
                });
            }
        }

        // Check moisture alert
        if (data.soil_moisture < this.alertThresholds.moisture.min) {
            alerts.push({
                type: 'warning',
                icon: 'fas fa-tint',
                title: `${devicePrefix}Peringatan: Tanah Kering`,
                message: `Kelembaban tanah hanya ${data.soil_moisture}%. Perlu irigasi segera.`
            });
        }

        // Check temperature alert
        if (data.temperature !== null) {
            if (data.temperature > this.alertThresholds.temperature.max) {
                alerts.push({
                    type: 'danger',
                    icon: 'fas fa-thermometer-full',
                    title: `${devicePrefix}Peringatan: Suhu Tinggi`,
                    message: `Suhu udara ${data.temperature}°C. Pastikan tanaman mendapat perlindungan.`
                });
            } else if (data.temperature < this.alertThresholds.temperature.min) {
                alerts.push({
                    type: 'info',
                    icon: 'fas fa-thermometer-empty',
                    title: `${devicePrefix}Info: Suhu Rendah`,
                    message: `Suhu udara ${data.temperature}°C. Monitor pertumbuhan tanaman.`
                });
            }
        }

        // Check rain alert
        if (data.rain_percentage > this.alertThresholds.rain.max) {
            alerts.push({
                type: 'info',
                icon: 'fas fa-cloud-rain',
                title: `${devicePrefix}Info: Hujan Terdeteksi`,
                message: `Intensitas hujan ${data.rain_percentage}%. Sistem irigasi dapat dikurangi.`
            });
        }

        this.displayAlerts(alerts);
    }

    displayAlerts(alerts) {
        const container = document.getElementById('alerts-container');
        
        if (alerts.length === 0) {
            container.innerHTML = '<div class="text-muted text-center">Tidak ada alert saat ini</div>';
            return;
        }

        const alertsHtml = alerts.map(alert => `
            <div class="alert alert-${alert.type} alert-dismissible fade show" role="alert">
                <i class="${alert.icon} me-2"></i>
                <strong>${alert.title}</strong><br>
                ${alert.message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `).join('');

        container.innerHTML = alertsHtml;
    }

    getDistanceStatus(distance) {
        if (distance < 20) return 'Level Tinggi';
        if (distance < 50) return 'Level Sedang';
        return 'Level Rendah';
    }

    getDistanceStatusClass(distance) {
        if (distance < 20) return 'text-danger';
        if (distance < 50) return 'text-warning';
        return 'text-success';
    }

    getTemperatureStatus(temp) {
        if (temp < 20) return 'Dingin';
        if (temp < 30) return 'Normal';
        return 'Panas';
    }

    getTemperatureStatusClass(temp) {
        if (temp < 20) return 'text-info';
        if (temp < 30) return 'text-success';
        return 'text-danger';
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        if (connected) {
            statusElement.innerHTML = '<i class="fas fa-circle"></i> Connected';
            statusElement.className = 'badge bg-success';
        } else {
            statusElement.innerHTML = '<i class="fas fa-circle"></i> Disconnected';
            statusElement.className = 'badge bg-danger';
        }
    }

    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleString('id-ID');
        document.getElementById('last-update').textContent = timeString;
    }

    startRealTimeUpdates() {
        // Show initial loading state
        this.showNoDataMessage();
        
        // Initial fetch
        this.fetchLatestData();
        
        // Set interval for updates
        this.updateTimer = setInterval(() => {
            this.fetchLatestData();
        }, this.updateInterval);
    }

    setupEventListeners() {
        // Device selector change
        document.getElementById('device-select').addEventListener('change', (e) => {
            this.selectedDevice = e.target.value;
            this.fetchLatestData(); // Immediate fetch when device changes
        });
        
        // Serial port button
        document.getElementById('serial-connect-btn').addEventListener('click', () => {
            if (this.serialConnected) {
                this.disconnectSerial();
            } else {
                this.connectSerial();
            }
        });

        // Handle page visibility change to pause/resume updates
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                clearInterval(this.updateTimer);
            } else {
                this.startRealTimeUpdates();
            }
        });

        // Handle window beforeunload
        window.addEventListener('beforeunload', () => {
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
            }
        });
    }

    showNoDataMessage() {
        // Show friendly message when no data is available
        const container = document.getElementById('alerts-container');
        const noDataAlert = `
            <div class="alert alert-info border-0 shadow-sm" role="alert">
                <div class="d-flex align-items-center">
                    <div class="text-center w-100">
                        <i class="fas fa-info-circle fs-2 mb-3 text-primary"></i>
                        <h5 class="mb-2">Menunggu Data Sensor</h5>
                        <p class="mb-0">Belum ada ESP32 yang terhubung atau mengirim data. Pastikan:</p>
                        <small class="text-muted">
                            • ESP32 terhubung ke WiFi<br>
                            • Konfigurasi server URL sudah benar<br>
                            • Sensor berfungsi dengan normal
                        </small>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML = noDataAlert;
        
        // Clear sensor cards with placeholder data
        this.showPlaceholderData();
    }
    
    showPlaceholderData() {
        // Show placeholder values in sensor cards
        document.getElementById('distance-value').textContent = '--';
        document.getElementById('distance-status').textContent = 'Menunggu data...';
        document.getElementById('distance-status').className = 'sensor-status text-muted';
        
        document.getElementById('moisture-value').textContent = '--';
        document.getElementById('moisture-status').textContent = 'Menunggu data...';
        document.getElementById('moisture-status').className = 'sensor-status text-muted';
        
        document.getElementById('temperature-value').textContent = '--';
        document.getElementById('temperature-status').textContent = 'Menunggu data...';
        document.getElementById('temperature-status').className = 'sensor-status text-muted';
        
        document.getElementById('rain-value').textContent = '--';
        document.getElementById('rain-status').textContent = 'Menunggu data...';
        document.getElementById('rain-status').className = 'sensor-status text-muted';
    }
    
    hideNoDataMessage() {
        // Clear the no-data message when real data is available
        const container = document.getElementById('alerts-container');
        container.innerHTML = '<div class="text-muted text-center">Tidak ada alert saat ini</div>';
    }
    
    showNetworkError() {
        // Show network/server error
        const alertsContainer = document.getElementById('alerts-container');
        const errorAlert = `
            <div class="alert alert-warning alert-dismissible fade show" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Koneksi Bermasalah:</strong> Tidak dapat mengambil data sensor. Periksa koneksi internet atau server.
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        alertsContainer.innerHTML = errorAlert;
    }

    // Serial Communication Methods
    async connectSerial() {
        // Check if Web Serial API is supported
        if (!('serial' in navigator)) {
            this.showSerialNotSupported();
            return;
        }

        try {
            // Request port access
            this.serialPort = await navigator.serial.requestPort();
            
            // Open port with appropriate settings for ESP32
            await this.serialPort.open({ 
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 'none'
            });

            this.serialConnected = true;
            this.usingSerial = true;
            
            // Update UI
            document.getElementById('serial-status').classList.remove('d-none');
            document.getElementById('serial-status').innerHTML = '<i class="fas fa-usb"></i> Serial: Connected';
            document.getElementById('serial-status').className = 'badge bg-success';
            document.getElementById('serial-connect-btn').innerHTML = '<i class="fas fa-plug"></i> <span class="btn-label">Disconnect</span>';
            
            // Stop web updates and start reading serial
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
            }
            
            this.startSerialReading();
            
        } catch (error) {
            // Handle user cancellation gracefully
            if (error.name === 'NotFoundError') {
                console.log('User cancelled serial port selection');
            } else {
                console.warn('Serial connection failed:', error.message);
                this.showSerialError(error.message);
            }
        }
    }
    
    showSerialNotSupported() {
        const alertsContainer = document.getElementById('alerts-container');
        const alert = `
            <div class="alert alert-warning alert-dismissible fade show" role="alert">
                <i class="fas fa-info-circle me-2"></i>
                <strong>Serial Port tidak didukung:</strong> Gunakan browser Chrome atau Edge versi terbaru untuk fitur Serial Port.
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        alertsContainer.innerHTML = alert;
    }
    
    showSerialError(message) {
        const alertsContainer = document.getElementById('alerts-container');
        const alert = `
            <div class="alert alert-danger alert-dismissible fade show" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Serial Connection Error:</strong> ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        alertsContainer.innerHTML = alert;
    }

    async disconnectSerial() {
        try {
            if (this.serialReader) {
                await this.serialReader.cancel();
                this.serialReader.releaseLock();
            }
            
            if (this.serialPort) {
                await this.serialPort.close();
            }
            
            this.serialConnected = false;
            this.usingSerial = false;
            this.serialPort = null;
            this.serialReader = null;
            
            // Update UI
            document.getElementById('serial-status').classList.add('d-none');
            document.getElementById('serial-connect-btn').innerHTML = '<i class="fas fa-plug"></i> <span class="btn-label">Serial Port</span>';
            
            // Resume IoT updates
            this.startRealTimeUpdates();
            
        } catch (error) {
            console.error('Serial disconnection error:', error);
        }
    }

    async startSerialReading() {
        if (!this.serialPort) return;
        
        try {
            const textDecoder = new TextDecoderStream();
            const readableStreamClosed = this.serialPort.readable.pipeTo(textDecoder.writable);
            this.serialReader = textDecoder.readable.getReader();
            
            let buffer = '';
            
            while (this.serialConnected) {
                const { value, done } = await this.serialReader.read();
                if (done) break;
                
                buffer += value;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    this.parseSerialData(line.trim());
                }
            }
        } catch (error) {
            console.error('Serial reading error:', error);
            if (this.serialConnected) {
                this.disconnectSerial();
            }
        }
    }

    parseSerialData(line) {
        try {
            // Look for JSON data in the serial output
            if (line.includes('{') && line.includes('}')) {
                const jsonStart = line.indexOf('{');
                const jsonEnd = line.lastIndexOf('}') + 1;
                const jsonStr = line.substring(jsonStart, jsonEnd);
                
                const data = JSON.parse(jsonStr);
                
                // Convert to expected format
                const sensorData = {
                    distance: data.distance || null,
                    soil_moisture: data.soil_moisture || 0,
                    moisture_status: data.moisture_status || 'Unknown',
                    temperature: data.temperature || null,
                    rain_percentage: data.rain_percentage || 0,
                    rain_status: data.rain_status || 'Unknown'
                };
                
                this.updateSensorCards(sensorData);
                this.updateCharts(sensorData);
                this.checkAlerts(sensorData);
                this.updateLastUpdateTime();
                
                // Update connection status
                this.updateConnectionStatus(true);
                
            } else if (line.includes('Distance:') || line.includes('Soil Moisture:')) {
                // Parse text format data
                this.parseTextSerialData(line);
            }
        } catch (error) {
            console.error('Error parsing serial data:', error);
        }
    }

    parseTextSerialData(line) {
        // Parse the text format from ESP32 serial output
        // Example: "Distance: 25 cm, Soil Moisture: 45% (Cukup), Temperature: 28.5°C, Rain: 10% (Kering)"
        
        const sensorData = {
            distance: null,
            soil_moisture: 0,
            moisture_status: 'Unknown',
            temperature: null,
            rain_percentage: 0,
            rain_status: 'Unknown'
        };
        
        // Extract distance
        const distanceMatch = line.match(/Distance:\s*(\d+)\s*cm/);
        if (distanceMatch) {
            sensorData.distance = parseInt(distanceMatch[1]);
        }
        
        // Extract soil moisture
        const moistureMatch = line.match(/Soil Moisture:\s*(\d+)%\s*\(([^)]+)\)/);
        if (moistureMatch) {
            sensorData.soil_moisture = parseInt(moistureMatch[1]);
            sensorData.moisture_status = moistureMatch[2];
        }
        
        // Extract temperature
        const tempMatch = line.match(/Temperature:\s*([0-9.]+)°C/);
        if (tempMatch) {
            sensorData.temperature = parseFloat(tempMatch[1]);
        }
        
        // Extract rain
        const rainMatch = line.match(/Rain:\s*(\d+)%\s*\(([^)]+)\)/);
        if (rainMatch) {
            sensorData.rain_percentage = parseInt(rainMatch[1]);
            sensorData.rain_status = rainMatch[2];
        }
        
        this.updateSensorCards(sensorData);
        this.updateCharts(sensorData);
        this.checkAlerts(sensorData);
        this.updateLastUpdateTime();
        this.updateConnectionStatus(true);
    }
}

// Global functions
function toggleSerialConnection() {
    const dashboard = window.iotDashboard;
    if (dashboard.serialConnected) {
        dashboard.disconnectSerial();
    } else {
        dashboard.connectSerial();
    }
}

function changeDevice() {
    const dashboard = window.iotDashboard;
    const deviceSelect = document.getElementById('device-select');
    dashboard.selectedDevice = deviceSelect.value;
    
    // Immediately fetch data for the new device selection
    dashboard.fetchLatestData();
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.iotDashboard = new IoTDashboard();
});
