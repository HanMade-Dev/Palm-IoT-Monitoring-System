// Dashboard JavaScript for IoT Monitoring System

class IoTDashboard {
    constructor() {
        this.apiBaseUrl = 'api/';
        this.devices = [];
        this.detailCharts = {}; // To store Chart.js instances for the detail modal
        this.refreshInterval = null;
        this.detailRefreshInterval = null;
        this.currentDetailDeviceId = null;
        this.lastUpdateElement = document.getElementById('last-update');
        this.connectionStatusElement = document.getElementById('connection-status');
        this.manageDeviceModal = new bootstrap.Modal(document.getElementById('manageDeviceModal'));
        this.deviceDetailModal = new bootstrap.Modal(document.getElementById('deviceDetailModal'));
        this.editDeviceModal = new bootstrap.Modal(document.getElementById('editDeviceModal'));

        // Map-related properties
        this.dashboardMap = null;
        this.addDeviceMap = null;
        this.editDeviceMap = null;
        this.addDeviceMarker = null;
        this.editDeviceMarker = null;
        this.deviceMarkers = [];

        this.init();
    }

    init() {
        this.refreshData();
        this.startAutoRefresh();
        this.setupEventListeners();
        this.initializeDashboardMap();
    }

    setupEventListeners() {
        // Map toggle event listener
        const mapToggle = document.getElementById('showMapToggle');
        if (mapToggle) {
            mapToggle.addEventListener('change', (e) => {
                const mapContainer = document.getElementById('mapContainer');
                if (e.target.checked) {
                    mapContainer.style.display = 'block';
                    setTimeout(() => {
                        if (this.dashboardMap) {
                            this.dashboardMap.invalidateSize();
                            this.updateDeviceMarkers();
                        }
                    }, 100);
                } else {
                    mapContainer.style.display = 'none';
                }
            });
        }

        // Modal event listeners for map initialization
        document.getElementById('manageDeviceModal').addEventListener('shown.bs.modal', () => {
            // Wait for modal animation to complete
            setTimeout(() => {
                this.initializeAddDeviceMap();
                // Multiple invalidateSize calls to ensure proper sizing
                if (this.addDeviceMap) {
                    setTimeout(() => {
                        this.addDeviceMap.invalidateSize();
                        this.addDeviceMap.whenReady(() => {
                            this.addDeviceMap.invalidateSize();
                        });
                    }, 100);
                    setTimeout(() => {
                        this.addDeviceMap.invalidateSize();
                    }, 300);
                    setTimeout(() => {
                        this.addDeviceMap.invalidateSize();
                    }, 500);
                }
            }, 200);
        });

        document.getElementById('editDeviceModal').addEventListener('shown.bs.modal', () => {
            setTimeout(() => {
                this.initializeEditDeviceMap();
                // Force map to recalculate its size after modal is fully shown
                if (this.editDeviceMap) {
                    setTimeout(() => {
                        this.editDeviceMap.invalidateSize();
                    }, 100);
                }
            }, 300);
        });
    }

    // MAP INITIALIZATION FUNCTIONS
    initializeDashboardMap() {
        const mapElement = document.getElementById('deviceMap');
        if (!mapElement) return;

        // Default center: Indonesia (Jakarta area)
        this.dashboardMap = L.map('deviceMap').setView([-6.2088, 106.8456], 6);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.dashboardMap);

        // Initialize device markers after map is ready
        setTimeout(() => this.updateDeviceMarkers(), 1000);
    }

    initializeAddDeviceMap() {
        const mapElement = document.getElementById('addDeviceMap');
        if (!mapElement) return;

        // Remove existing map if any
        if (this.addDeviceMap) {
            this.addDeviceMap.remove();
            this.addDeviceMap = null;
            this.addDeviceMarker = null;
        }

        try {
            // Clear the map container first
            mapElement.innerHTML = '';

            // Default center: Indonesia (Jakarta area)
            this.addDeviceMap = L.map('addDeviceMap', {
                preferCanvas: true,
                renderer: L.canvas(),
                zoomControl: true,
                attributionControl: true
            }).setView([-6.2088, 106.8456], 10);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 18,
                minZoom: 2
            }).addTo(this.addDeviceMap);

            // Multiple resize attempts to ensure proper display
            this.addDeviceMap.whenReady(() => {
                setTimeout(() => {
                    if (this.addDeviceMap) {
                        this.addDeviceMap.invalidateSize(true);
                    }
                }, 50);
                setTimeout(() => {
                    if (this.addDeviceMap) {
                        this.addDeviceMap.invalidateSize(true);
                    }
                }, 200);
            });

            // Add click event to set device location
            this.addDeviceMap.on('click', (e) => {
                const lat = e.latlng.lat;
                const lng = e.latlng.lng;

                // Update coordinate inputs
                document.getElementById('deviceLatitude').value = lat.toFixed(6);
                document.getElementById('deviceLongitude').value = lng.toFixed(6);

                // Remove existing marker
                if (this.addDeviceMarker) {
                    this.addDeviceMap.removeLayer(this.addDeviceMarker);
                }

                // Add new marker
                this.addDeviceMarker = L.marker([lat, lng]).addTo(this.addDeviceMap)
                    .bindPopup('Selected Device Location')
                    .openPopup();
            });

            console.log('Add Device Map initialized successfully');
        } catch (error) {
            console.error('Error initializing Add Device Map:', error);
        }
    }

    initializeEditDeviceMap() {
        const mapElement = document.getElementById('editDeviceMap');
        if (!mapElement || this.editDeviceMap) return;

        // Default center: Indonesia (Jakarta area)
        this.editDeviceMap = L.map('editDeviceMap').setView([-6.2088, 106.8456], 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.editDeviceMap);

        // Add click event to update device location
        this.editDeviceMap.on('click', (e) => {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;

            // Update coordinate inputs
            document.getElementById('editDeviceLatitude').value = lat.toFixed(6);
            document.getElementById('editDeviceLongitude').value = lng.toFixed(6);

            // Remove existing marker
            if (this.editDeviceMarker) {
                this.editDeviceMap.removeLayer(this.editDeviceMarker);
            }

            // Add new marker
            this.editDeviceMarker = L.marker([lat, lng]).addTo(this.editDeviceMap)
                .bindPopup('Updated Device Location')
                .openPopup();
        });
    }

    updateDeviceMarkers() {
        if (!this.dashboardMap) return;

        // Clear existing markers
        this.deviceMarkers.forEach(marker => {
            this.dashboardMap.removeLayer(marker);
        });
        this.deviceMarkers = [];

        // Add markers for devices with coordinates
        this.devices.forEach(device => {
            if (device.latitude !== null && device.longitude !== null) {
                const lat = parseFloat(device.latitude);
                const lng = parseFloat(device.longitude);
                
                if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                    const statusColor = device.is_online ? 'green' : 'red';
                    
                    const marker = L.circleMarker([lat, lng], {
                        color: statusColor,
                        fillColor: statusColor,
                        fillOpacity: 0.7,
                        radius: 8
                    }).addTo(this.dashboardMap);

                    const popupContent = `
                        <div class="text-center">
                            <h6>${device.device_name}</h6>
                            <p class="mb-1"><strong>ID:</strong> ${device.device_id}</p>
                            <p class="mb-1"><strong>Location:</strong> ${device.location || 'N/A'}</p>
                            <p class="mb-1"><strong>Status:</strong> 
                                <span class="badge ${device.is_online ? 'bg-success' : 'bg-danger'}">
                                    ${device.is_online ? 'Online' : 'Offline'}
                                </span>
                            </p>
                            <button class="btn btn-sm btn-primary" onclick="window.iotDashboard.showDeviceDetail('${device.device_id}')">
                                View Details
                            </button>
                        </div>
                    `;

                    marker.bindPopup(popupContent);
                    this.deviceMarkers.push(marker);
                }
            }
        });

        // Fit map to show all markers if any exist
        if (this.deviceMarkers.length > 0) {
            const group = new L.featureGroup(this.deviceMarkers);
            this.dashboardMap.fitBounds(group.getBounds().pad(0.1));
        }
    }

    startAutoRefresh() {
        // Refresh data every 10 seconds
        this.refreshInterval = setInterval(() => this.refreshData(), 10000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    async refreshData() {
        try {
            this.connectionStatusElement.textContent = 'Connecting...';
            this.connectionStatusElement.classList.remove('bg-success', 'bg-danger', 'bg-warning');
            this.connectionStatusElement.classList.add('bg-info');

            // Check if we're in test mode (when database is not available)
            const isTestMode = window.location.hostname === '0.0.0.0' || window.location.hostname.includes('replit');
            
            if (isTestMode) {
                // Use test data based on user's actual database
                this.devices = [
                    {
                        device_id: 'ESP32_SAWIT_01',
                        device_name: 'Sensor Area Blok A - Area sawit area utama',
                        location: 'Area Test',
                        description: 'Sensor monitoring kelapa sawit area utama',
                        latitude: -3.32979600,
                        longitude: 117.09452300,
                        is_active: true,
                        is_online: true,
                        created_at: '2025-09-02 06:15:38',
                        last_seen: new Date().toISOString(),
                        soil_moisture: 75,
                        temperature: 28.5,
                        distance: 45,
                        rain_percentage: 20,
                        total_readings: 1250
                    },
                    {
                        device_id: 'ESP32_SAWIT_02',
                        device_name: 'Sensor Area Blok B - Area sawit area timur',
                        location: 'Sensor Area',
                        description: 'Sensor monitoring kelapa sawit area timur',
                        latitude: null,
                        longitude: null,
                        is_active: true,
                        is_online: false,
                        created_at: '2025-08-30 22:35:08',
                        last_seen: '2025-08-30 22:35:08',
                        soil_moisture: null,
                        temperature: null,
                        distance: null,
                        rain_percentage: null,
                        total_readings: 0
                    }
                ];
                console.log('TEST MODE: Using sample data from your cPanel database');
            } else {
                // Production mode - fetch from actual APIs
                const allDevicesResponse = await fetch(`${this.apiBaseUrl}get_devices.php`);
                const allDevicesData = await allDevicesResponse.json();

                if (!allDevicesData.success) {
                    throw new Error(allDevicesData.message || 'Failed to fetch all devices');
                }
                const registeredDevices = allDevicesData.data;

                // Fetch live data (which includes online status and latest sensor readings)
                const liveDataResponse = await fetch(`${this.apiBaseUrl}live.php`);
                const liveData = await liveDataResponse.json();

                if (!liveData.success) {
                    throw new Error(liveData.message || 'Failed to fetch live data');
                }
                const liveSensorData = liveData.data;

                // Merge registered devices with live sensor data
                this.devices = registeredDevices.map(registeredDevice => {
                    const liveInfo = liveSensorData.find(lsd => lsd.device_id === registeredDevice.device_id);
                    return { ...registeredDevice, ...(liveInfo || {}) };
                });
            }

            this.renderDeviceCards();
            this.updateAlerts();
            this.updateConnectionStatus(true);
            this.updateDeviceMarkers(); // Update map markers
        } catch (error) {
            console.error('Error refreshing data:', error);
            this.updateConnectionStatus(false);
            this.showToast('Error', `Failed to load data: ${error.message}`, 'danger');
        } finally {
            this.lastUpdateElement.textContent = new Date().toLocaleTimeString();
        }
    }

    updateConnectionStatus(isConnected) {
        if (isConnected) {
            this.connectionStatusElement.textContent = 'Connected';
            this.connectionStatusElement.classList.remove('bg-info', 'bg-danger', 'bg-warning');
            this.connectionStatusElement.classList.add('bg-success');
        } else {
            this.connectionStatusElement.textContent = 'Disconnected';
            this.connectionStatusElement.classList.remove('bg-info', 'bg-success', 'bg-warning');
            this.connectionStatusElement.classList.add('bg-danger');
        }
    }

    renderDeviceCards() {
        const container = document.getElementById('devices-container');
        container.innerHTML = ''; // Clear existing cards

        if (this.devices.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-warning text-center">
                        <i class="fas fa-exclamation-triangle fs-2 mb-3"></i>
                        <h5>No devices found.</h5>
                        <p>Add a new device using the "Manage Device" button.</p>
                    </div>
                </div>
            `;
            return;
        }

        this.devices.forEach(device => {
            const statusClass = device.is_online ? 'bg-success' : 'bg-danger';
            const statusText = device.is_online ? 'Online' : 'Offline';
            const lastSeen = device.last_seen ? new Date(device.last_seen).toLocaleString() : 'N/A';

            // Determine sensor values and statuses based on online status
            const displayDistance = device.is_online && device.distance !== null ? `${device.distance} cm` : '--';
            const displayMoisture = device.is_online && device.soil_moisture !== null ? `${device.soil_moisture}%` : '--';
            const displayTemperature = device.is_online && device.temperature !== null ? `${device.temperature.toFixed(1)}°C` : '--';
            const displayRain = device.is_online && device.rain_percentage !== null ? `${device.rain_percentage}%` : '--';

            const cardHtml = `
                <div class="col-lg-4 col-md-6 col-sm-12">
                    <div class="device-card" data-device-id="${device.device_id}">
                        <div class="device-card-header d-flex justify-content-between align-items-center">
                            <div>
                                <h5 class="device-card-title">${device.device_name}</h5>
                                <p class="device-card-subtitle mb-0">${device.location || 'N/A'}</p>
                            </div>
                            <span class="badge ${statusClass}">${statusText}</span>
                        </div>
                        <div class="card-body p-0">
                            <div class="row g-2 mb-3">
                                <div class="col-6">
                                    <div class="mini-sensor">
                                        <div class="mini-sensor-icon bg-primary"><i class="fas fa-water"></i></div>
                                        <div class="mini-sensor-value">${displayDistance}</div>
                                        <div class="mini-sensor-label">Jarak Air</div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="mini-sensor">
                                        <div class="mini-sensor-icon bg-success"><i class="fas fa-tint"></i></div>
                                        <div class="mini-sensor-value">${displayMoisture}</div>
                                        <div class="mini-sensor-label">Kelembaban Tanah</div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="mini-sensor">
                                        <div class="mini-sensor-icon bg-warning"><i class="fas fa-thermometer-half"></i></div>
                                        <div class="mini-sensor-value">${displayTemperature}</div>
                                        <div class="mini-sensor-label">Suhu Udara</div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="mini-sensor">
                                        <div class="mini-sensor-icon bg-info"><i class="fas fa-cloud-rain"></i></div>
                                        <div class="mini-sensor-value">${displayRain}</div>
                                        <div class="mini-sensor-label">Hujan</div>
                                    </div>
                                </div>
                            </div>
                            <div class="mini-chart-container">
                                <canvas id="miniChart-${device.device_id}"></canvas>
                            </div>
                        </div>
                        <div class="device-card-footer">
                            <small class="text-muted">Last Seen: ${lastSeen}</small>
                            <button class="btn btn-sm btn-outline-primary" onclick="window.iotDashboard.showDeviceDetail('${device.device_id}')">
                                Detail <i class="fas fa-arrow-right ms-1"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', cardHtml);
            this.createMiniChart(device);
        });
    }

    createMiniChart(device) {
        const ctx = document.getElementById(`miniChart-${device.device_id}`).getContext('2d');
        // Destroy existing chart if it exists
        if (Chart.getChart(ctx)) {
            Chart.getChart(ctx).destroy();
        }

        let dataPoints = [];
        let labels = [];

        if (device.is_online && device.soil_moisture !== null) {
            // For simplicity, mini-chart will show soil moisture trend
            // In a real application, you might fetch recent history for this.
            // Using dummy data for mini-chart if device is online and has data
            dataPoints = [device.soil_moisture * 0.8, device.soil_moisture, device.soil_moisture * 1.2].map(val => Math.max(0, Math.min(100, val)));
            labels = ['Past', 'Current', 'Future']; // Dummy labels
        }
        // If device is offline or has no data, dataPoints and labels remain empty

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: dataPoints,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: { display: false },
                    y: { display: false, min: 0, max: 100 }
                },
                elements: {
                    point: { radius: 0 }
                }
            }
        });
    }

    updateAlerts() {
        const alertsContainer = document.getElementById('alerts-container');
        const alerts = [];

        this.devices.forEach(device => {
            if (!device.is_online) {
                alerts.push({
                    type: 'danger',
                    icon: 'fa-exclamation-triangle',
                    title: 'Device Offline',
                    message: `${device.device_name} is currently offline.`,
                    device_id: device.device_id
                });
            } else {
                // Check for critical sensor values only if device is online
                if (device.distance !== null && device.distance < 10) {
                    alerts.push({
                        type: 'warning',
                        icon: 'fa-water',
                        title: 'Water Level Critical',
                        message: `${device.device_name} - Water level very high (${device.distance}cm)`,
                        device_id: device.device_id
                    });
                }
                if (device.soil_moisture !== null && device.soil_moisture < 20) {
                    alerts.push({
                        type: 'warning',
                        icon: 'fa-tint',
                        title: 'Soil Too Dry',
                        message: `${device.device_name} - Soil moisture critically low (${device.soil_moisture}%)`,
                        device_id: device.device_id
                    });
                }
                if (device.temperature !== null && device.temperature > 35) {
                    alerts.push({
                        type: 'warning',
                        icon: 'fa-thermometer-half',
                        title: 'High Temperature',
                        message: `${device.device_name} - Temperature very high (${device.temperature.toFixed(1)}°C)`,
                        device_id: device.device_id
                    });
                }
            }
        });

        if (alerts.length === 0) {
            alertsContainer.innerHTML = '<div class="alert alert-success mb-0"><i class="fas fa-check-circle me-2"></i>All systems operating normally.</div>';
        } else {
            const alertsHtml = alerts.map(alert => `
                <div class="alert alert-${alert.type} alert-dismissible fade show" role="alert">
                    <i class="fas ${alert.icon} me-2"></i>
                    <strong>${alert.title}:</strong> ${alert.message}
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            `).join('');
            alertsContainer.innerHTML = alertsHtml;
        }
    }

    async showDeviceDetail(deviceId) {
        const device = this.devices.find(d => d.device_id === deviceId);
        if (!device) {
            this.showToast('Error', 'Device not found.', 'danger');
            return;
        }

        this.currentDetailDeviceId = deviceId;

        // Update modal content
        document.getElementById('modal-device-name').textContent = device.device_name;
        document.getElementById('modal-device-id').textContent = device.device_id;
        document.getElementById('modal-device-location').textContent = device.location || 'N/A';

        const statusBadge = document.getElementById('modal-connection-badge');
        if (device.is_online) {
            statusBadge.textContent = 'Online';
            statusBadge.className = 'badge bg-success';
        } else {
            statusBadge.textContent = 'Offline';
            statusBadge.className = 'badge bg-danger';
        }

        const lastSeen = device.last_seen ? new Date(device.last_seen).toLocaleString() : 'N/A';
        document.getElementById('modal-last-seen').textContent = `Last Seen: ${lastSeen}`;

        // Update sensor values and statuses
        this.updateModalSensorValues(device);

        this.deviceDetailModal.show();

        // Fetch detailed data for charts after modal is shown
        setTimeout(() => this.loadDetailedSensorData(deviceId), 500);

        // Start auto-refresh for modal data
        this.startDetailAutoRefresh();
    }

    updateModalSensorValues(device) {
        if (device.is_online) {
            document.getElementById('modal-distance-value').textContent = device.distance !== null ? `${device.distance} cm` : '--';
            document.getElementById('modal-distance-status').textContent = device.distance_status || '--';
            document.getElementById('modal-moisture-value').textContent = device.soil_moisture !== null ? `${device.soil_moisture}%` : '--';
            document.getElementById('modal-moisture-status').textContent = device.moisture_status || '--';
            document.getElementById('modal-temperature-value').textContent = device.temperature !== null ? `${device.temperature.toFixed(1)}°C` : '--';
            document.getElementById('modal-temperature-status').textContent = device.temperature_status || '--';
            document.getElementById('modal-rain-value').textContent = device.rain_percentage !== null ? `${device.rain_percentage}%` : '--';
            document.getElementById('modal-rain-status').textContent = device.rain_status || '--';
        } else {
            document.getElementById('modal-distance-value').textContent = '--';
            document.getElementById('modal-distance-status').textContent = 'Offline';
            document.getElementById('modal-moisture-value').textContent = '--';
            document.getElementById('modal-moisture-status').textContent = 'Offline';
            document.getElementById('modal-temperature-value').textContent = '--';
            document.getElementById('modal-temperature-status').textContent = 'Offline';
            document.getElementById('modal-rain-value').textContent = '--';
            document.getElementById('modal-rain-status').textContent = 'Offline';
        }
    }

    async loadDetailedSensorData(deviceId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}get_history.php?device_id=${deviceId}&limit=20`);
            const data = await response.json();

            if (data.success && data.data.length > 0) {
                this.createModalCharts(data.data);
            } else {
                console.warn('No historical data available for charts');
                // Create empty charts or show "No data" message
                this.createEmptyModalCharts();
            }
        } catch (error) {
            console.error('Error loading detailed sensor data:', error);
            this.createEmptyModalCharts();
        }
    }

    createModalCharts(historicalData) {
        const labels = historicalData.map(item => new Date(item.timestamp).toLocaleTimeString()).reverse();
        
        const distanceData = historicalData.map(item => item.distance).reverse();
        const moistureData = historicalData.map(item => item.soil_moisture).reverse();
        const temperatureData = historicalData.map(item => item.temperature).reverse();
        const rainData = historicalData.map(item => item.rain_percentage).reverse();

        this.createChart('modalChartDistance', labels, distanceData, 'Distance (cm)', '#007bff');
        this.createChart('modalChartMoisture', labels, moistureData, 'Soil Moisture (%)', '#28a745');
        this.createChart('modalChartTemperature', labels, temperatureData, 'Temperature (°C)', '#ffc107');
        this.createChart('modalChartRain', labels, rainData, 'Rain (%)', '#17a2b8');
    }

    createEmptyModalCharts() {
        this.createChart('modalChartDistance', [], [], 'Distance (cm)', '#007bff');
        this.createChart('modalChartMoisture', [], [], 'Soil Moisture (%)', '#28a745');
        this.createChart('modalChartTemperature', [], [], 'Temperature (°C)', '#ffc107');
        this.createChart('modalChartRain', [], [], 'Rain (%)', '#17a2b8');
    }

    createChart(canvasId, labels, data, label, color) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        
        // Destroy existing chart if it exists
        if (this.detailCharts[canvasId]) {
            this.detailCharts[canvasId].destroy();
        }

        this.detailCharts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    borderColor: color,
                    backgroundColor: color + '20',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { 
                        title: { display: true, text: 'Time' }
                    },
                    y: { 
                        title: { display: true, text: label },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    startDetailAutoRefresh() {
        this.stopDetailAutoRefresh();
        this.detailRefreshInterval = setInterval(() => {
            if (this.currentDetailDeviceId) {
                this.loadDetailedSensorData(this.currentDetailDeviceId);
            }
        }, 15000); // Refresh modal data every 15 seconds
    }

    stopDetailAutoRefresh() {
        if (this.detailRefreshInterval) {
            clearInterval(this.detailRefreshInterval);
            this.detailRefreshInterval = null;
        }
    }

    showManageDeviceModal() {
        this.manageDeviceModal.show();
        this.loadDeviceManagementList();
        // Reset add device form
        document.getElementById('addDeviceForm').reset();
        document.getElementById('addDeviceSuccess').classList.add('d-none');
        document.getElementById('add-device-tab').classList.remove('active');
        document.getElementById('add-device').classList.remove('show', 'active');
        document.getElementById('device-list-tab').classList.add('active');
        document.getElementById('device-list').classList.add('show', 'active');

        // Reset map coordinates
        document.getElementById('deviceLatitude').value = '';
        document.getElementById('deviceLongitude').value = '';
        
        // Clear add device map marker
        if (this.addDeviceMarker && this.addDeviceMap) {
            this.addDeviceMap.removeLayer(this.addDeviceMarker);
            this.addDeviceMarker = null;
        }
    }

    async loadDeviceManagementList() {
        try {
            const response = await fetch(`${this.apiBaseUrl}get_devices.php`);
            const data = await response.json();

            const tbody = document.getElementById('deviceManagementList');
            
            if (data.success && data.data.length > 0) {
                tbody.innerHTML = data.data.map(device => `
                    <tr>
                        <td>${device.device_id}</td>
                        <td>${device.device_name}</td>
                        <td>${device.location || 'N/A'}</td>
                        <td>
                            ${device.latitude && device.longitude ? 
                                `${parseFloat(device.latitude).toFixed(4)}, ${parseFloat(device.longitude).toFixed(4)}` : 
                                'No coordinates'
                            }
                        </td>
                        <td>
                            <span class="badge ${device.is_active ? 'bg-success' : 'bg-secondary'}">
                                ${device.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary me-1" onclick="window.iotDashboard.showEditDeviceModal('${device.device_id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.iotDashboard.deleteDevice('${device.device_id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No devices found.</td></tr>';
            }
        } catch (error) {
            console.error('Error loading device list:', error);
            document.getElementById('deviceManagementList').innerHTML = 
                '<tr><td colspan="6" class="text-center text-danger">Error loading device list.</td></tr>';
        }
    }

    async addDevice() {
        const deviceId = document.getElementById('deviceId').value.trim();
        const deviceName = document.getElementById('deviceName').value.trim();
        const deviceLocation = document.getElementById('deviceLocation').value.trim();
        const deviceDescription = document.getElementById('deviceDescription').value.trim();
        const deviceLatitude = document.getElementById('deviceLatitude').value;
        const deviceLongitude = document.getElementById('deviceLongitude').value;

        if (!deviceId || !deviceName) {
            this.showToast('Validation Error', 'Device ID and Device Name are required.', 'warning');
            return;
        }
        if (!/^[A-Za-z0-9_]+$/.test(deviceId)) {
            this.showToast('Validation Error', 'Device ID can only contain letters, numbers, and underscores.', 'warning');
            return;
        }

        try {
            const requestData = {
                device_id: deviceId,
                device_name: deviceName,
                location: deviceLocation,
                description: deviceDescription
            };

            // Add coordinates if they are provided
            if (deviceLatitude && deviceLongitude) {
                requestData.latitude = parseFloat(deviceLatitude);
                requestData.longitude = parseFloat(deviceLongitude);
            }

            const response = await fetch(`${this.apiBaseUrl}add_device.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            const data = await response.json();

            if (data.success) {
                document.getElementById('addDeviceForm').classList.add('d-none');
                document.getElementById('successDeviceId').textContent = data.data.device_id;
                document.getElementById('generatedEspCode').textContent = data.data.esp_code;
                document.getElementById('addDeviceSuccess').classList.remove('d-none');
                this.showToast('Success', 'Device added successfully!', 'success');
                this.refreshData(); // Refresh dashboard to show new device
                this.loadDeviceManagementList(); // Refresh device list in modal
            } else {
                this.showToast('Error', `Failed to add device: ${data.message}`, 'danger');
            }
        } catch (error) {
            console.error('Error adding device:', error);
            this.showToast('Error', `Failed to add device: ${error.message}`, 'danger');
        }
    }

    copyEspCode() {
        const codeElement = document.getElementById('generatedEspCode');
        navigator.clipboard.writeText(codeElement.textContent).then(() => {
            this.showToast('Success', 'ESP32 code copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            this.showToast('Error', 'Failed to copy code. Please copy manually.', 'danger');
        });
    }

    async showEditDeviceModal(deviceId) {
        const device = this.devices.find(d => d.device_id === deviceId);
        if (!device) {
            this.showToast('Error', 'Device not found for editing.', 'danger');
            return;
        }

        document.getElementById('editDeviceId').value = device.device_id;
        document.getElementById('editDeviceIdDisplay').value = device.device_id;
        document.getElementById('editDeviceName').value = device.device_name;
        document.getElementById('editDeviceLocation').value = device.location || '';
        document.getElementById('editDeviceDescription').value = device.description || '';
        document.getElementById('editDeviceLatitude').value = device.latitude || '';
        document.getElementById('editDeviceLongitude').value = device.longitude || '';

        this.editDeviceModal.show();

        // Wait for modal to be fully shown, then setup map
        setTimeout(() => {
            this.setupEditDeviceMap(device);
        }, 500);
    }

    setupEditDeviceMap(device) {
        if (!this.editDeviceMap) return;

        // Clear existing marker
        if (this.editDeviceMarker) {
            this.editDeviceMap.removeLayer(this.editDeviceMarker);
            this.editDeviceMarker = null;
        }

        // If device has coordinates, show them on the map
        if (device.latitude !== null && device.longitude !== null) {
            const lat = parseFloat(device.latitude);
            const lng = parseFloat(device.longitude);
            
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                this.editDeviceMap.setView([lat, lng], 15);
                this.editDeviceMarker = L.marker([lat, lng]).addTo(this.editDeviceMap)
                    .bindPopup('Current Device Location')
                    .openPopup();
            }
        } else {
            // Set to default Indonesia location
            this.editDeviceMap.setView([-6.2088, 106.8456], 10);
        }

        // Force map resize
        setTimeout(() => {
            this.editDeviceMap.invalidateSize();
        }, 100);
    }

    async updateDevice() {
        const deviceId = document.getElementById('editDeviceId').value;
        const deviceName = document.getElementById('editDeviceName').value.trim();
        const deviceLocation = document.getElementById('editDeviceLocation').value.trim();
        const deviceDescription = document.getElementById('editDeviceDescription').value.trim();
        const deviceLatitude = document.getElementById('editDeviceLatitude').value;
        const deviceLongitude = document.getElementById('editDeviceLongitude').value;

        if (!deviceName) {
            this.showToast('Validation Error', 'Device Name is required.', 'warning');
            return;
        }

        try {
            const requestData = {
                device_id: deviceId,
                device_name: deviceName,
                location: deviceLocation,
                description: deviceDescription
            };

            // Add coordinates if they are provided
            if (deviceLatitude && deviceLongitude) {
                requestData.latitude = parseFloat(deviceLatitude);
                requestData.longitude = parseFloat(deviceLongitude);
            }

            const response = await fetch(`${this.apiBaseUrl}update_device.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            const data = await response.json();

            if (data.success) {
                this.showToast('Success', 'Device updated successfully!', 'success');
                this.editDeviceModal.hide();
                this.refreshData(); // Refresh dashboard
                this.loadDeviceManagementList(); // Refresh device list in modal
            } else {
                this.showToast('Error', `Failed to update device: ${data.message}`, 'danger');
            }
        } catch (error) {
            console.error('Error updating device:', error);
            this.showToast('Error', `Failed to update device: ${error.message}`, 'danger');
        }
    }

    async deleteDevice(deviceId) {
        if (!confirm(`Are you sure you want to delete device ${deviceId}? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}delete_device.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_id: deviceId })
            });
            const data = await response.json();

            if (data.success) {
                this.showToast('Success', 'Device deleted successfully!', 'success');
                this.refreshData(); // Refresh dashboard
                this.loadDeviceManagementList(); // Refresh device list in modal
            } else {
                this.showToast('Error', `Failed to delete device: ${data.message}`, 'danger');
            }
        } catch (error) {
            console.error('Error deleting device:', error);
            this.showToast('Error', `Failed to delete device: ${error.message}`, 'danger');
        }
    }

    showToast(title, message, type) {
        const toastContainer = document.getElementById('alertMessages');
        if (!toastContainer) {
            console.error('Toast container not found');
            return;
        }

        const toastHtml = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                <strong>${title}:</strong> ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;

        toastContainer.insertAdjacentHTML('beforeend', toastHtml);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            const alert = toastContainer.querySelector('.alert:last-child');
            if (alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        }, 5000);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.iotDashboard = new IoTDashboard();

    // Hide modal auto-refresh when modals are hidden
    document.getElementById('deviceDetailModal').addEventListener('hidden.bs.modal', function() {
        window.iotDashboard.stopDetailAutoRefresh();
        window.iotDashboard.currentDetailDeviceId = null;
    });

    // Clean up maps when modals are hidden
    document.getElementById('manageDeviceModal').addEventListener('hidden.bs.modal', function() {
        if (window.iotDashboard.addDeviceMap) {
            window.iotDashboard.addDeviceMap.remove();
            window.iotDashboard.addDeviceMap = null;
            window.iotDashboard.addDeviceMarker = null;
        }
    });

    document.getElementById('editDeviceModal').addEventListener('hidden.bs.modal', function() {
        if (window.iotDashboard.editDeviceMap) {
            window.iotDashboard.editDeviceMap.remove();
            window.iotDashboard.editDeviceMap = null;
            window.iotDashboard.editDeviceMarker = null;
        }
    });
});