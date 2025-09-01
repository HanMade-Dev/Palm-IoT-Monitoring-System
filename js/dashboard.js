class IoTDashboard {
    constructor() {
        this.apiBaseUrl = 'api/';
        this.updateInterval = 3000; // Update every 3 seconds
        this.charts = {}; // Main modal chart
        this.deviceCharts = {}; // Mini charts for each device card
        this.alertThresholds = {
            distance: { min: 10, max: 100 }, // Example thresholds
            moisture: { min: 30, max: 80 },
            temperature: { min: 20, max: 35 },
            rain: { max: 50 }
        };

        this.serialPort = null; // For single serial connection (deprecated in favor of multiple)
        this.serialReader = null;
        this.serialConnected = false; // Overall serial connection status
        this.connectedSerialPorts = []; // Array to hold multiple serial port connections

        this.devices = []; // Devices from database
        this.deviceData = {}; // Latest sensor data for each device (from API or serial)
        this.currentModalDeviceId = null; // Device ID currently shown in detail modal

        this.init();
    }

    init() {
        this.loadDevices(); // Load devices from DB first
        this.startRealTimeUpdates(); // Start fetching data from API
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
                            text: 'Kelembaban (%) / Jarak (cm)'
                        },
                        min: 0,
                        max: 100 // Assuming moisture and distance are often in this range
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Suhu (°C) / Hujan (%)'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                        min: 0,
                        max: 100 // Assuming temperature and rain can be scaled to this range for combined axis
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    if (label.includes('Kelembaban') || label.includes('Hujan')) {
                                        label += context.parsed.y + '%';
                                    } else if (label.includes('Suhu')) {
                                        label += context.parsed.y + '°C';
                                    } else if (label.includes('Jarak')) {
                                        label += context.parsed.y + ' cm';
                                    }
                                }
                                return label;
                            }
                        }
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
                this.createDeviceCards(); // Re-render cards after loading devices
            } else {
                console.error('Failed to load devices:', data.message);
                this.showErrorInDeviceContainer('Failed to load devices: ' + data.message);
            }
        } catch (error) {
            console.error('Error loading devices:', error);
            this.showErrorInDeviceContainer('Error loading devices. Please check server connection.');
        }
    }

    createDeviceCards() {
        const container = document.getElementById('devices-container');
        
        // Combine devices from DB and currently connected serial ports
        let allDevices = [...this.devices];
        this.connectedSerialPorts.forEach(portInfo => {
            if (portInfo.deviceInfo && !allDevices.some(d => d.device_id === portInfo.deviceInfo.device_id)) {
                allDevices.push({
                    ...portInfo.deviceInfo,
                    connectionType: 'serial' // Mark as serial connection
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
        allDevices.forEach(device => {
            cardsHtml += this.createDeviceCardHtml(device);
        });

        container.innerHTML = cardsHtml;
        
        // Initialize mini charts after cards are rendered
        setTimeout(() => {
            allDevices.forEach(device => {
                const deviceId = device.device_id;
                const canvasElement = document.getElementById(`mini-chart-${deviceId}`);
                if (canvasElement) {
                    this.createMiniChart(deviceId);
                }
            });
        }, 100); // Small delay to ensure DOM is ready
    }

    createDeviceCardHtml(device) {
        const deviceId = device.device_id;
        const data = this.deviceData[deviceId] || {}; // Get latest data for this device
        const connectionType = device.connectionType || 'api'; // Default to API if not specified (from DB)
        
        const statusBadgeClass = connectionType === 'serial' ? 'bg-info' : this.getDeviceStatusBadgeClass(data);
        const statusText = connectionType === 'serial' ? 'Serial' : this.getDeviceStatusText(data);

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
                            <span class="badge ${statusBadgeClass}" id="status-${deviceId}">
                                ${statusText}
                            </span>
                        </div>
                    </div>
                    
                    <div class="device-card-sensors">
                        <div class="mini-sensor">
                            <div class="mini-sensor-icon bg-primary">
                                <i class="fas fa-water"></i>
                            </div>
                            <div class="mini-sensor-value" id="card-distance-${deviceId}">${data.distance !== undefined && data.distance !== null ? data.distance : '--'} cm</div>
                            <div class="mini-sensor-label">Jarak Air</div>
                        </div>
                        <div class="mini-sensor">
                            <div class="mini-sensor-icon bg-success">
                                <i class="fas fa-tint"></i>
                            </div>
                            <div class="mini-sensor-value" id="card-moisture-${deviceId}">${data.soil_moisture !== undefined && data.soil_moisture !== null ? data.soil_moisture : '--'}%</div>
                            <div class="mini-sensor-label">Kelembaban</div>
                        </div>
                        <div class="mini-sensor">
                            <div class="mini-sensor-icon bg-warning">
                                <i class="fas fa-thermometer-half"></i>
                            </div>
                            <div class="mini-sensor-value" id="card-temperature-${deviceId}">${data.temperature !== undefined && data.temperature !== null ? parseFloat(data.temperature).toFixed(1) : '--'}°C</div>
                            <div class="mini-sensor-label">Suhu</div>
                        </div>
                        <div class="mini-sensor">
                            <div class="mini-sensor-icon bg-info">
                                <i class="fas fa-cloud-rain"></i>
                            </div>
                            <div class="mini-sensor-value" id="card-rain-${deviceId}">${data.rain_percentage !== undefined && data.rain_percentage !== null ? data.rain_percentage : '--'}%</div>
                            <div class="mini-sensor-label">Hujan</div>
                        </div>
                    </div>
                    
                    <div class="mini-chart-container">
                        <canvas id="mini-chart-${deviceId}" width="400" height="120"></canvas>
                    </div>
                    
                    <div class="device-card-footer">
                        <small class="text-muted">
                            Last update: <span id="last-update-${deviceId}">${data.timestamp ? new Date(data.timestamp).toLocaleTimeString('id-ID') : '-'}</span>
                        </small>
                        <i class="fas fa-external-link-alt text-primary"></i>
                    </div>
                </div>
            </div>
        `;
    }

    async fetchLatestData() {
        // If any serial port is connected, we assume data is coming via serial for those devices
        // and only fetch API data for non-serial devices.
        // However, for simplicity, we'll let the API handle its own data and serial handle its.
        // The `deviceData` object will be updated by both sources.

        try {
            const response = await fetch(`${this.apiBaseUrl}live.php`);
            const data = await response.json();

            if (data.success) {
                if (Array.isArray(data.data)) {
                    data.data.forEach(deviceData => {
                        this.updateDeviceData(deviceData);
                    });
                } else if (data.data) { // Handle single device response if API changes
                    this.updateDeviceData(data.data);
                }
                this.updateConnectionStatus(true); // API connection is active
                this.checkAllDeviceAlerts();
            } else {
                console.warn('API returned no success:', data.message);
                // If no API data, and no serial data, show no data message
                if (Object.keys(this.deviceData).length === 0 && this.connectedSerialPorts.length === 0) {
                    this.showNoDataMessage();
                }
                this.updateConnectionStatus(false); // API connection might be problematic
            }
        } catch (error) {
            console.warn('Network error fetching latest data:', error.message);
            // If network error, and no serial data, show disconnected status
            if (this.connectedSerialPorts.length === 0) {
                this.updateConnectionStatus(false);
            }
            if (Object.keys(this.deviceData).length === 0 && this.connectedSerialPorts.length === 0) {
                this.showNoDataMessage();
            }
        }
        this.updateLastUpdateTime(); // Update global last update time
    }

    updateDeviceData(data) {
        const deviceId = data.device_id;
        
        // Ensure timestamp is a Date object or parsable string
        if (!data.timestamp) {
            data.timestamp = new Date().toISOString();
        }
        
        // Store or update the latest data for this device
        this.deviceData[deviceId] = { ...data };

        // Check if the card for this device exists, if not, re-create all cards
        // This handles cases where a new device sends data or serial device connects
        if (!document.getElementById(`card-distance-${deviceId}`)) {
            this.createDeviceCards();
            // After re-creating cards, the updateDeviceCard will be called by the loop
            return; 
        }

        this.updateDeviceCard(deviceId, data);
        this.updateMiniChart(deviceId, data);

        // If the detail modal for this device is open, update its content
        if (this.currentModalDeviceId === deviceId) {
            this.updateModalSensorData(data);
            this.updateModalChart(deviceId);
            
            const modalLastSeen = document.getElementById('modal-last-seen');
            if (modalLastSeen) {
                const timestamp = new Date(data.timestamp);
                modalLastSeen.textContent = `Last seen: ${timestamp.toLocaleString('id-ID')}`;
            }
        }

        // Update last update time on the card
        const lastUpdateElement = document.getElementById(`last-update-${deviceId}`);
        if (lastUpdateElement) {
            const timestamp = new Date(data.timestamp);
            lastUpdateElement.textContent = timestamp.toLocaleTimeString('id-ID');
        }
    }

    updateDeviceCard(deviceId, data) {
        const distanceElement = document.getElementById(`card-distance-${deviceId}`);
        if (distanceElement) {
            distanceElement.textContent = data.distance !== undefined && data.distance !== null ? `${data.distance} cm` : '-- cm';
        }

        const moistureElement = document.getElementById(`card-moisture-${deviceId}`);
        if (moistureElement) {
            moistureElement.textContent = data.soil_moisture !== undefined && data.soil_moisture !== null ? `${data.soil_moisture}%` : '--%';
        }

        const temperatureElement = document.getElementById(`card-temperature-${deviceId}`);
        if (temperatureElement) {
            temperatureElement.textContent = data.temperature !== undefined && data.temperature !== null ? `${parseFloat(data.temperature).toFixed(1)}°C` : '--°C';
        }

        const rainElement = document.getElementById(`card-rain-${deviceId}`);
        if (rainElement) {
            rainElement.textContent = data.rain_percentage !== undefined && data.rain_percentage !== null ? `${data.rain_percentage}%` : '--%';
        }

        const statusElement = document.getElementById(`status-${deviceId}`);
        if (statusElement) {
            // Determine if this device is connected via serial
            const isSerial = this.connectedSerialPorts.some(p => p.deviceInfo?.device_id === deviceId);
            if (isSerial) {
                statusElement.className = 'badge bg-info';
                statusElement.textContent = 'Serial';
            } else {
                statusElement.className = `badge ${this.getDeviceStatusBadgeClass(data)}`;
                statusElement.textContent = this.getDeviceStatusText(data);
            }
        }
    }

    createMiniChart(deviceId) {
        const canvas = document.getElementById(`mini-chart-${deviceId}`);
        if (!canvas) {
            // console.log(`Canvas mini-chart-${deviceId} not found`);
            return;
        }

        // Destroy existing chart if it exists to prevent duplicates
        if (this.deviceCharts[deviceId]) {
            this.deviceCharts[deviceId].destroy();
        }

        const ctx = canvas.getContext('2d');
        
        // Initialize with some placeholder data or last known data
        const initialLabels = [];
        const initialMoistureData = [];
        const initialTempData = [];
        
        // Populate with last few data points if available, otherwise dummy data
        const currentData = this.deviceData[deviceId];
        if (currentData) {
            // For simplicity, let's just add the current data point
            initialLabels.push(new Date(currentData.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
            initialMoistureData.push(currentData.soil_moisture || 0);
            initialTempData.push(currentData.temperature || 0);
        } else {
            // Fallback for devices with no data yet
            initialLabels.push(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
            initialMoistureData.push(50); // Default value
            initialTempData.push(25); // Default value
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
                            display: false // Hide x-axis labels for mini chart
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
    }

    updateMiniChart(deviceId, data) {
        const chart = this.deviceCharts[deviceId];
        if (!chart) {
            // If chart doesn't exist yet, create it. This can happen if data arrives before card is fully rendered.
            this.createMiniChart(deviceId);
            return; // Re-call update after creation
        }

        const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
        const currentTime = timestamp.toLocaleTimeString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit'
        });

        const lastLabel = chart.data.labels[chart.data.labels.length - 1];
        
        // If the last timestamp is the same, update the last data point
        if (lastLabel === currentTime) {
            const lastIndex = chart.data.labels.length - 1;
            chart.data.datasets[0].data[lastIndex] = data.soil_moisture !== undefined && data.soil_moisture !== null ? data.soil_moisture : 0;
            chart.data.datasets[1].data[lastIndex] = data.temperature !== undefined && data.temperature !== null ? data.temperature : 0;
        } else {
            // Otherwise, add a new data point
            chart.data.labels.push(currentTime);
            chart.data.datasets[0].data.push(data.soil_moisture !== undefined && data.soil_moisture !== null ? data.soil_moisture : 0);
            chart.data.datasets[1].data.push(data.temperature !== undefined && data.temperature !== null ? data.temperature : 0);
        }

        // Keep only the last N data points (e.g., 8 for mini chart)
        const maxDataPoints = 8;
        if (chart.data.labels.length > maxDataPoints) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
            chart.data.datasets[1].data.shift();
        }

        chart.update('none'); // 'none' for no animation
    }

    showDeviceDetail(deviceId) {
        // Find device info from either DB devices or serial connected devices
        const device = this.devices.find(d => d.device_id === deviceId) || 
                     this.connectedSerialPorts.find(p => p.deviceInfo?.device_id === deviceId)?.deviceInfo;
        
        if (!device) {
            console.error('Device not found for detail modal:', deviceId);
            return;
        }

        const data = this.deviceData[deviceId] || {}; // Get latest sensor data

        this.currentModalDeviceId = deviceId; // Set current device for modal

        // Populate device info in modal header
        document.getElementById('deviceDetailModalLabel').innerHTML = 
            `<i class="fas fa-microchip me-2"></i>${device.device_name || 'Device Detail'}`;
        
        document.getElementById('modal-device-id').textContent = deviceId;
        document.getElementById('modal-device-name').textContent = device.device_name || 'Unknown';
        document.getElementById('modal-device-location').textContent = device.location || 'Unknown';
        
        // Determine connection type for badge
        const isSerial = this.connectedSerialPorts.some(p => p.deviceInfo?.device_id === deviceId);
        const connectionBadge = document.getElementById('modal-connection-badge');
        if (isSerial) {
            connectionBadge.className = 'badge bg-info';
            connectionBadge.textContent = 'Serial Connection';
        } else {
            connectionBadge.className = `badge ${this.getDeviceStatusBadgeClass(data)}`;
            connectionBadge.textContent = this.getDeviceStatusText(data);
        }
        
        document.getElementById('modal-last-seen').textContent = 
            `Last seen: ${data.timestamp ? new Date(data.timestamp).toLocaleString('id-ID') : '-'}`;

        // Update sensor data and chart in modal
        this.updateModalSensorData(data);
        this.updateModalChart(deviceId);
        
        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('deviceDetailModal'));
        modal.show();
        
        // Reset currentModalDeviceId when modal is hidden
        const modalElement = document.getElementById('deviceDetailModal');
        modalElement.addEventListener('hidden.bs.modal', () => {
            this.currentModalDeviceId = null;
        }, { once: true });
    }

    updateModalSensorData(data) {
        // Update Distance
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

        // Update Soil Moisture
        const moistureElement = document.getElementById('modal-moisture-value');
        const moistureStatusElement = document.getElementById('modal-moisture-status');
        if (data.soil_moisture !== null && data.soil_moisture !== undefined) {
            moistureElement.textContent = `${data.soil_moisture}%`;
            moistureStatusElement.textContent = this.getMoistureStatus(data.soil_moisture);
            moistureStatusElement.className = `sensor-status ${this.getMoistureStatusClass(data.soil_moisture)}`;
        } else {
            moistureElement.textContent = '--%';
            moistureStatusElement.textContent = 'No data';
            moistureStatusElement.className = 'sensor-status text-muted';
        }

        // Update Temperature
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

        // Update Rain Percentage
        const rainElement = document.getElementById('modal-rain-value');
        const rainStatusElement = document.getElementById('modal-rain-status');
        if (data.rain_percentage !== null && data.rain_percentage !== undefined) {
            rainElement.textContent = `${data.rain_percentage}%`;
            rainStatusElement.textContent = this.getRainStatus(data.rain_percentage);
            rainStatusElement.className = `sensor-status ${this.getRainStatusClass(data.rain_percentage)}`;
        } else {
            rainElement.textContent = '--%';
            rainStatusElement.textContent = 'No data';
            rainStatusElement.className = 'sensor-status text-muted';
        }
    }

    updateModalChart(deviceId) {
        const deviceChart = this.deviceCharts[deviceId];
        if (!deviceChart) {
            // If mini chart for this device doesn't exist, create a dummy one for modal
            // or fetch historical data for the modal chart directly.
            // For now, we'll just clear the modal chart if no mini chart data.
            this.charts.modal.data.labels = [];
            this.charts.modal.data.datasets.forEach(dataset => dataset.data = []);
            this.charts.modal.update('none');
            return;
        }

        const modalChart = this.charts.modal;
        const currentData = this.deviceData[deviceId];

        // Copy labels and data from mini chart
        modalChart.data.labels = [...deviceChart.data.labels];
        modalChart.data.datasets[0].data = [...deviceChart.data.datasets[0].data]; // Moisture
        modalChart.data.datasets[1].data = [...deviceChart.data.datasets[1].data]; // Temperature

        // For distance and rain, we might not have historical data in mini chart,
        // so we'll just show the latest value at the last point.
        modalChart.data.datasets[2].data = modalChart.data.labels.map((label, index) => {
            if (index === modalChart.data.labels.length - 1 && currentData) {
                return currentData.distance !== undefined && currentData.distance !== null ? currentData.distance : 0;
            }
            return null; // Or 0, depending on how you want to display sparse data
        });

        modalChart.data.datasets[3].data = modalChart.data.labels.map((label, index) => {
            if (index === modalChart.data.labels.length - 1 && currentData) {
                return currentData.rain_percentage !== undefined && currentData.rain_percentage !== null ? currentData.rain_percentage : 0;
            }
            return null;
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

        // Distance Alert
        if (data.distance !== null && data.distance !== undefined) {
            if (data.distance < this.alertThresholds.distance.min) {
                alerts.push({
                    type: 'danger',
                    icon: 'fas fa-exclamation-triangle',
                    title: `${devicePrefix}Peringatan: Level Air Sangat Tinggi`,
                    message: `Jarak air hanya ${data.distance} cm. Segera periksa sistem drainase.`
                });
            } else if (data.distance > this.alertThresholds.distance.max) {
                alerts.push({
                    type: 'warning',
                    icon: 'fas fa-exclamation-triangle',
                    title: `${devicePrefix}Peringatan: Level Air Sangat Rendah`,
                    message: `Jarak air ${data.distance} cm. Perlu pengisian air.`
                });
            }
        }

        // Soil Moisture Alert
        if (data.soil_moisture !== null && data.soil_moisture !== undefined) {
            if (data.soil_moisture < this.alertThresholds.moisture.min) {
                alerts.push({
                    type: 'danger',
                    icon: 'fas fa-tint',
                    title: `${devicePrefix}Peringatan: Tanah Sangat Kering`,
                    message: `Kelembaban tanah hanya ${data.soil_moisture}%. Perlu irigasi segera.`
                });
            } else if (data.soil_moisture > this.alertThresholds.moisture.max) {
                alerts.push({
                    type: 'warning',
                    icon: 'fas fa-tint',
                    title: `${devicePrefix}Peringatan: Tanah Terlalu Basah`,
                    message: `Kelembaban tanah ${data.soil_moisture}%. Periksa drainase.`
                });
            }
        }

        // Temperature Alert
        if (data.temperature !== null && data.temperature !== undefined) {
            if (data.temperature > this.alertThresholds.temperature.max) {
                alerts.push({
                    type: 'danger',
                    icon: 'fas fa-thermometer-half',
                    title: `${devicePrefix}Peringatan: Suhu Udara Tinggi`,
                    message: `Suhu udara ${data.temperature}°C. Perhatikan kondisi tanaman.`
                });
            } else if (data.temperature < this.alertThresholds.temperature.min) {
                alerts.push({
                    type: 'warning',
                    icon: 'fas fa-thermometer-half',
                    title: `${devicePrefix}Peringatan: Suhu Udara Rendah`,
                    message: `Suhu udara ${data.temperature}°C. Perhatikan kondisi tanaman.`
                });
            }
        }

        // Rain Alert (e.g., if rain percentage is high)
        if (data.rain_percentage !== null && data.rain_percentage !== undefined) {
            if (data.rain_percentage > this.alertThresholds.rain.max) {
                alerts.push({
                    type: 'info', // Info, not necessarily warning/danger
                    icon: 'fas fa-cloud-rain',
                    title: `${devicePrefix}Informasi: Hujan Terdeteksi`,
                    message: `Curah hujan ${data.rain_percentage}%.`
                });
            }
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

    // Helper functions for status classification
    getDistanceStatus(distance) {
        if (distance === null || distance === undefined) return 'No Data';
        if (distance < 20) return 'Tinggi';
        if (distance < 50) return 'Sedang';
        return 'Rendah';
    }

    getDistanceStatusClass(distance) {
        if (distance === null || distance === undefined) return 'text-muted';
        if (distance < 20) return 'text-danger';
        if (distance < 50) return 'text-warning';
        return 'text-success';
    }

    getMoistureStatus(moisture) {
        if (moisture === null || moisture === undefined) return 'No Data';
        if (moisture < 30) return 'Kering';
        if (moisture < 70) return 'Normal';
        return 'Basah';
    }

    getMoistureStatusClass(moisture) {
        if (moisture === null || moisture === undefined) return 'text-muted';
        if (moisture < 30) return 'text-danger';
        if (moisture < 70) return 'text-success';
        return 'text-primary'; // For 'Basah'
    }

    getTemperatureStatus(temp) {
        if (temp === null || temp === undefined) return 'No Data';
        if (temp < 20) return 'Dingin';
        if (temp < 30) return 'Normal';
        return 'Panas';
    }

    getTemperatureStatusClass(temp) {
        if (temp === null || temp === undefined) return 'text-muted';
        if (temp < 20) return 'text-info';
        if (temp < 30) return 'text-success';
        return 'text-danger';
    }

    getRainStatus(rainPercentage) {
        if (rainPercentage === null || rainPercentage === undefined) return 'No Data';
        if (rainPercentage < 10) return 'Kering';
        if (rainPercentage < 50) return 'Gerimis';
        return 'Hujan';
    }

    getRainStatusClass(rainPercentage) {
        if (rainPercentage === null || rainPercentage === undefined) return 'text-muted';
        if (rainPercentage < 10) return 'text-success';
        if (rainPercentage < 50) return 'text-warning';
        return 'text-primary'; // For 'Hujan'
    }

    // Device online/offline status based on last_seen
    getDeviceStatusBadgeClass(data) {
        if (!data || !data.last_seen) { // Use last_seen from device_status table
            return 'bg-secondary'; // No data or never seen
        }

        const now = new Date();
        const lastSeen = new Date(data.last_seen);
        const timeDiff = (now - lastSeen) / 1000 / 60; // Difference in minutes

        if (timeDiff <= 5) return 'bg-success'; // Online (last seen within 5 minutes)
        if (timeDiff <= 30) return 'bg-warning'; // Warning (last seen within 30 minutes)
        return 'bg-danger'; // Offline (last seen more than 30 minutes ago)
    }

    getDeviceStatusText(data) {
        if (!data || !data.last_seen) {
            return 'No Data';
        }

        const now = new Date();
        const lastSeen = new Date(data.last_seen);
        const timeDiff = (now - lastSeen) / 1000 / 60;

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
        this.fetchLatestData(); // Initial fetch
        // Clear any existing interval to prevent multiple updates
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        this.updateTimer = setInterval(() => {
            this.fetchLatestData();
        }, this.updateInterval);
    }

    setupEventListeners() {
        // Add Device Form submission
        const addDeviceForm = document.getElementById('addDeviceForm');
        if (addDeviceForm) {
            addDeviceForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addDevice();
            });
        }

        // Edit Device Form submission
        const editDeviceForm = document.getElementById('editDeviceForm');
        if (editDeviceForm) {
            editDeviceForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.updateDevice();
            });
        }

        // Manage Device Tabs click listener to reset add device form
        const deviceManagementTabs = document.getElementById('deviceManagementTabs');
        if (deviceManagementTabs) {
            deviceManagementTabs.addEventListener('click', (e) => {
                if (e.target.id === 'add-device-tab') {
                    this.resetAddDeviceForm();
                } else if (e.target.id === 'device-list-tab') {
                    this.loadDeviceManagementList(); // Reload list when switching back
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
        this.resetManageDeviceModal(); // Reset modal state
        this.loadDeviceManagementList(); // Load device list
        const modal = new bootstrap.Modal(document.getElementById('manageDeviceModal'));
        modal.show();
    }

    resetManageDeviceModal() {
        // Ensure add device form is visible and success message is hidden
        document.getElementById('addDeviceForm').classList.remove('d-none');
        document.getElementById('addDeviceSuccess').classList.add('d-none');
        document.getElementById('addDeviceForm').reset(); // Clear form fields
        // Switch to device list tab by default
        const deviceListTabButton = document.getElementById('device-list-tab');
        if (deviceListTabButton) {
            const tab = new bootstrap.Tab(deviceListTabButton);
            tab.show();
        }
    }

    async loadDeviceManagementList() {
        try {
            const tbody = document.getElementById('deviceManagementList');
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Loading devices...</td></tr>';

            const response = await fetch(`${this.apiBaseUrl}get_devices.php`);
            const result = await response.json();

            if (result.success && result.data.length > 0) {
                tbody.innerHTML = result.data.map(device => `
                    <tr>
                        <td><code>${device.device_id}</code></td>
                        <td>${device.device_name || '-'}</td>
                        <td>${device.location || '-'}</td>
                        <td>
                            <span class="badge ${device.connection_status === 'online' ? 'bg-success' : (device.connection_status === 'warning' ? 'bg-warning text-dark' : 'bg-danger')}">
                                ${device.connection_status.charAt(0).toUpperCase() + device.connection_status.slice(1)}
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
        const deviceIdInput = document.getElementById('deviceId');
        const deviceNameInput = document.getElementById('deviceName');
        const deviceLocationInput = document.getElementById('deviceLocation');
        const deviceDescriptionInput = document.getElementById('deviceDescription');

        const deviceData = {
            device_id: deviceIdInput.value.trim(),
            device_name: deviceNameInput.value.trim(),
            location: deviceLocationInput.value.trim(),
            description: deviceDescriptionInput.value.trim()
        };

        if (!deviceData.device_id || !deviceData.device_name) {
            this.showAlert('Device ID dan Device Name harus diisi!', 'danger');
            return;
        }

        // Basic client-side validation for device_id pattern
        if (!/^[A-Za-z0-9_]+$/.test(deviceData.device_id)) {
            this.showAlert('Device ID hanya boleh mengandung huruf, angka, dan underscore.', 'danger');
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
                this.loadDeviceManagementList(); // Refresh list in modal
                this.loadDevices(); // Refresh cards on dashboard
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
                document.getElementById('editDeviceIdDisplay').value = device.device_id; // Display only
                document.getElementById('editDeviceName').value = device.device_name || '';
                document.getElementById('editDeviceLocation').value = device.location || '';
                document.getElementById('editDeviceDescription').value = device.description || '';

                const modal = new bootstrap.Modal(document.getElementById('editDeviceModal'));
                modal.show();
            } else {
                this.showAlert('Device not found for editing.', 'danger');
            }
        } catch (error) {
            console.error('Error loading device for edit:', error);
            this.showAlert('Error loading device data', 'danger');
        }
    }

    async updateDevice() {
        const deviceData = {
            device_id: document.getElementById('editDeviceId').value,
            device_name: document.getElementById('editDeviceName').value.trim(),
            location: document.getElementById('editDeviceLocation').value.trim(),
            description: document.getElementById('editDeviceDescription').value.trim()
        };

        if (!deviceData.device_name) {
            this.showAlert('Device Name harus diisi!', 'danger');
            return;
        }

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
                this.loadDeviceManagementList(); // Refresh list in modal
                this.loadDevices(); // Refresh cards on dashboard
            } else {
                this.showAlert('Error: ' + (result.message || 'Failed to update device'), 'danger');
            }
        } catch (error) {
            console.error('Error updating device:', error);
            this.showAlert('Error updating device', 'danger');
        }
    }

    confirmDeleteDevice(deviceId, deviceName) {
        if (confirm(`Apakah Anda yakin ingin menghapus device "${deviceName}" (${deviceId})?\n\nSemua data sensor untuk device ini akan ikut terhapus secara permanen!`)) {
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
                this.loadDeviceManagementList(); // Refresh list in modal
                this.loadDevices(); // Refresh cards on dashboard
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

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            const alert = wrapper.querySelector('.alert');
            if (alert) {
                bootstrap.Alert.getInstance(alert)?.close(); // Use Bootstrap's close method
                wrapper.remove(); // Remove the wrapper div after closing
            }
        }, 5000);
    }

    refreshData() {
        this.loadDevices(); // Reload device list and cards
        this.fetchLatestData(); // Fetch latest sensor data
        this.showAlert('Data dashboard diperbarui!', 'info');
    }

    showErrorInDeviceContainer(message) {
        const container = document.getElementById('devices-container');
        container.innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger text-center">
                    <i class="fas fa-exclamation-circle fs-2 mb-3"></i>
                    <h5>Error Loading Devices</h5>
                    <p>${message}</p>
                </div>
            </div>
        `;
    }

    showNoDataMessage() {
        const container = document.getElementById('alerts-container');
        container.innerHTML = `
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
    }

    // --- Serial Port Functionality ---
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
                id: `port_${Date.now()}`, // Unique ID for this connection
                deviceInfo: null // To store device_id, name, location from serial data
            };

            this.connectedSerialPorts.push(portInfo);
            this.serialConnected = true; // Mark overall serial status as connected
            this.updateConnectionStatus(true); // Update global connection status

            this.startSerialReadingForPort(portInfo);
            this.showAlert('Serial port connected. Waiting for device data...', 'info');

        } catch (error) {
            console.error('Error in addSerialPort:', error);
            if (error.name === 'NotFoundError') {
                // User cancelled port selection
                console.log('User cancelled serial port selection');
            } else {
                this.showSerialError(error.message);
            }
        }
    }

    async startSerialReadingForPort(portInfo) {
        if (!portInfo.port || !portInfo.port.readable) return;

        try {
            const readableStreamClosed = portInfo.port.readable.pipeTo(portInfo.decoder.writable);
            portInfo.reader = portInfo.decoder.readable.getReader();

            let buffer = '';

            while (portInfo.port.readable && this.connectedSerialPorts.includes(portInfo)) {
                const { value, done } = await portInfo.reader.read();
                if (done) break;

                buffer += value;
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.length > 0) {
                        // console.log(`Port ${portInfo.id} received:`, trimmedLine); // Debugging serial input
                        this.parseSerialData(trimmedLine, portInfo);
                    }
                }
            }
        } catch (error) {
            console.error(`Serial reading error for port ${portInfo.id}:`, error);
            this.disconnectSpecificPort(portInfo.id); // Disconnect on error
        } finally {
            if (portInfo.reader) {
                portInfo.reader.releaseLock();
            }
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
            if (portInfo.port && portInfo.port.opened) { // Check if port is still open
                await portInfo.port.close();
            }
            this.showAlert(`Serial port for ${portInfo.deviceInfo?.device_id || 'unknown device'} disconnected.`, 'info');
        } catch (error) {
            console.error('Error disconnecting specific port:', error);
            this.showAlert(`Error disconnecting serial port: ${error.message}`, 'danger');
        } finally {
            this.connectedSerialPorts.splice(portIndex, 1); // Remove from list
            this.createDeviceCards(); // Re-render cards to remove disconnected serial device
            this.updateConnectionStatus(this.connectedSerialPorts.length > 0); // Update global status
        }
    }

    parseSerialData(line, portInfo) {
        try {
            // Attempt to parse as JSON first (preferred format from ESP32)
            if (line.startsWith('{') && line.endsWith('}')) {
                const data = JSON.parse(line);
                
                // Extract device info from JSON payload
                if (data.device_id) {
                    portInfo.deviceInfo = {
                        device_id: data.device_id,
                        device_name: data.device_name || 'Serial Device',
                        location: data.device_location || 'Serial Port',
                        connection_status: 'online' // Always online if receiving data
                    };
                } else {
                    // Fallback if device_id is missing in JSON
                    portInfo.deviceInfo = {
                        device_id: `SERIAL_${portInfo.id}`,
                        device_name: 'Serial Device',
                        location: 'Serial Port',
                        connection_status: 'online'
                    };
                }

                const sensorData = {
                    device_id: portInfo.deviceInfo.device_id,
                    device_name: portInfo.deviceInfo.device_name,
                    device_location: portInfo.deviceInfo.location,
                    distance: data.distance !== undefined ? data.distance : null,
                    soil_moisture: data.soil_moisture !== undefined ? data.soil_moisture : null,
                    temperature: data.temperature !== undefined ? data.temperature : null,
                    rain_percentage: data.rain_percentage !== undefined ? data.rain_percentage : null,
                    wifi_signal: data.wifi_signal !== undefined ? data.wifi_signal : null,
                    free_heap: data.free_heap !== undefined ? data.free_heap : null,
                    firmware_version: data.firmware_version || '1.0.0',
                    timestamp: new Date().toISOString() // Use current time for serial data
                };
                this.updateDeviceData(sensorData);
                return;
            }

            // Fallback for plain text serial output (e.g., from Arduino Serial.print)
            // This part needs to be robust to handle partial lines or varied formats
            if (!portInfo.deviceInfo) {
                // Try to extract device ID/Name from initial lines
                const idMatch = line.match(/Device ID:\s*([A-Za-z0-9_]+)/);
                const nameMatch = line.match(/Device Name:\s*(.+)/);
                const locMatch = line.match(/Location:\s*(.+)/);

                if (idMatch || nameMatch || locMatch) {
                    portInfo.deviceInfo = portInfo.deviceInfo || {
                        device_id: `SERIAL_${portInfo.id}`,
                        device_name: 'Serial Device',
                        location: 'Serial Port',
                        connection_status: 'online'
                    };
                    if (idMatch) portInfo.deviceInfo.device_id = idMatch[1].trim();
                    if (nameMatch) portInfo.deviceInfo.device_name = nameMatch[1].trim();
                    if (locMatch) portInfo.deviceInfo.location = locMatch[1].trim();
                    this.createDeviceCards(); // Re-render cards if new device info found
                    return;
                }
            }

            // If device info is known, try to parse sensor data from text lines
            if (portInfo.deviceInfo) {
                const currentSensorData = this.deviceData[portInfo.deviceInfo.device_id] || {};
                let updated = false;

                const distanceMatch = line.match(/Distance:\s*(-?\d+)\s*cm/);
                if (distanceMatch) { currentSensorData.distance = parseInt(distanceMatch[1]); updated = true; }

                const moistureMatch = line.match(/Soil Moisture:\s*(\d+)%/);
                if (moistureMatch) { currentSensorData.soil_moisture = parseInt(moistureMatch[1]); updated = true; }

                const tempMatch = line.match(/Temperature:\s*(-?\d+\.?\d*)°C/);
                if (tempMatch) { currentSensorData.temperature = parseFloat(tempMatch[1]); updated = true; }

                const rainMatch = line.match(/Rain:\s*(\d+)%/);
                if (rainMatch) { currentSensorData.rain_percentage = parseInt(rainMatch[1]); updated = true; }

                const wifiMatch = line.match(/WiFi Signal:\s*(-?\d+)\s*dBm/);
                if (wifiMatch) { currentSensorData.wifi_signal = parseInt(wifiMatch[1]); updated = true; }

                const heapMatch = line.match(/Free Heap:\s*(\d+)\s*bytes/);
                if (heapMatch) { currentSensorData.free_heap = parseInt(heapMatch[1]); updated = true; }

                if (updated) {
                    currentSensorData.device_id = portInfo.deviceInfo.device_id;
                    currentSensorData.device_name = portInfo.deviceInfo.device_name;
                    currentSensorData.device_location = portInfo.deviceInfo.location;
                    currentSensorData.timestamp = new Date().toISOString();
                    this.updateDeviceData(currentSensorData);
                }
            }
        } catch (error) {
            console.error(`Error parsing serial line "${line}":`, error);
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
}

document.addEventListener('DOMContentLoaded', () => {
    window.iotDashboard = new IoTDashboard();
});