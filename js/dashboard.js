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

        this.init();
    }

    init() {
        this.refreshData();
        this.startAutoRefresh();
        this.setupEventListeners();
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

            // Fetch all registered devices first
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
            // This ensures all registered devices are displayed, even if they have no recent live data
            this.devices = registeredDevices.map(registeredDevice => {
                const liveInfo = liveSensorData.find(lsd => lsd.device_id === registeredDevice.device_id);
                return { ...registeredDevice, ...(liveInfo || {}) };
            });

            this.renderDeviceCards();
            this.updateAlerts();
            this.updateConnectionStatus(true);
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
                    label: 'Kelembaban Tanah',
                    data: dataPoints,
                    borderColor: '#198754',
                    backgroundColor: 'rgba(25, 135, 84, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0 // Hide points
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: false },
                    tooltip: { enabled: false } // Disable tooltips for mini chart
                },
                scales: {
                    x: { display: false },
                    y: { display: false, min: 0, max: 100 }
                },
                elements: {
                    line: { borderWidth: 1.5 }
                }
            }
        });
    }

    updateAlerts() {
        const alertsContainer = document.getElementById('alerts-container');
        alertsContainer.innerHTML = ''; // Clear existing alerts
        let hasAlerts = false;

        this.devices.forEach(device => {
            const alerts = [];
            if (!device.is_online) {
                alerts.push(`Device ${device.device_name} (${device.device_id}) is offline.`);
            } else { // Only check sensor alerts if device is online
                if (device.distance !== null && device.distance < 20) {
                    alerts.push(`Water level in ${device.device_name} (${device.location}) is critically high (${device.distance} cm).`);
                }
                if (device.soil_moisture !== null && device.soil_moisture < 30) {
                    alerts.push(`Soil in ${device.device_name} (${device.location}) is too dry (${device.soil_moisture}%).`);
                }
                if (device.temperature !== null && device.temperature > 35) {
                    alerts.push(`Temperature in ${device.device_name} (${device.location}) is high (${device.temperature.toFixed(1)}°C).`);
                }
                if (device.rain_percentage !== null && device.rain_percentage > 70) {
                    alerts.push(`Heavy rain detected at ${device.device_name} (${device.location}) (${device.rain_percentage}%).`);
                }
            }

            alerts.forEach(alertMsg => {
                hasAlerts = true;
                const alertDiv = document.createElement('div');
                alertDiv.className = 'alert alert-warning alert-dismissible fade show mb-2';
                alertDiv.role = 'alert';
                alertDiv.innerHTML = `
                    <i class="fas fa-bell me-2"></i>
                    ${alertMsg}
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                `;
                alertsContainer.appendChild(alertDiv);
            });
        });

        if (!hasAlerts) {
            alertsContainer.innerHTML = '<div class="text-muted text-center">Tidak ada alert saat ini</div>';
        }
    }

    async showDeviceDetail(deviceId) {
        const device = this.devices.find(d => d.device_id === deviceId);
        if (!device) {
            this.showToast('Error', 'Device not found.', 'danger');
            return;
        }

        this.currentDetailDeviceId = deviceId;
        this.updateDeviceDetailData(device);

        // Fetch historical data for the charts in the modal
        await this.loadAndRenderDetailCharts(deviceId, device.is_online);

        this.deviceDetailModal.show();
        
        // Start real-time updates for detail modal
        this.startDetailRealTimeUpdate();
    }

    updateDeviceDetailData(device) {
        // Populate modal with device data
        document.getElementById('modal-device-id').textContent = device.device_id;
        document.getElementById('modal-device-name').textContent = device.device_name;
        document.getElementById('modal-device-location').textContent = device.location || 'N/A';

        const connectionBadge = document.getElementById('modal-connection-badge');
        connectionBadge.textContent = device.is_online ? 'Online' : 'Offline';
        connectionBadge.className = `badge ${device.is_online ? 'bg-success' : 'bg-danger'}`;
        document.getElementById('modal-last-seen').textContent = device.last_seen ? `Last Seen: ${new Date(device.last_seen).toLocaleString()}` : 'Last Seen: N/A';

        // Update sensor data in modal directly from the 'device' object (which contains live data)
        if (!device.is_online) {
            document.getElementById('modal-distance-value').textContent = '-- cm';
            document.getElementById('modal-distance-status').textContent = 'Offline';
            document.getElementById('modal-moisture-value').textContent = '--%';
            document.getElementById('modal-moisture-status').textContent = 'Offline';
            document.getElementById('modal-temperature-value').textContent = '--°C';
            document.getElementById('modal-temperature-status').textContent = 'Offline';
            document.getElementById('modal-rain-value').textContent = '--%';
            document.getElementById('modal-rain-status').textContent = 'Offline';
        } else {
            document.getElementById('modal-distance-value').textContent = device.distance !== null ? `${device.distance} cm` : '-- cm';
            document.getElementById('modal-distance-status').textContent = device.distance_status || 'Unknown';
            document.getElementById('modal-moisture-value').textContent = device.soil_moisture !== null ? `${device.soil_moisture}%` : '--%';
            document.getElementById('modal-moisture-status').textContent = device.moisture_status || 'Unknown';
            document.getElementById('modal-temperature-value').textContent = device.temperature !== null ? `${device.temperature.toFixed(1)}°C` : '--°C';
            document.getElementById('modal-temperature-status').textContent = device.temperature_status || 'Unknown';
            document.getElementById('modal-rain-value').textContent = device.rain_percentage !== null ? `${device.rain_percentage}%` : '--%';
            document.getElementById('modal-rain-status').textContent = device.rain_status || 'Unknown';
        }
    }

    startDetailRealTimeUpdate() {
        // Stop any existing detail interval
        if (this.detailRefreshInterval) {
            clearInterval(this.detailRefreshInterval);
        }

        // Update detail modal every 3 seconds
        this.detailRefreshInterval = setInterval(async () => {
            if (this.currentDetailDeviceId) {
                try {
                    const response = await fetch(`${this.apiBaseUrl}live.php`);
                    const liveData = await response.json();
                    
                    if (liveData.success) {
                        const deviceLiveData = liveData.data.find(d => d.device_id === this.currentDetailDeviceId);
                        if (deviceLiveData) {
                            this.updateDeviceDetailData(deviceLiveData);
                        }
                    }
                } catch (error) {
                    console.error('Error updating detail data:', error);
                }
            }
        }, 3000);
    }

    stopDetailRealTimeUpdate() {
        if (this.detailRefreshInterval) {
            clearInterval(this.detailRefreshInterval);
            this.detailRefreshInterval = null;
        }
        this.currentDetailDeviceId = null;
    }

    async loadAndRenderDetailCharts(deviceId, isOnline) {
        // Destroy existing charts if they exist
        for (const chartKey in this.detailCharts) {
            if (this.detailCharts[chartKey]) {
                this.detailCharts[chartKey].destroy();
                this.detailCharts[chartKey] = null;
            }
        }

        if (!isOnline) {
            // If device is offline, initialize charts with empty data
            this.initializeEmptyCharts();
            this.showToast('Info', 'Device is offline. Historical data charts are empty.', 'info');
            return;
        }

        try {
            // Fetch all historical data for the specific device
            // Removed date filters to get all available history for the device
            const response = await fetch(`${this.apiBaseUrl}get_history.php?device_id=${deviceId}&limit=500`); // Fetch more data for charts
            const data = await response.json();

            if (data.success && data.data.length > 0) {
                const historyData = data.data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Sort ascending

                const labels = historyData.map(row => new Date(row.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
                
                // Render Distance Chart
                this.detailCharts.distance = new Chart(document.getElementById('modalChartDistance').getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Jarak Air (cm)',
                            data: historyData.map(row => row.distance),
                            borderColor: '#0dcaf0',
                            backgroundColor: 'rgba(13, 202, 240, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: this.getDetailChartOptions('Jarak Air (cm)', 'cm', 0, 100)
                });

                // Render Moisture Chart
                this.detailCharts.moisture = new Chart(document.getElementById('modalChartMoisture').getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Kelembaban Tanah (%)',
                            data: historyData.map(row => row.soil_moisture),
                            borderColor: '#198754',
                            backgroundColor: 'rgba(25, 135, 84, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: this.getDetailChartOptions('Kelembaban Tanah (%)', '%', 0, 100)
                });

                // Render Temperature Chart
                this.detailCharts.temperature = new Chart(document.getElementById('modalChartTemperature').getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Suhu Udara (°C)',
                            data: historyData.map(row => row.temperature),
                            borderColor: '#ffc107',
                            backgroundColor: 'rgba(255, 193, 7, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: this.getDetailChartOptions('Suhu Udara (°C)', '°C', 0, 50)
                });

                // Render Rain Chart
                this.detailCharts.rain = new Chart(document.getElementById('modalChartRain').getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Hujan (%)',
                            data: historyData.map(row => row.rain_percentage),
                            borderColor: '#6f42c1',
                            backgroundColor: 'rgba(111, 66, 193, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: this.getDetailChartOptions('Hujan (%)', '%', 0, 100)
                });

            } else {
                this.initializeEmptyCharts();
                this.showToast('Info', 'No historical data available for this device.', 'info'); // Changed message
            }
        } catch (error) {
            console.error('Error loading detail charts:', error);
            this.initializeEmptyCharts();
            this.showToast('Error', 'Failed to load historical data for charts.', 'danger');
        }
    }

    initializeEmptyCharts() {
        const emptyChartOptions = (titleText, unit) => ({
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: `${titleText} (No Data)`,
                    font: { size: 12, weight: 'bold' }
                },
                tooltip: { enabled: false }
            },
            scales: {
                x: { display: false },
                y: { display: false }
            }
        });

        this.detailCharts.distance = new Chart(document.getElementById('modalChartDistance').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ data: [] }] },
            options: emptyChartOptions('Jarak Air (cm)', 'cm')
        });
        this.detailCharts.moisture = new Chart(document.getElementById('modalChartMoisture').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ data: [] }] },
            options: emptyChartOptions('Kelembaban Tanah (%)', '%')
        });
        this.detailCharts.temperature = new Chart(document.getElementById('modalChartTemperature').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ data: [] }] },
            options: emptyChartOptions('Suhu Udara (°C)', '°C')
        });
        this.detailCharts.rain = new Chart(document.getElementById('modalChartRain').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ data: [] }] },
            options: emptyChartOptions('Hujan (%)', '%')
        });
    }

    getDetailChartOptions(titleText, unit, min, max) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: titleText,
                    font: { size: 12, weight: 'bold' }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y} ${unit}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: { display: true, text: 'Waktu' }
                },
                y: {
                    display: true,
                    title: { display: true, text: unit },
                    min: min,
                    max: max
                }
            }
        };
    }

    // --- Manage Device Functions ---
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
    }

    async loadDeviceManagementList() {
        const listBody = document.getElementById('deviceManagementList');
        listBody.innerHTML = `<tr><td colspan="5" class="text-center">Loading devices...</td></tr>`;
        try {
            const response = await fetch(`${this.apiBaseUrl}get_devices.php`);
            const data = await response.json();
            if (data.success) {
                if (data.data.length === 0) {
                    listBody.innerHTML = `<tr><td colspan="5" class="text-center">No devices registered.</td></tr>`;
                    return;
                }
                listBody.innerHTML = data.data.map(device => `
                    <tr>
                        <td>${device.device_id}</td>
                        <td>${device.device_name}</td>
                        <td>${device.location || 'N/A'}</td>
                        <td><span class="badge ${device.is_online ? 'bg-success' : 'bg-danger'}">${device.is_online ? 'Online' : 'Offline'}</span></td>
                        <td>
                            <button class="btn btn-sm btn-info me-2" onclick="window.iotDashboard.showEditDeviceModal('${device.device_id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="window.iotDashboard.deleteDevice('${device.device_id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `).join('');
            } else {
                this.showToast('Error', `Failed to load device list: ${data.message}`, 'danger');
                listBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error loading devices.</td></tr>`;
            }
        } catch (error) {
            console.error('Error loading device list:', error);
            this.showToast('Error', `Failed to load device list: ${error.message}`, 'danger');
            listBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error loading devices.</td></tr>`;
        }
    }

    async addDevice() {
        const deviceId = document.getElementById('deviceId').value.trim();
        const deviceName = document.getElementById('deviceName').value.trim();
        const deviceLocation = document.getElementById('deviceLocation').value.trim();
        const deviceDescription = document.getElementById('deviceDescription').value.trim();

        if (!deviceId || !deviceName) {
            this.showToast('Validation Error', 'Device ID and Device Name are required.', 'warning');
            return;
        }
        if (!/^[A-Za-z0-9_]+$/.test(deviceId)) {
            this.showToast('Validation Error', 'Device ID can only contain letters, numbers, and underscores.', 'warning');
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}add_device.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: deviceId,
                    device_name: deviceName,
                    location: deviceLocation,
                    description: deviceDescription
                })
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
        const espCode = document.getElementById('generatedEspCode').textContent;
        navigator.clipboard.writeText(espCode).then(() => {
            this.showToast('Copied!', 'ESP32 code copied to clipboard.', 'info');
        }).catch(err => {
            console.error('Failed to copy ESP32 code:', err);
            this.showToast('Error', 'Failed to copy code.', 'danger');
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

        this.editDeviceModal.show();
    }

    async updateDevice() {
        const deviceId = document.getElementById('editDeviceId').value;
        const deviceName = document.getElementById('editDeviceName').value.trim();
        const deviceLocation = document.getElementById('editDeviceLocation').value.trim();
        const deviceDescription = document.getElementById('editDeviceDescription').value.trim();

        if (!deviceName) {
            this.showToast('Validation Error', 'Device Name is required.', 'warning');
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}update_device.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: deviceId,
                    device_name: deviceName,
                    location: deviceLocation,
                    description: deviceDescription
                })
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

    // --- Utility Functions ---
    showToast(title, message, type = 'info') {
        const alertPlaceholder = document.getElementById('alertMessages');
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                <strong>${title}:</strong> ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        alertPlaceholder.append(wrapper);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            bootstrap.Alert.getInstance(wrapper.querySelector('.alert'))?.close();
        }, 5000);
    }

    setupEventListeners() {
        // Event listener for when the manage device modal is hidden
        document.getElementById('manageDeviceModal').addEventListener('hidden.bs.modal', () => {
            // Re-enable auto-refresh when modal is closed
            this.startAutoRefresh();
        });

        // Event listener for when the manage device modal is shown
        document.getElementById('manageDeviceModal').addEventListener('show.bs.modal', () => {
            // Stop auto-refresh when modal is open to prevent conflicts
            this.stopAutoRefresh();
        });

        // Event listener for when the device detail modal is hidden
        document.getElementById('deviceDetailModal').addEventListener('hidden.bs.modal', () => {
            this.stopDetailRealTimeUpdate();
        });

        // Event listener for when the add device tab is shown
        document.getElementById('add-device-tab').addEventListener('shown.bs.tab', () => {
            document.getElementById('addDeviceForm').classList.remove('d-none');
            document.getElementById('addDeviceSuccess').classList.add('d-none');
            document.getElementById('addDeviceForm').reset();
        });
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.iotDashboard = new IoTDashboard();
});