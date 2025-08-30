
class IoTDashboard {
    constructor() {
        this.apiBaseUrl = 'api/';
        this.updateInterval = 3000;
        this.charts = {};
        this.alertThresholds = {
            distance: { min: 10, max: 100 },
            moisture: { min: 30, max: 80 },
            temperature: { min: 20, max: 35 },
            rain: { max: 50 }
        };

        this.serialPort = null;
        this.serialReader = null;
        this.serialConnected = false;
        this.usingSerial = false;
        this.currentSerialDevice = null;
        this.connectedSerialPorts = [];

        this.devices = [];
        this.deviceData = {};
        this.deviceCharts = {};
        this.currentModalDeviceId = null;

        this.init();
    }

    init() {
        this.loadDevices();
        this.startRealTimeUpdates();
        this.setupEventListeners();
        this.setupModalChart();
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
        
        let allDevices = [...this.devices];
        
        this.connectedSerialPorts.forEach(portInfo => {
            if (portInfo.deviceInfo) {
                allDevices.push({
                    ...portInfo.deviceInfo,
                    connectionType: 'serial'
                });
            }
        });

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

        this.devices.forEach(device => {
            cardsHtml += this.createDeviceCardHtml(device, 'api');
        });

        this.connectedSerialPorts.forEach(portInfo => {
            if (portInfo.deviceInfo) {
                cardsHtml += this.createDeviceCardHtml(portInfo.deviceInfo, 'serial');
            }
        });

        container.innerHTML = cardsHtml;
        
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
        if (this.usingSerial && this.connectedSerialPorts.length > 0 && this.devices.length === 0) {
            this.updateConnectionStatus(true);
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}get_latest.php`);
            const data = await response.json();

            if (data.success) {
                if (Array.isArray(data.data)) {
                    data.data.forEach(deviceData => {
                        this.updateDeviceData(deviceData);
                    });
                } else if (data.data) {
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
        
        if (!data.timestamp) {
            data.timestamp = new Date().toISOString();
        }
        
        this.deviceData[deviceId] = { ...data };

        if (!document.getElementById(`card-distance-${deviceId}`)) {
            this.createDeviceCards();
            return;
        }

        this.updateDeviceCard(deviceId, data);
        this.updateMiniChart(deviceId, data);

        if (this.currentModalDeviceId === deviceId) {
            this.updateModalSensorData(data);
            this.updateModalChart(deviceId);
            
            const modalLastSeen = document.getElementById('modal-last-seen');
            if (modalLastSeen) {
                const timestamp = new Date(data.timestamp);
                modalLastSeen.textContent = `Last seen: ${timestamp.toLocaleString('id-ID')}`;
            }
        }

        const lastUpdateElement = document.getElementById(`last-update-${deviceId}`);
        if (lastUpdateElement) {
            const timestamp = new Date(data.timestamp);
            lastUpdateElement.textContent = timestamp.toLocaleTimeString('id-ID');
        }

        this.updateLastUpdateTime();
    }

    updateDeviceCard(deviceId, data) {
        const distanceElement = document.getElementById(`card-distance-${deviceId}`);
        if (distanceElement) {
            distanceElement.textContent = data.distance !== null ? `${data.distance} cm` : '-- cm';
        }

        const moistureElement = document.getElementById(`card-moisture-${deviceId}`);
        if (moistureElement) {
            moistureElement.textContent = `${data.soil_moisture || '--'}%`;
        }

        const temperatureElement = document.getElementById(`card-temperature-${deviceId}`);
        if (temperatureElement) {
            temperatureElement.textContent = data.temperature !== null ? `${parseFloat(data.temperature).toFixed(1)}°C` : '--°C';
        }

        const rainElement = document.getElementById(`card-rain-${deviceId}`);
        if (rainElement) {
            rainElement.textContent = `${data.rain_percentage || '--'}%`;
        }

        const statusElement = document.getElementById(`status-${deviceId}`);
        if (statusElement) {
            statusElement.className = `badge ${this.getDeviceStatusBadgeClass(data)}`;
            statusElement.textContent = this.getDeviceStatusText(data);
        }
    }

    updateMiniChart(deviceId, data) {
        if (!this.deviceCharts[deviceId]) {
            this.createMiniChart(deviceId);
            if (!this.deviceCharts[deviceId]) {
                return;
            }
        }

        const chart = this.deviceCharts[deviceId];
        
        const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
        const currentTime = timestamp.toLocaleTimeString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit'
        });

        const lastLabel = chart.data.labels[chart.data.labels.length - 1];
        if (lastLabel === currentTime) {
            const lastIndex = chart.data.labels.length - 1;
            chart.data.datasets[0].data[lastIndex] = data.soil_moisture || 0;
            chart.data.datasets[1].data[lastIndex] = data.temperature || 0;
        } else {
            chart.data.labels.push(currentTime);
            chart.data.datasets[0].data.push(data.soil_moisture || 0);
            chart.data.datasets[1].data.push(data.temperature || 0);
        }

        if (chart.data.labels.length > 8) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
            chart.data.datasets[1].data.shift();
        }

        chart.update('none');
    }

    createMiniChart(deviceId) {
        const canvas = document.getElementById(`mini-chart-${deviceId}`);
        if (!canvas) {
            console.log(`Canvas mini-chart-${deviceId} not found`);
            return;
        }

        if (this.deviceCharts[deviceId]) {
            this.deviceCharts[deviceId].destroy();
        }

        const ctx = canvas.getContext('2d');
        
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
            
            const currentData = this.deviceData[deviceId];
            if (currentData && i === 0) {
                initialMoistureData.push(currentData.soil_moisture || 0);
                initialTempData.push(currentData.temperature || 0);
            } else {
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
                    label: 'Kelembaban (%)',
                    data: initialMoistureData,
                    borderColor: '#198754',
                    backgroundColor: 'rgba(25, 135, 84, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                }, {
                    label: 'Suhu (°C)',
                    data: initialTempData,
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 200
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            padding: 8,
                            font: {
                                size: 10
                            }
                        }
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        titleFont: {
                            size: 11
                        },
                        bodyFont: {
                            size: 10
                        },
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                if (label.includes('Suhu')) {
                                    return `${label}: ${value.toFixed(1)}°C`;
                                } else {
                                    return `${label}: ${value.toFixed(0)}%`;
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: false
                        },
                        ticks: {
                            display: false
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            display: true,
                            font: {
                                size: 9
                            },
                            callback: function(value) {
                                return value + '%';
                            }
                        },
                        min: 0,
                        max: 100
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: {
                            drawOnChartArea: false,
                        },
                        ticks: {
                            display: true,
                            font: {
                                size: 9
                            },
                            callback: function(value) {
                                return value + '°C';
                            }
                        },
                        min: 15,
                        max: 40
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
        
        this.currentModalDeviceId = deviceId;
        
        document.getElementById('deviceDetailModalLabel').innerHTML = 
            `<i class="fas fa-microchip me-2"></i>${device.device_name || 'Device Detail'}`;
        
        document.getElementById('modal-device-id').textContent = deviceId;
        document.getElementById('modal-device-name').textContent = device.device_name || 'Unknown';
        document.getElementById('modal-device-location').textContent = device.location || 'Unknown';
        
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

        this.updateModalSensorData(data);
        this.updateModalChart(deviceId);
        
        const modal = new bootstrap.Modal(document.getElementById('deviceDetailModal'));
        modal.show();
        
        const modalElement = document.getElementById('deviceDetailModal');
        modalElement.addEventListener('hidden.bs.modal', () => {
            this.currentModalDeviceId = null;
        }, { once: true });
    }

    updateModalSensorData(data) {
        const distanceElement = document.getElementById('modal-distance-value');
        const distanceStatusElement = document.getElementById('modal-distance-status');
        if (data.distance !== null && data.distance !== undefined) {
            distanceElement.textContent = `${data.distance} cm`;
            distanceStatusElement.textContent = data.distance_status || this.getDistanceStatus(data.distance);
            distanceStatusElement.className = `sensor-status ${this.getDistanceStatusClass(data.distance)}`;
        } else {
            distanceElement.textContent = '-- cm';
            distanceStatusElement.textContent = 'No data';
            distanceStatusElement.className = 'sensor-status text-muted';
        }

        document.getElementById('modal-moisture-value').textContent = `${data.soil_moisture || '--'}%`;
        const moistureStatus = document.getElementById('modal-moisture-status');
        moistureStatus.textContent = data.moisture_status || 'No data';
        moistureStatus.className = `sensor-status ${data.moisture_status ? 'status-' + data.moisture_status.toLowerCase() : 'text-muted'}`;

        const tempElement = document.getElementById('modal-temperature-value');
        const tempStatusElement = document.getElementById('modal-temperature-status');
        if (data.temperature !== null && data.temperature !== undefined) {
            tempElement.textContent = `${parseFloat(data.temperature).toFixed(1)}°C`;
            tempStatusElement.textContent = data.temperature_status || this.getTemperatureStatus(data.temperature);
            tempStatusElement.className = `sensor-status ${this.getTemperatureStatusClass(data.temperature)}`;
        } else {
            tempElement.textContent = '--°C';
            tempStatusElement.textContent = 'No data';
            tempStatusElement.className = 'sensor-status text-muted';
        }

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

        modalChart.data.labels = [...deviceChart.data.labels];
        modalChart.data.datasets[0].data = [...deviceChart.data.datasets[0].data];
        modalChart.data.datasets[1].data = [...deviceChart.data.datasets[1].data];

        modalChart.data.datasets[2].data = modalChart.data.labels.map((_, index) => {
            if (index === modalChart.data.labels.length - 1 && currentData) {
                return currentData.distance || 0;
            }
            return 0;
        });

        modalChart.data.datasets[3].data = modalChart.data.labels.map((_, index) => {
            if (index === modalChart.data.labels.length - 1 && currentData) {
                return currentData.rain_percentage || 0;
            }
            return 0;
        });

        modalChart.update('none');
    }

    checkAllDeviceAlerts() {
        const alerts = [];

        Object.keys(this.deviceData).forEach(deviceId => {
            const data = this.deviceData[deviceId];
            const device = this.devices.find(d => d.device_id === deviceId);
            const deviceName = device?.device_name || deviceId;

            alerts.push(...this.getDeviceAlerts(data, deviceName));
        });

        this.displayAlerts(alerts);
    }

    getDeviceAlerts(data, deviceName) {
        const alerts = [];
        const devicePrefix = `[${deviceName}] `;

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

    getDeviceStatusBadgeClass(data) {
        if (!data || !data.timestamp) {
            return 'bg-secondary';
        }

        const now = new Date();
        const lastUpdate = new Date(data.timestamp);
        const timeDiff = (now - lastUpdate) / 1000 / 60;

        if (timeDiff <= 5) return 'bg-success';
        if (timeDiff <= 30) return 'bg-warning';
        return 'bg-danger';
    }

    getDeviceStatusText(data) {
        if (!data || !data.timestamp) {
            return 'No Data';
        }

        const now = new Date();
        const lastUpdate = new Date(data.timestamp);
        const timeDiff = (now - lastUpdate) / 1000 / 60;

        if (timeDiff <= 5) return 'Online';
        if (timeDiff <= 30) return 'Warning';
        return 'Offline';
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
        const addDeviceForm = document.getElementById('addDeviceForm');
        if (addDeviceForm) {
            addDeviceForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addDevice();
            });
        }

        const editDeviceForm = document.getElementById('editDeviceForm');
        if (editDeviceForm) {
            editDeviceForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.updateDevice();
            });
        }

        const deviceManagementTabs = document.getElementById('deviceManagementTabs');
        if (deviceManagementTabs) {
            deviceManagementTabs.addEventListener('click', (e) => {
                if (e.target.id === 'add-device-tab') {
                    this.resetAddDeviceForm();
                }
            });
        }
    }

    resetAddDeviceForm() {
        document.getElementById('addDeviceForm').reset();
        document.getElementById('addDeviceForm').classList.remove('d-none');
        document.getElementById('addDeviceSuccess').classList.add('d-none');
    }

    showManageDeviceModal() {
        this.resetManageDeviceModal();
        this.loadDeviceManagementList();
        const modal = new bootstrap.Modal(document.getElementById('manageDeviceModal'));
        modal.show();
    }

    resetManageDeviceModal() {
        document.getElementById('addDeviceForm').reset();
        document.getElementById('addDeviceSuccess').classList.add('d-none');
        document.getElementById('device-list-tab').click();
    }

    async loadDeviceManagementList() {
        try {
            const response = await fetch(`${this.apiBaseUrl}get_devices.php`);
            const result = await response.json();

            const tbody = document.getElementById('deviceManagementList');

            if (result.success && result.data.length > 0) {
                tbody.innerHTML = result.data.map(device => `
                    <tr>
                        <td><code>${device.device_id}</code></td>
                        <td>${device.device_name || '-'}</td>
                        <td>${device.location || '-'}</td>
                        <td>
                            <span class="badge ${device.is_online ? 'bg-success' : 'bg-secondary'}">
                                ${device.is_online ? 'Online' : 'Offline'}
                            </span>
                        </td>
                        <td>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary" onclick="window.iotDashboard.editDevice('${device.device_id}')" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-outline-danger" onclick="window.iotDashboard.confirmDeleteDevice('${device.device_id}', '${device.device_name}')" title="Hapus">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada device terdaftar</td></tr>';
            }
        } catch (error) {
            console.error('Error loading device list:', error);
            document.getElementById('deviceManagementList').innerHTML = 
                '<tr><td colspan="5" class="text-center text-danger">Error loading devices</td></tr>';
        }
    }

    async addDevice() {
        const deviceData = {
            device_id: document.getElementById('deviceId').value.trim(),
            device_name: document.getElementById('deviceName').value.trim(),
            location: document.getElementById('deviceLocation').value.trim(),
            description: document.getElementById('deviceDescription').value.trim()
        };

        if (!deviceData.device_id || !deviceData.device_name) {
            this.showAlert('Device ID dan Device Name harus diisi!', 'danger');
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}add_device.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(deviceData)
            });

            const result = await response.json();

            if (result.success) {
                document.getElementById('addDeviceForm').classList.add('d-none');
                document.getElementById('addDeviceSuccess').classList.remove('d-none');

                document.getElementById('successDeviceId').textContent = deviceData.device_id;
                document.getElementById('generatedEspCode').textContent = result.data.esp_code;

                this.showAlert('Device berhasil ditambahkan!', 'success');
                this.loadDeviceManagementList();
                this.loadDevices();
            } else {
                this.showAlert('Error: ' + (result.message || 'Failed to add device'), 'danger');
            }
        } catch (error) {
            console.error('Error adding device:', error);
            this.showAlert('Error adding device: ' + error.message, 'danger');
        }
    }

    async editDevice(deviceId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}get_devices.php?device_id=${deviceId}`);
            const result = await response.json();

            if (result.success && result.data.length > 0) {
                const device = result.data[0];

                document.getElementById('editDeviceId').value = device.device_id;
                document.getElementById('editDeviceIdDisplay').value = device.device_id;
                document.getElementById('editDeviceName').value = device.device_name || '';
                document.getElementById('editDeviceLocation').value = device.location || '';
                document.getElementById('editDeviceDescription').value = device.description || '';

                const modal = new bootstrap.Modal(document.getElementById('editDeviceModal'));
                modal.show();
            }
        } catch (error) {
            console.error('Error loading device for edit:', error);
            this.showAlert('Error loading device data', 'danger');
        }
    }

    async updateDevice() {
        const deviceData = {
            device_id: document.getElementById('editDeviceId').value,
            device_name: document.getElementById('editDeviceName').value,
            location: document.getElementById('editDeviceLocation').value,
            description: document.getElementById('editDeviceDescription').value
        };

        try {
            const response = await fetch(`${this.apiBaseUrl}update_device.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(deviceData)
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('Device berhasil diperbarui!', 'success');
                bootstrap.Modal.getInstance(document.getElementById('editDeviceModal')).hide();
                this.loadDeviceManagementList();
                this.loadDevices();
            } else {
                this.showAlert('Error: ' + (result.message || 'Failed to update device'), 'danger');
            }
        } catch (error) {
            console.error('Error updating device:', error);
            this.showAlert('Error updating device', 'danger');
        }
    }

    confirmDeleteDevice(deviceId, deviceName) {
        if (confirm(`Apakah Anda yakin ingin menghapus device "${deviceName}" (${deviceId})?\n\nSemua data sensor untuk device ini akan ikut terhapus!`)) {
            this.deleteDevice(deviceId);
        }
    }

    async deleteDevice(deviceId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}delete_device.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ device_id: deviceId })
            });

            const result = await response.json();

            if (result.success) {
                this.showAlert('Device berhasil dihapus!', 'success');
                this.loadDeviceManagementList();
                this.loadDevices();
            } else {
                this.showAlert('Error: ' + (result.message || 'Failed to delete device'), 'danger');
            }
        } catch (error) {
            console.error('Error deleting device:', error);
            this.showAlert('Error deleting device', 'danger');
        }
    }

    copyEspCode() {
        const codeElement = document.getElementById('generatedEspCode');
        const code = codeElement.textContent;

        navigator.clipboard.writeText(code).then(() => {
            this.showAlert('Kode ESP32 berhasil disalin!', 'success');
        }).catch(err => {
            console.error('Failed to copy code: ', err);
            this.showAlert('Gagal menyalin kode', 'danger');
        });
    }

    showAlert(message, type = 'info') {
        let alertPlaceholder = document.getElementById('alertMessages');
        if (!alertPlaceholder) {
            alertPlaceholder = document.createElement('div');
            alertPlaceholder.id = 'alertMessages';
            alertPlaceholder.className = 'position-fixed top-0 end-0 p-3';
            alertPlaceholder.style.zIndex = '9999';
            document.body.appendChild(alertPlaceholder);
        }

        const wrapper = document.createElement('div');
        wrapper.innerHTML = [
            `<div class="alert alert-${type} alert-dismissible fade show" role="alert">`,
            `   ${message}`,
            '   <button type="button" class="btn-close" data-bs-dismiss="alert"></button>',
            '</div>'
        ].join('');
        alertPlaceholder.append(wrapper);

        setTimeout(() => {
            const alert = wrapper.querySelector('.alert');
            if (alert) {
                alert.remove();
            }
        }, 5000);
    }

    refreshData() {
        this.loadDevices();
        this.fetchLatestData();
    }

    async addSerialPort() {
        console.log('addSerialPort function called');
        
        if (!('serial' in navigator)) {
            console.log('Serial API not supported');
            this.showSerialNotSupported();
            return;
        }

        try {
            console.log('Requesting serial port...');
            const port = await navigator.serial.requestPort();
            console.log('Port selected, opening...');
            
            await port.open({ 
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 'none'
            });

            console.log('Port opened successfully');

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

            console.log('Serial port added successfully');

        } catch (error) {
            console.error('Error in addSerialPort:', error);
            if (error.name === 'NotFoundError') {
                console.log('User cancelled serial port selection');
            } else {
                console.warn('Additional serial connection failed:', error.message);
                this.showSerialError(error.message);
            }
        }
    }

    async showNoDataMessage() {
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

    async startSerialReadingForPort(portInfo) {
        if (!portInfo.port) return;

        this.serialConnected = true;

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
                    const trimmedLine = line.trim();
                    if (trimmedLine.length > 0) {
                        console.log(`Port ${portInfo.id} received:`, trimmedLine);
                        this.parseSerialData(trimmedLine, portInfo);
                    }
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
        this.createDeviceCards();

        if (this.connectedSerialPorts.length === 0) {
            this.serialConnected = false;
            this.usingSerial = false;
            this.currentSerialDevice = null;
            this.startRealTimeUpdates();
        }
    }

    parseSerialData(line, portInfo) {
        try {
            if (line.includes('===') && line.includes('Sensor Readings')) {
                const deviceIdMatch = line.match(/===\s*([A-Z0-9_]+)\s+Sensor Readings\s*===/);
                if (deviceIdMatch) {
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

            if (line.includes('{') && line.includes('}')) {
                const jsonStart = line.indexOf('{');
                const jsonEnd = line.lastIndexOf('}') + 1;
                const jsonStr = line.substring(jsonStart, jsonEnd);

                const data = JSON.parse(jsonStr);

                const sensorData = {
                    device_id: data.device_id || `SERIAL_${portInfo.id}`,
                    device_name: data.device_name || 'Unknown Device',
                    device_location: data.device_location || 'Unknown Location',
                    distance: data.distance !== undefined ? data.distance : null,
                    soil_moisture: data.soil_moisture || 0,
                    moisture_status: data.moisture_status || 'Unknown',
                    temperature: data.temperature !== undefined ? data.temperature : null,
                    rain_percentage: data.rain_percentage || 0,
                    rain_status: data.rain_status || 'Unknown',
                    timestamp: new Date().toISOString()
                };

                portInfo.deviceInfo = {
                    device_id: sensorData.device_id,
                    device_name: sensorData.device_name,
                    location: sensorData.device_location,
                    connection_status: 'online'
                };

                this.updateDeviceData(sensorData);
                this.updateConnectionStatus(true);
                
                if (!document.getElementById(`card-distance-${sensorData.device_id}`)) {
                    this.createDeviceCards();
                }

            } else if (line.includes('Distance:') || line.includes('Soil Moisture:')) {
                this.parseTextSerialData(line, portInfo);
            }
        } catch (error) {
            console.error('Error parsing serial data:', error);
        }
    }

    parseTextSerialData(line, portInfo) {
        if (line.includes('===') && line.includes('(') && line.includes(')')) {
            const deviceNameMatch = line.match(/===\s*([^(]+)\s*\(([^)]+)\)\s*===/);
            if (deviceNameMatch) {
                portInfo.deviceInfo = {
                    device_name: deviceNameMatch[1].trim(),
                    device_id: deviceNameMatch[2].trim(),
                    location: 'Serial Connection',
                    connection_status: 'online'
                };
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

        if (!portInfo.deviceInfo) {
            return;
        }

        const deviceInfo = portInfo.deviceInfo;
        let hasData = false;
        
        const sensorData = {
            device_id: deviceInfo.device_id,
            device_name: deviceInfo.device_name,
            device_location: deviceInfo.location,
            distance: this.deviceData[deviceInfo.device_id]?.distance || null,
            soil_moisture: this.deviceData[deviceInfo.device_id]?.soil_moisture || 0,
            moisture_status: this.deviceData[deviceInfo.device_id]?.moisture_status || 'Unknown',
            temperature: this.deviceData[deviceInfo.device_id]?.temperature || null,
            rain_percentage: this.deviceData[deviceInfo.device_id]?.rain_percentage || 0,
            rain_status: this.deviceData[deviceInfo.device_id]?.rain_status || 'Unknown',
            timestamp: new Date().toISOString()
        };

        const distanceMatch = line.match(/Distance:\s*(\d+)\s*cm/);
        if (distanceMatch) {
            sensorData.distance = parseInt(distanceMatch[1]);
            hasData = true;
        }

        const moistureMatch = line.match(/Soil Moisture:\s*(\d+)%\s*\(([^)]+)\)/);
        if (moistureMatch) {
            sensorData.soil_moisture = parseInt(moistureMatch[1]);
            sensorData.moisture_status = moistureMatch[2];
            hasData = true;
        }

        const tempMatch = line.match(/Temperature:\s*([0-9.]+)°C/);
        if (tempMatch) {
            sensorData.temperature = parseFloat(tempMatch[1]);
            hasData = true;
        }

        const rainMatch = line.match(/Rain:\s*(\d+)%\s*\(([^)]+)\)/);
        if (rainMatch) {
            sensorData.rain_percentage = parseInt(rainMatch[1]);
            sensorData.rain_status = rainMatch[2];
            hasData = true;
        }

        if (hasData) {
            this.updateDeviceData(sensorData);
            this.updateConnectionStatus(true);
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
            this.createDeviceCards();
            this.startRealTimeUpdates();

        } catch (error) {
            console.error('Serial disconnection error:', error);
        }
    }

    updateSerialPortUI() {
        this.serialConnected = this.connectedSerialPorts.length > 0;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.iotDashboard = new IoTDashboard();
});
