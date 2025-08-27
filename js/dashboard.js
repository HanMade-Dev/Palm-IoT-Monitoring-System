
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
        this.currentSerialDevice = null;
        this.connectedSerialPorts = [];

        // Multi-device support
        this.devices = [];
        this.deviceData = {}; // Store data for each device
        this.deviceCharts = {}; // Store chart data for each device
        this.currentModalDeviceId = null; // Track which device modal is showing

        this.init();
    }

    init() {
        this.loadDevices();
        this.startRealTimeUpdates();
        this.setupEventListeners();
        this.setupModalChart();

        // Set initial date for filters
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        this.lastDataFetch = today;
    }

    setupModalChart() {
        const ctx = document.getElementById('modalChart').getContext('2d');
        this.charts.modal = new Chart(ctx, {
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
                }, {
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
                            text: 'Kelembaban (%)'
                        }
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
    }

    async loadDevices() {
        try {
            const response = await fetch(`${this.apiBaseUrl}get_devices.php`);
            const data = await response.json();

            if (data.success) {
                this.devices = data.data;
                this.createDeviceCards();
            }
        } catch (error) {
            console.error('Error loading devices:', error);
        }
    }

    createDeviceCards() {
        const container = document.getElementById('devices-container');
        
        // Get all devices from API and serial connections
        let allDevices = [...this.devices];
        
        // Add serial devices that have device info
        this.connectedSerialPorts.forEach(portInfo => {
            if (portInfo.deviceInfo) {
                allDevices.push({
                    ...portInfo.deviceInfo,
                    connectionType: 'serial'
                });
            }
        });

        // If no devices at all, show message
        if (allDevices.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info text-center">
                        <i class="fas fa-info-circle fs-2 mb-3"></i>
                        <h5>Belum Ada Device Terhubung</h5>
                        <p>Pastikan ESP32 terhubung ke WiFi atau gunakan koneksi Serial Port</p>
                    </div>
                </div>
            `;
            return;
        }

        let cardsHtml = '';

        // Add API devices
        this.devices.forEach(device => {
            cardsHtml += this.createDeviceCardHtml(device, 'api');
        });

        // Add serial devices
        this.connectedSerialPorts.forEach(portInfo => {
            if (portInfo.deviceInfo) {
                cardsHtml += this.createDeviceCardHtml(portInfo.deviceInfo, 'serial');
            }
        });

        container.innerHTML = cardsHtml;
        
        // Initialize mini charts for all devices with longer delay to ensure DOM is ready
        setTimeout(() => {
            allDevices.forEach(device => {
                const deviceId = device.device_id;
                const canvasElement = document.getElementById(`mini-chart-${deviceId}`);
                console.log(`Looking for canvas mini-chart-${deviceId}:`, canvasElement);
                
                if (canvasElement) {
                    this.createMiniChart(deviceId);
                }
            });
        }, 300);
    }

    createDeviceCardHtml(device, connectionType) {
        const deviceId = device.device_id;
        const data = this.deviceData[deviceId] || {};
        
        return `
            <div class="col-lg-4 col-md-6">
                <div class="device-card" onclick="window.iotDashboard.showDeviceDetail('${deviceId}')">
                    <div class="device-card-header">
                        <div class="device-card-title">
                            <i class="fas fa-microchip me-2"></i>${device.device_name || 'Unknown Device'}
                        </div>
                        <div class="device-card-subtitle">
                            <i class="fas fa-map-marker-alt me-1"></i>${device.location || 'Unknown Location'}
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">ID: ${deviceId}</small>
                            <span class="badge ${connectionType === 'serial' ? 'bg-info' : 'bg-success'}" id="status-${deviceId}">
                                ${connectionType === 'serial' ? 'Serial' : 'Online'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="device-card-sensors">
                        <div class="mini-sensor">
                            <div class="mini-sensor-icon bg-primary">
                                <i class="fas fa-water"></i>
                            </div>
                            <div class="mini-sensor-value" id="card-distance-${deviceId}">${data.distance || '--'} cm</div>
                            <div class="mini-sensor-label">Jarak Air</div>
                        </div>
                        <div class="mini-sensor">
                            <div class="mini-sensor-icon bg-success">
                                <i class="fas fa-tint"></i>
                            </div>
                            <div class="mini-sensor-value" id="card-moisture-${deviceId}">${data.soil_moisture || '--'}%</div>
                            <div class="mini-sensor-label">Kelembaban</div>
                        </div>
                        <div class="mini-sensor">
                            <div class="mini-sensor-icon bg-warning">
                                <i class="fas fa-thermometer-half"></i>
                            </div>
                            <div class="mini-sensor-value" id="card-temperature-${deviceId}">${data.temperature || '--'}°C</div>
                            <div class="mini-sensor-label">Suhu</div>
                        </div>
                        <div class="mini-sensor">
                            <div class="mini-sensor-icon bg-info">
                                <i class="fas fa-cloud-rain"></i>
                            </div>
                            <div class="mini-sensor-value" id="card-rain-${deviceId}">${data.rain_percentage || '--'}%</div>
                            <div class="mini-sensor-label">Hujan</div>
                        </div>
                    </div>
                    
                    <div class="mini-chart-container">
                        <canvas id="mini-chart-${deviceId}" width="400" height="120"></canvas>
                    </div>
                    
                    <div class="device-card-footer">
                        <small class="text-muted">
                            Last update: <span id="last-update-${deviceId}">-</span>
                        </small>
                        <i class="fas fa-external-link-alt text-primary"></i>
                    </div>
                </div>
            </div>
        `;
    }

    async fetchLatestData() {
        // Skip API fetch if using serial only
        if (this.usingSerial && this.connectedSerialPorts.length > 0 && this.devices.length === 0) {
            this.updateConnectionStatus(true);
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}get_latest.php`);
            const data = await response.json();

            if (data.success) {
                if (Array.isArray(data.data)) {
                    // Handle multiple devices
                    data.data.forEach(deviceData => {
                        this.updateDeviceData(deviceData);
                    });
                } else if (data.data) {
                    // Handle single device
                    this.updateDeviceData(data.data);
                }
                this.updateConnectionStatus(true);
                this.checkAllDeviceAlerts();
            } else {

                if (this.connectedSerialPorts.length === 0) {
                    this.showNoDataMessage();
                }
                this.updateConnectionStatus(true);
            }
        } catch (error) {
            console.warn('Network error fetching latest data:', error.message);
            if (this.connectedSerialPorts.length === 0) {
                this.updateConnectionStatus(false);
            }
        }
    }

    updateDeviceData(data) {
        const deviceId = data.device_id;
        this.deviceData[deviceId] = data;

        // Check if card exists, if not recreate cards
        if (!document.getElementById(`card-distance-${deviceId}`)) {
            this.createDeviceCards();
            return;
        }

        // Update device card
        this.updateDeviceCard(deviceId, data);
        
        // Update mini chart
        this.updateMiniChart(deviceId, data);
        
        // Update modal if it's showing this device
        if (this.currentModalDeviceId === deviceId) {
            this.updateModalSensorData(data);
            this.updateModalChart(deviceId);
            document.getElementById('modal-last-seen').textContent = 
                `Last seen: ${new Date().toLocaleString('id-ID')}`;
        }
        
        // Update last update time
        const lastUpdateElement = document.getElementById(`last-update-${deviceId}`);
        if (lastUpdateElement) {
            const now = new Date();
            lastUpdateElement.textContent = now.toLocaleTimeString('id-ID');
        }
        
        // Update global last update
        this.updateLastUpdateTime();
    }

    updateDeviceCard(deviceId, data) {
        // Update distance
        const distanceElement = document.getElementById(`card-distance-${deviceId}`);
        if (distanceElement) {
            distanceElement.textContent = data.distance !== null ? `${data.distance} cm` : '-- cm';
        }

        // Update moisture
        const moistureElement = document.getElementById(`card-moisture-${deviceId}`);
        if (moistureElement) {
            moistureElement.textContent = `${data.soil_moisture || '--'}%`;
        }

        // Update temperature
        const temperatureElement = document.getElementById(`card-temperature-${deviceId}`);
        if (temperatureElement) {
            temperatureElement.textContent = data.temperature !== null ? `${parseFloat(data.temperature).toFixed(1)}°C` : '--°C';
        }

        // Update rain
        const rainElement = document.getElementById(`card-rain-${deviceId}`);
        if (rainElement) {
            rainElement.textContent = `${data.rain_percentage || '--'}%`;
        }
    }

    updateMiniChart(deviceId, data) {
        if (!this.deviceCharts[deviceId]) {
            console.log(`Chart for device ${deviceId} not found, creating new one`);
            this.createMiniChart(deviceId);
            if (!this.deviceCharts[deviceId]) {
                console.log(`Failed to create chart for device ${deviceId}`);
                return;
            }
        }

        const chart = this.deviceCharts[deviceId];
        const currentTime = new Date().toLocaleTimeString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit'
        });

        // Add new data point
        chart.data.labels.push(currentTime);
        chart.data.datasets[0].data.push(data.soil_moisture || 0);
        chart.data.datasets[1].data.push(data.temperature || 0);

        // Keep only last 8 data points for mini chart
        if (chart.data.labels.length > 8) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
            chart.data.datasets[1].data.shift();
        }

        // Update chart with animation
        chart.update('active');
        console.log(`Updated mini chart for device ${deviceId}`);
    }

    createMiniChart(deviceId) {
        const canvas = document.getElementById(`mini-chart-${deviceId}`);
        if (!canvas) {
            console.log(`Canvas mini-chart-${deviceId} not found`);
            return;
        }

        // Check if chart already exists
        if (this.deviceCharts[deviceId]) {
            this.deviceCharts[deviceId].destroy();
        }

        const ctx = canvas.getContext('2d');
        
        // Generate some initial data points for demonstration
        const initialLabels = [];
        const initialMoistureData = [];
        const initialTempData = [];
        
        for (let i = 5; i >= 0; i--) {
            const time = new Date();
            time.setMinutes(time.getMinutes() - i);
            initialLabels.push(time.toLocaleTimeString('id-ID', { 
                hour: '2-digit', 
                minute: '2-digit'
            }));
            
            // Use current device data or generate sample data
            const currentData = this.deviceData[deviceId];
            if (currentData && i === 0) {
                initialMoistureData.push(currentData.soil_moisture || 0);
                initialTempData.push(currentData.temperature || 0);
            } else {
                // Generate sample data with some variation
                const baseMoisture = currentData?.soil_moisture || 50;
                const baseTemp = currentData?.temperature || 25;
                initialMoistureData.push(baseMoisture + (Math.random() - 0.5) * 10);
                initialTempData.push(baseTemp + (Math.random() - 0.5) * 5);
            }
        }
        
        this.deviceCharts[deviceId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: initialLabels,
                datasets: [{
                    label: 'Kelembaban',
                    data: initialMoistureData,
                    borderColor: '#198754',
                    backgroundColor: 'rgba(25, 135, 84, 0.1)',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Suhu',
                    data: initialTempData,
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        display: false,
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        display: false,
                        grid: {
                            display: false
                        },
                        min: 0,
                        max: 100
                    }
                },
                elements: {
                    point: {
                        radius: 2,
                        hoverRadius: 4
                    }
                }
            }
        });

        console.log(`Mini chart created for device ${deviceId}`);
    }

    showDeviceDetail(deviceId) {
        const device = this.devices.find(d => d.device_id === deviceId) || 
                     this.connectedSerialPorts.find(p => p.deviceInfo?.device_id === deviceId)?.deviceInfo;
        
        if (!device) return;

        const data = this.deviceData[deviceId] || {};
        
        // Store current modal device for real-time updates
        this.currentModalDeviceId = deviceId;
        
        // Update modal content
        document.getElementById('deviceDetailModalLabel').innerHTML = 
            `<i class="fas fa-microchip me-2"></i>${device.device_name || 'Device Detail'}`;
        
        document.getElementById('modal-device-id').textContent = deviceId;
        document.getElementById('modal-device-name').textContent = device.device_name || 'Unknown';
        document.getElementById('modal-device-location').textContent = device.location || 'Unknown';
        
        // Update connection status in modal
        const isSerial = this.connectedSerialPorts.some(p => p.deviceInfo?.device_id === deviceId);
        const connectionBadge = document.getElementById('modal-connection-badge');
        if (isSerial) {
            connectionBadge.className = 'badge bg-info';
            connectionBadge.textContent = 'Serial Connection';
        } else {
            connectionBadge.className = 'badge bg-success';
            connectionBadge.textContent = 'WiFi Connection';
        }
        
        document.getElementById('modal-last-seen').textContent = 
            `Last seen: ${new Date().toLocaleString('id-ID')}`;

        // Update sensor data in modal
        this.updateModalSensorData(data);
        
        // Update modal chart
        this.updateModalChart(deviceId);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('deviceDetailModal'));
        modal.show();
        
        // Clear modal device when modal is hidden
        const modalElement = document.getElementById('deviceDetailModal');
        modalElement.addEventListener('hidden.bs.modal', () => {
            this.currentModalDeviceId = null;
        }, { once: true });
    }

    updateModalSensorData(data) {
        // Distance
        const distanceElement = document.getElementById('modal-distance-value');
        const distanceStatusElement = document.getElementById('modal-distance-status');
        if (data.distance !== null && data.distance !== undefined) {
            distanceElement.textContent = `${data.distance} cm`;
            distanceStatusElement.textContent = this.getDistanceStatus(data.distance);
            distanceStatusElement.className = `sensor-status ${this.getDistanceStatusClass(data.distance)}`;
        } else {
            distanceElement.textContent = '-- cm';
            distanceStatusElement.textContent = 'No data';
            distanceStatusElement.className = 'sensor-status text-muted';
        }

        // Moisture
        document.getElementById('modal-moisture-value').textContent = `${data.soil_moisture || '--'}%`;
        const moistureStatus = document.getElementById('modal-moisture-status');
        moistureStatus.textContent = data.moisture_status || 'No data';
        moistureStatus.className = `sensor-status ${data.moisture_status ? 'status-' + data.moisture_status.toLowerCase() : 'text-muted'}`;

        // Temperature
        const tempElement = document.getElementById('modal-temperature-value');
        const tempStatusElement = document.getElementById('modal-temperature-status');
        if (data.temperature !== null && data.temperature !== undefined) {
            tempElement.textContent = `${parseFloat(data.temperature).toFixed(1)}°C`;
            tempStatusElement.textContent = this.getTemperatureStatus(data.temperature);
            tempStatusElement.className = `sensor-status ${this.getTemperatureStatusClass(data.temperature)}`;
        } else {
            tempElement.textContent = '--°C';
            tempStatusElement.textContent = 'No data';
            tempStatusElement.className = 'sensor-status text-muted';
        }

        // Rain
        document.getElementById('modal-rain-value').textContent = `${data.rain_percentage || '--'}%`;
        const rainStatus = document.getElementById('modal-rain-status');
        rainStatus.textContent = data.rain_status || 'No data';
        rainStatus.className = `sensor-status ${data.rain_status ? 'status-' + data.rain_status.toLowerCase() : 'text-muted'}`;
    }

    updateModalChart(deviceId) {
        const deviceChart = this.deviceCharts[deviceId];
        if (!deviceChart) return;

        const modalChart = this.charts.modal;
        const currentData = this.deviceData[deviceId];
        
        // Copy data from device chart to modal chart
        modalChart.data.labels = [...deviceChart.data.labels];
        modalChart.data.datasets[0].data = [...deviceChart.data.datasets[0].data]; // Moisture
        modalChart.data.datasets[1].data = [...deviceChart.data.datasets[1].data]; // Temperature
        
        // Use real data for distance and rain
        modalChart.data.datasets[2].data = modalChart.data.labels.map((_, index) => {
            // Use actual distance data if available, otherwise use current value
            if (index === modalChart.data.labels.length - 1 && currentData) {
                return currentData.distance || 0;
            }
            return deviceChart.data.datasets[2] ? deviceChart.data.datasets[2].data[index] || 0 : 0;
        });
        
        modalChart.data.datasets[3].data = modalChart.data.labels.map((_, index) => {
            // Use actual rain data if available, otherwise use current value
            if (index === modalChart.data.labels.length - 1 && currentData) {
                return currentData.rain_percentage || 0;
            }
            return deviceChart.data.datasets[3] ? deviceChart.data.datasets[3].data[index] || 0 : 0;
        });
        
        modalChart.update('none');
    }

    checkAllDeviceAlerts() {
        const alerts = [];
        
        Object.keys(this.deviceData).forEach(deviceId => {
            const data = this.deviceData[deviceId];
            const device = this.devices.find(d => d.device_id === deviceId) || 
                         this.connectedSerialPorts.find(p => p.deviceInfo?.device_id === deviceId)?.deviceInfo;
            const deviceName = device?.device_name || deviceId;
            
            alerts.push(...this.getDeviceAlerts(data, deviceName));
        });
        
        this.displayAlerts(alerts);
    }

    getDeviceAlerts(data, deviceName) {
        const alerts = [];
        const devicePrefix = `[${deviceName}] `;

        // Check distance alert
        if (data.distance !== null && data.distance !== undefined) {
            if (data.distance < this.alertThresholds.distance.min) {
                alerts.push({
                    type: 'danger',
                    icon: 'fas fa-exclamation-triangle',
                    title: `${devicePrefix}Peringatan: Level Air Tinggi`,
                    message: `Jarak air hanya ${data.distance} cm. Segera periksa sistem drainase.`
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

        return alerts;
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
        this.fetchLatestData();
        this.updateTimer = setInterval(() => {
            this.fetchLatestData();
        }, this.updateInterval);
    }

    setupEventListeners() {
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
        const container = document.getElementById('alerts-container');
        const noDataAlert = `
            <div class="alert alert-info border-0 shadow-sm" role="alert">
                <div class="d-flex align-items-center">
                    <div class="text-center w-100">
                        <i class="fas fa-info-circle fs-2 mb-3 text-primary"></i>
                        <h5 class="mb-2">Menunggu Data Sensor</h5>
                        <p class="mb-0">Belum ada data terbaru dari device. Pastikan ESP32 terhubung dengan baik.</p>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML = noDataAlert;
    }

    // Serial Communication Methods
    

    async addSerialPort() {
        if (!('serial' in navigator)) {
            this.showSerialNotSupported();
            return;
        }

        try {
            const port = await navigator.serial.requestPort();
            await port.open({ 
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 'none'
            });

            const portInfo = {
                port: port,
                reader: null,
                decoder: new TextDecoderStream(),
                id: `port_${Date.now()}`,
                deviceInfo: null
            };

            this.connectedSerialPorts.push(portInfo);
            this.updateSerialPortUI();
            this.startSerialReadingForPort(portInfo);

        } catch (error) {
            if (error.name === 'NotFoundError') {
                console.log('User cancelled serial port selection');
            } else {
                console.warn('Additional serial connection failed:', error.message);
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
            for (const portInfo of this.connectedSerialPorts) {
                if (portInfo.reader) {
                    await portInfo.reader.cancel();
                    portInfo.reader.releaseLock();
                }
                if (portInfo.port) {
                    await portInfo.port.close();
                }
            }

            this.serialConnected = false;
            this.usingSerial = false;
            this.connectedSerialPorts = [];
            this.currentSerialDevice = null;

            this.updateSerialPortUI();
            this.createDeviceCards(); // Refresh cards
            this.startRealTimeUpdates();

        } catch (error) {
            console.error('Serial disconnection error:', error);
        }
    }

    updateSerialPortUI() {
        // No UI updates needed since we removed the port badges
        this.serialConnected = this.connectedSerialPorts.length > 0;
    }

    async startSerialReadingForPort(portInfo) {
        if (!portInfo.port) return;

        try {
            const readableStreamClosed = portInfo.port.readable.pipeTo(portInfo.decoder.writable);
            portInfo.reader = portInfo.decoder.readable.getReader();

            let buffer = '';

            while (this.serialConnected && this.connectedSerialPorts.includes(portInfo)) {
                const { value, done } = await portInfo.reader.read();
                if (done) break;

                buffer += value;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    this.parseSerialData(line.trim(), portInfo);
                }
            }
        } catch (error) {
            console.error('Serial reading error for port:', error);
            this.disconnectSpecificPort(portInfo.id);
        }
    }

    async disconnectSpecificPort(portId) {
        const portIndex = this.connectedSerialPorts.findIndex(p => p.id === portId);
        if (portIndex === -1) return;

        const portInfo = this.connectedSerialPorts[portIndex];

        try {
            if (portInfo.reader) {
                await portInfo.reader.cancel();
                portInfo.reader.releaseLock();
            }
            if (portInfo.port) {
                await portInfo.port.close();
            }
        } catch (error) {
            console.error('Error disconnecting specific port:', error);
        }

        this.connectedSerialPorts.splice(portIndex, 1);
        this.updateSerialPortUI();
        this.createDeviceCards(); // Refresh cards

        if (this.connectedSerialPorts.length === 0) {
            this.serialConnected = false;
            this.usingSerial = false;
            this.currentSerialDevice = null;
            this.startRealTimeUpdates();
        }
    }

    parseSerialData(line, portInfo) {
        try {
            // Look for device info header first
            if (line.includes('===') && line.includes('Sensor Readings')) {
                const deviceIdMatch = line.match(/===\s*([A-Z0-9_]+)\s+Sensor Readings\s*===/);
                if (deviceIdMatch) {
                    // Initialize device info if not exists
                    if (!portInfo.deviceInfo) {
                        portInfo.deviceInfo = {
                            device_id: deviceIdMatch[1].trim(),
                            device_name: 'Unknown Device',
                            location: 'Unknown Location',
                            connection_status: 'online'
                        };
                    } else {
                        portInfo.deviceInfo.device_id = deviceIdMatch[1].trim();
                    }
                }
                return;
            }

            // Parse JSON data
            if (line.includes('{') && line.includes('}')) {
                const jsonStart = line.indexOf('{');
                const jsonEnd = line.lastIndexOf('}') + 1;
                const jsonStr = line.substring(jsonStart, jsonEnd);

                const data = JSON.parse(jsonStr);

                // Use device info from ESP32 data
                const sensorData = {
                    device_id: data.device_id || `SERIAL_${portInfo.id}`,
                    device_name: data.device_name || 'Unknown Device',
                    device_location: data.device_location || 'Unknown Location',
                    distance: data.distance !== undefined ? data.distance : null,
                    soil_moisture: data.soil_moisture || 0,
                    moisture_status: data.moisture_status || 'Unknown',
                    temperature: data.temperature !== undefined ? data.temperature : null,
                    rain_percentage: data.rain_percentage || 0,
                    rain_status: data.rain_status || 'Unknown'
                };

                // Update device info from ESP32 data
                portInfo.deviceInfo = {
                    device_id: sensorData.device_id,
                    device_name: sensorData.device_name,
                    location: sensorData.device_location,
                    connection_status: 'online'
                };

                this.currentSerialDevice = portInfo.deviceInfo;
                this.updateDeviceData(sensorData);
                this.updateConnectionStatus(true);
                
                // Recreate cards if device info changed
                this.createDeviceCards();

            } else if (line.includes('Distance:') || line.includes('Soil Moisture:')) {
                this.parseTextSerialData(line, portInfo);
            }
        } catch (error) {
            console.error('Error parsing serial data:', error);
        }
    }

    parseTextSerialData(line, portInfo) {
        // Similar to previous implementation but now updates device data
        if (line.includes('===') && line.includes('(') && line.includes(')')) {
            const deviceNameMatch = line.match(/===\s*([^(]+)\s*\(([^)]+)\)\s*===/);
            if (deviceNameMatch) {
                portInfo.deviceInfo = {
                    device_name: deviceNameMatch[1].trim(),
                    device_id: deviceNameMatch[2].trim(),
                    location: 'Serial Connection',
                    connection_status: 'online'
                };
                this.currentSerialDevice = portInfo.deviceInfo;
            }
            return;
        }

        if (line.startsWith('Location:')) {
            const locationMatch = line.match(/Location:\s*(.+)/);
            if (locationMatch && portInfo.deviceInfo) {
                portInfo.deviceInfo.location = locationMatch[1].trim();
            }
            return;
        }

        const deviceInfo = portInfo.deviceInfo || this.currentSerialDevice;
        const sensorData = {
            device_id: deviceInfo?.device_id || `SERIAL_${portInfo.id}`,
            device_name: deviceInfo?.device_name || `Serial Device ${this.connectedSerialPorts.indexOf(portInfo) + 1}`,
            device_location: deviceInfo?.location || 'Serial Connection',
            distance: null,
            soil_moisture: 0,
            moisture_status: 'Unknown',
            temperature: null,
            rain_percentage: 0,
            rain_status: 'Unknown'
        };

        // Parse sensor values (same as before)
        const distanceMatch = line.match(/Distance:\s*(\d+)\s*cm/);
        if (distanceMatch) {
            sensorData.distance = parseInt(distanceMatch[1]);
        }

        const moistureMatch = line.match(/Soil Moisture:\s*(\d+)%\s*\(([^)]+)\)/);
        if (moistureMatch) {
            sensorData.soil_moisture = parseInt(moistureMatch[1]);
            sensorData.moisture_status = moistureMatch[2];
        }

        const tempMatch = line.match(/Temperature:\s*([0-9.]+)°C/);
        if (tempMatch) {
            sensorData.temperature = parseFloat(tempMatch[1]);
        }

        const rainMatch = line.match(/Rain:\s*(\d+)%\s*\(([^)]+)\)/);
        if (rainMatch) {
            sensorData.rain_percentage = parseInt(rainMatch[1]);
            sensorData.rain_status = rainMatch[2];
        }

        this.updateDeviceData(sensorData);
        this.updateConnectionStatus(true);
        this.updateSerialPortUI();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.iotDashboard = new IoTDashboard();
});
