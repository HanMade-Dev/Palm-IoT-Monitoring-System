// History JavaScript for IoT Monitoring System

class IoTHistory {
    constructor() {
        this.apiBaseUrl = 'api/';
        this.currentPage = 1;
        this.recordsPerPage = 50;
        this.totalRecords = 0;
        this.chart = null;
        this.devices = [];
        
        this.init();
    }

    init() {
        this.setupChart();
        this.setupDateDefaults();
        this.loadDevices();
        this.loadHistoryData();
        this.setupEventListeners();
    }

    setupChart() {
        const ctx = document.getElementById('historyChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Jarak Air (cm)',
                    data: [],
                    borderColor: '#0dcaf0',
                    backgroundColor: 'rgba(13, 202, 240, 0.1)',
                    yAxisID: 'y',
                    hidden: false
                }, {
                    label: 'Kelembaban Tanah (%)',
                    data: [],
                    borderColor: '#198754',
                    backgroundColor: 'rgba(25, 135, 84, 0.1)',
                    yAxisID: 'y1',
                    hidden: false
                }, {
                    label: 'Suhu Udara (°C)',
                    data: [],
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    yAxisID: 'y2',
                    hidden: false
                }, {
                    label: 'Hujan (%)',
                    data: [],
                    borderColor: '#6f42c1',
                    backgroundColor: 'rgba(111, 66, 193, 0.1)',
                    yAxisID: 'y1',
                    hidden: false
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
                            text: 'Persentase (%)'
                        },
                        min: 0,
                        max: 100,
                        grid: {
                            drawOnChartArea: false,
                        },
                    },
                    y2: {
                        type: 'linear',
                        display: false,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Suhu (°C)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        onClick: (e, legendItem) => {
                            const index = legendItem.datasetIndex;
                            const chart = this.chart;
                            const meta = chart.getDatasetMeta(index);
                            
                            meta.hidden = meta.hidden === null ? !chart.data.datasets[index].hidden : null;
                            chart.update();
                        }
                    },
                    tooltip: {
                        callbacks: {
                            afterLabel: function(context) {
                                const datasetLabel = context.dataset.label;
                                if (datasetLabel.includes('Jarak')) return 'cm';
                                if (datasetLabel.includes('Suhu')) return '°C';
                                return '%';
                            }
                        }
                    }
                }
            }
        });
    }

    setupDateDefaults() {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        document.getElementById('start-date').value = yesterday.toISOString().split('T')[0];
        document.getElementById('end-date').value = today.toISOString().split('T')[0];
        
        // Set default datetime for minute/hour filters
        const now = new Date();
        const datetimeString = now.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:MM
        document.getElementById('datetime-input').value = datetimeString;
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
        const deviceSelect = document.getElementById('device-select-history');
        deviceSelect.innerHTML = '<option value="all">Semua Device</option>';
        
        this.devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.device_id;
            option.textContent = `${device.device_name} (${device.location})`;
            deviceSelect.appendChild(option);
        });
    }

    async loadHistoryData(page = 1) {
        try {
            this.showLoading();
            
            const filterType = document.getElementById('filter-type').value;
            const deviceId = document.getElementById('device-select-history').value;
            const params = new URLSearchParams({
                page: page,
                limit: this.recordsPerPage,
                sensor_type: document.getElementById('sensor-type').value,
                filter_type: filterType
            });
            
            // Add device filter
            if (deviceId !== 'all') {
                params.append('device_id', deviceId);
            }

            // Add date/time parameters based on filter type
            if (filterType === 'range') {
                params.append('start_date', document.getElementById('start-date').value);
                params.append('end_date', document.getElementById('end-date').value);
            } else if (filterType === 'day') {
                const selectedDate = document.getElementById('start-date').value;
                params.append('target_date', selectedDate);
            } else if (filterType === 'hour' || filterType === 'minute') {
                const datetimeValue = document.getElementById('datetime-input').value;
                if (datetimeValue) {
                    params.append('target_datetime', datetimeValue);
                    params.append('time_granularity', filterType);
                }
            }

            const response = await fetch(`${this.apiBaseUrl}get_history.php?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.updateTable(data.data);
                this.updateChart(data.chart_data || data.data);
                this.updateAnalytics(data.data);
                this.updatePagination(data.pagination);
                this.totalRecords = data.pagination.total;
                this.currentPage = page;
                
                document.getElementById('total-records').textContent = 
                    `${data.pagination.total} records`;
            } else {
                throw new Error(data.message || 'Failed to load history data');
            }
        } catch (error) {
            console.error('Error loading history data:', error);
            this.showError('Gagal memuat data historis. Silakan coba lagi.');
        }
    }

    updateTable(data) {
        const tbody = document.getElementById('data-table-body');
        
        if (!data || data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">
                        Tidak ada data untuk periode yang dipilih
                    </td>
                </tr>
            `;
            return;
        }

        const rows = data.map(row => {
            const deviceInfo = this.devices.find(d => d.device_id === row.device_id);
            const deviceName = deviceInfo ? deviceInfo.device_name : row.device_id;
            const datetime = new Date(row.timestamp).toLocaleString('id-ID');
            const distance = row.distance !== null ? `${row.distance} cm` : '-';
            const moisture = `${row.soil_moisture}%`;
            const temperature = row.temperature !== null ? `${parseFloat(row.temperature).toFixed(1)}°C` : '-';
            const rain = `${row.rain_percentage}%`;
            const status = this.getOverallStatus(row);
            
            return `
                <tr>
                    <td><small>${deviceName}</small></td>
                    <td>${datetime}</td>
                    <td>${distance}</td>
                    <td>${moisture}</td>
                    <td>${temperature}</td>
                    <td>${rain}</td>
                    <td><span class="badge ${status.class}">${status.text}</span></td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows;
    }

    updateChart(data) {
        if (!data || data.length === 0) {
            this.chart.data.labels = [];
            this.chart.data.datasets.forEach(dataset => {
                dataset.data = [];
            });
            this.chart.update();
            return;
        }

        // Limit data points for better performance
        const maxPoints = 100;
        const step = Math.max(1, Math.floor(data.length / maxPoints));
        const filteredData = data.filter((_, index) => index % step === 0);

        this.chart.data.labels = filteredData.map(row => {
            const date = new Date(row.timestamp);
            return date.toLocaleDateString('id-ID') + ' ' + 
                   date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        });

        this.chart.data.datasets[0].data = filteredData.map(row => row.distance || 0);
        this.chart.data.datasets[1].data = filteredData.map(row => row.soil_moisture);
        this.chart.data.datasets[2].data = filteredData.map(row => row.temperature || 0);
        this.chart.data.datasets[3].data = filteredData.map(row => row.rain_percentage);

        // Hide datasets based on sensor type filter
        const sensorType = document.getElementById('sensor-type').value;
        this.chart.data.datasets.forEach((dataset, index) => {
            const meta = this.chart.getDatasetMeta(index);
            if (sensorType === 'all') {
                meta.hidden = false;
            } else {
                const shouldShow = this.shouldShowDataset(index, sensorType);
                meta.hidden = !shouldShow;
            }
        });

        this.chart.update();
    }

    updateAnalytics(data) {
        if (!data || data.length === 0) {
            this.resetAnalytics();
            return;
        }

        // Extract valid data
        const distances = data.map(row => row.distance).filter(val => val !== null && val !== undefined);
        const moistures = data.map(row => row.soil_moisture).filter(val => val !== null && val !== undefined);
        const temperatures = data.map(row => row.temperature).filter(val => val !== null && val !== undefined);
        const rains = data.map(row => row.rain_percentage).filter(val => val !== null && val !== undefined);

        // Distance analytics
        if (distances.length > 0) {
            const distanceMin = Math.min(...distances);
            const distanceMax = Math.max(...distances);
            const distanceAvg = distances.reduce((a, b) => a + b, 0) / distances.length;

            document.getElementById('distance-min').textContent = `${distanceMin} cm`;
            document.getElementById('distance-max').textContent = `${distanceMax} cm`;
            document.getElementById('distance-avg').textContent = `${distanceAvg.toFixed(1)} cm`;
        } else {
            document.getElementById('distance-min').textContent = '--';
            document.getElementById('distance-max').textContent = '--';
            document.getElementById('distance-avg').textContent = '--';
        }

        // Moisture analytics
        if (moistures.length > 0) {
            const moistureMin = Math.min(...moistures);
            const moistureMax = Math.max(...moistures);
            const moistureAvg = moistures.reduce((a, b) => a + b, 0) / moistures.length;

            document.getElementById('moisture-min').textContent = `${moistureMin}%`;
            document.getElementById('moisture-max').textContent = `${moistureMax}%`;
            document.getElementById('moisture-avg').textContent = `${moistureAvg.toFixed(1)}%`;
        } else {
            document.getElementById('moisture-min').textContent = '--';
            document.getElementById('moisture-max').textContent = '--';
            document.getElementById('moisture-avg').textContent = '--';
        }

        // Temperature analytics
        if (temperatures.length > 0) {
            const tempMin = Math.min(...temperatures);
            const tempMax = Math.max(...temperatures);
            const tempAvg = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;

            document.getElementById('temperature-min').textContent = `${tempMin.toFixed(1)}°C`;
            document.getElementById('temperature-max').textContent = `${tempMax.toFixed(1)}°C`;
            document.getElementById('temperature-avg').textContent = `${tempAvg.toFixed(1)}°C`;
        } else {
            document.getElementById('temperature-min').textContent = '--';
            document.getElementById('temperature-max').textContent = '--';
            document.getElementById('temperature-avg').textContent = '--';
        }

        // Rain analytics
        if (rains.length > 0) {
            const rainMin = Math.min(...rains);
            const rainMax = Math.max(...rains);
            const rainAvg = rains.reduce((a, b) => a + b, 0) / rains.length;

            document.getElementById('rain-min').textContent = `${rainMin}%`;
            document.getElementById('rain-max').textContent = `${rainMax}%`;
            document.getElementById('rain-avg').textContent = `${rainAvg.toFixed(1)}%`;
        } else {
            document.getElementById('rain-min').textContent = '--';
            document.getElementById('rain-max').textContent = '--';
            document.getElementById('rain-avg').textContent = '--';
        }

        // General analytics
        document.getElementById('total-data-points').textContent = data.length;
        
        // Device count
        const uniqueDevices = [...new Set(data.map(row => row.device_id))];
        document.getElementById('device-count').textContent = uniqueDevices.length;

        // Data period
        if (data.length > 1) {
            const firstDate = new Date(data[0].timestamp);
            const lastDate = new Date(data[data.length - 1].timestamp);
            const period = `${firstDate.toLocaleDateString('id-ID')} - ${lastDate.toLocaleDateString('id-ID')}`;
            document.getElementById('data-period').textContent = period;
        } else if (data.length === 1) {
            const date = new Date(data[0].timestamp);
            document.getElementById('data-period').textContent = date.toLocaleDateString('id-ID');
        } else {
            document.getElementById('data-period').textContent = '--';
        }

        document.getElementById('data-status').textContent = 'Loaded';
    }

    resetAnalytics() {
        const analyticIds = [
            'distance-min', 'distance-max', 'distance-avg',
            'moisture-min', 'moisture-max', 'moisture-avg', 
            'temperature-min', 'temperature-max', 'temperature-avg',
            'rain-min', 'rain-max', 'rain-avg',
            'total-data-points', 'device-count', 'data-period'
        ];

        analyticIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '--';
            }
        });

        document.getElementById('data-status').textContent = 'No Data';
    }

    shouldShowDataset(index, sensorType) {
        switch (sensorType) {
            case 'distance': return index === 0;
            case 'moisture': return index === 1;
            case 'temperature': return index === 2;
            case 'rain': return index === 3;
            default: return true;
        }
    }

    updatePagination(pagination) {
        const paginationContainer = document.getElementById('pagination');
        
        if (pagination.total_pages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let paginationHtml = '';
        
        // Previous button
        if (pagination.current_page > 1) {
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="history.loadHistoryData(${pagination.current_page - 1})">
                        <i class="fas fa-chevron-left"></i>
                    </a>
                </li>
            `;
        }

        // Page numbers
        const startPage = Math.max(1, pagination.current_page - 2);
        const endPage = Math.min(pagination.total_pages, pagination.current_page + 2);

        if (startPage > 1) {
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="history.loadHistoryData(1)">1</a>
                </li>
            `;
            if (startPage > 2) {
                paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === pagination.current_page ? 'active' : '';
            paginationHtml += `
                <li class="page-item ${activeClass}">
                    <a class="page-link" href="#" onclick="history.loadHistoryData(${i})">${i}</a>
                </li>
            `;
        }

        if (endPage < pagination.total_pages) {
            if (endPage < pagination.total_pages - 1) {
                paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="history.loadHistoryData(${pagination.total_pages})">
                        ${pagination.total_pages}
                    </a>
                </li>
            `;
        }

        // Next button
        if (pagination.current_page < pagination.total_pages) {
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="history.loadHistoryData(${pagination.current_page + 1})">
                        <i class="fas fa-chevron-right"></i>
                    </a>
                </li>
            `;
        }

        paginationContainer.innerHTML = paginationHtml;
    }

    getOverallStatus(row) {
        const alerts = [];
        
        // Check each sensor for alerts
        if (row.distance !== null && row.distance < 20) alerts.push('water-high');
        if (row.soil_moisture < 30) alerts.push('dry-soil');
        if (row.temperature !== null && row.temperature > 35) alerts.push('hot');
        if (row.rain_percentage > 50) alerts.push('rain');

        if (alerts.length === 0) {
            return { class: 'bg-success', text: 'Normal' };
        } else if (alerts.some(alert => ['water-high', 'hot'].includes(alert))) {
            return { class: 'bg-danger', text: 'Critical' };
        } else {
            return { class: 'bg-warning', text: 'Warning' };
        }
    }

    showLoading() {
        const tbody = document.getElementById('data-table-body');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="loading me-2"></div> Loading data...
                </td>
            </tr>
        `;
    }

    showError(message) {
        const tbody = document.getElementById('data-table-body');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>${message}
                </td>
            </tr>
        `;
    }

    setupEventListeners() {
        // Make loadHistoryData available globally for pagination
        window.history = this;
    }
}

// Global functions for HTML onclick events
function applyFilter() {
    if (window.history) {
        window.history.loadHistoryData(1);
    }
}

function exportData() {
    const filterType = document.getElementById('filter-type').value;
    const sensorType = document.getElementById('sensor-type').value;
    const deviceId = document.getElementById('device-select-history').value;
    
    const params = new URLSearchParams({
        export: 'csv',
        sensor_type: sensorType,
        filter_type: filterType
    });
    
    // Add device filter
    if (deviceId !== 'all') {
        params.append('device_id', deviceId);
    }
    
    // Add date/time parameters based on filter type
    if (filterType === 'range') {
        params.append('start_date', document.getElementById('start-date').value);
        params.append('end_date', document.getElementById('end-date').value);
    } else if (filterType === 'day') {
        const selectedDate = document.getElementById('start-date').value;
        params.append('target_date', selectedDate);
    } else if (filterType === 'hour' || filterType === 'minute') {
        const datetimeValue = document.getElementById('datetime-input').value;
        if (datetimeValue) {
            params.append('target_datetime', datetimeValue);
            params.append('time_granularity', filterType);
        }
    }
    
    window.open(`api/get_history.php?${params}`, '_blank');
}

// Function to update date/time inputs based on filter type
function updateDateTimeInputs() {
    const filterType = document.getElementById('filter-type').value;
    const startDateContainer = document.getElementById('start-date-container');
    const endDateContainer = document.getElementById('end-date-container');
    const datetimeContainer = document.getElementById('datetime-container');
    
    // Hide all containers first
    startDateContainer.classList.add('d-none');
    endDateContainer.classList.add('d-none');
    datetimeContainer.classList.add('d-none');
    
    // Show appropriate containers based on filter type
    if (filterType === 'range') {
        startDateContainer.classList.remove('d-none');
        endDateContainer.classList.remove('d-none');
        document.querySelector('label[for="start-date"]').textContent = 'Tanggal Mulai';
        document.querySelector('label[for="end-date"]').textContent = 'Tanggal Akhir';
    } else if (filterType === 'day') {
        startDateContainer.classList.remove('d-none');
        document.querySelector('label[for="start-date"]').textContent = 'Pilih Tanggal';
    } else if (filterType === 'hour') {
        datetimeContainer.classList.remove('d-none');
        document.querySelector('label[for="datetime-input"]').textContent = 'Pilih Jam (Data per Jam)';
    } else if (filterType === 'minute') {
        datetimeContainer.classList.remove('d-none');
        document.querySelector('label[for="datetime-input"]').textContent = 'Pilih Waktu (Data per Menit)';
    }
}

// Initialize history when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new IoTHistory();
});
