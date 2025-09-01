// History JavaScript for IoT Monitoring System

class IoTHistory {
    constructor() {
        this.apiBaseUrl = 'api/';
        this.currentPage = 1;
        this.recordsPerPage = 50;
        this.totalRecords = 0;
        this.charts = {}; // Object to hold multiple chart instances
        this.devices = [];
        
        this.init();
    }

    init() {
        this.setupCharts(); // Setup all four charts
        this.setupDateDefaults(); // Set default date inputs
        this.loadDevices();
        this.loadHistoryData(); // Initial load without specific filters
        this.setupEventListeners();
        updateDateTimeInputs(); // Call once to set initial visibility
    }

    setupCharts() {
        // Chart for Distance
        this.charts.distance = new Chart(document.getElementById('chartDistance').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Jarak Air (cm)', data: [], borderColor: '#0dcaf0', backgroundColor: 'rgba(13, 202, 240, 0.1)', fill: true, tension: 0.4 }] },
            options: this.getChartOptions('Jarak Air (cm)', 'cm', 0, 100)
        });

        // Chart for Soil Moisture
        this.charts.moisture = new Chart(document.getElementById('chartMoisture').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Kelembaban Tanah (%)', data: [], borderColor: '#198754', backgroundColor: 'rgba(25, 135, 84, 0.1)', fill: true, tension: 0.4 }] },
            options: this.getChartOptions('Kelembaban Tanah (%)', '%', 0, 100)
        });

        // Chart for Temperature
        this.charts.temperature = new Chart(document.getElementById('chartTemperature').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Suhu Udara (°C)', data: [], borderColor: '#ffc107', backgroundColor: 'rgba(255, 193, 7, 0.1)', fill: true, tension: 0.4 }] },
            options: this.getChartOptions('Suhu Udara (°C)', '°C', 0, 50)
        });

        // Chart for Rain
        this.charts.rain = new Chart(document.getElementById('chartRain').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Hujan (%)', data: [], borderColor: '#6f42c1', backgroundColor: 'rgba(111, 66, 193, 0.1)', fill: true, tension: 0.4 }] },
            options: this.getChartOptions('Hujan (%)', '%', 0, 100)
        });
    }

    getChartOptions(titleText, unit, min, max) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: false }, // Hide legend as each chart is for one sensor
                title: {
                    display: true,
                    text: titleText,
                    font: { size: 14, weight: 'bold' }
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
                        text: `${titleText.split('(')[0].trim()} (${unit})`
                    },
                    min: min,
                    max: max
                }
            }
        };
    }

    setupDateDefaults() {
        // Set filter type to 'none' for default all data
        document.getElementById('filter-type').value = 'none'; 
        document.getElementById('start-date').value = ''; 
        document.getElementById('end-date').value = ''; 
        
        // Set default datetime for minute/hour filters to current time
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
            } else {
                console.error('Failed to load devices for history filter:', data.message);
            }
        } catch (error) {
            console.error('Error loading devices for history filter:', error);
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
                // sensor_type is no longer needed for chart visibility as charts are separate
            });
            
            // Add device filter
            if (deviceId !== 'all') {
                params.append('device_id', deviceId);
            }

            // Add date/time parameters based on filter type, ONLY if they have values
            if (filterType === 'range') {
                const startDate = document.getElementById('start-date').value;
                const endDate = document.getElementById('end-date').value;
                if (startDate) params.append('start_date', startDate);
                if (endDate) params.append('end_date', endDate);
                params.append('filter_type', filterType);
            } else if (filterType === 'day') {
                const selectedDate = document.getElementById('start-date').value; // Re-using start-date for single day
                if (selectedDate) params.append('target_date', selectedDate);
                params.append('filter_type', filterType);
            } else if (filterType === 'hour' || filterType === 'minute') {
                const datetimeValue = document.getElementById('datetime-input').value;
                if (datetimeValue) {
                    params.append('target_datetime', datetimeValue);
                    params.append('time_granularity', filterType);
                }
                params.append('filter_type', filterType);
            } else { // filterType === 'none' or default
                params.append('filter_type', 'none'); // Explicitly tell backend no date filter
            }

            const response = await fetch(`${this.apiBaseUrl}get_history.php?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.updateTable(data.data);
                this.updateAllCharts(data.data); // Update all four charts
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
            // Use device_name and location directly from row if available (from buffer)
            // Otherwise, find from this.devices (from DB)
            const deviceName = row.device_name || (this.devices.find(d => d.device_id === row.device_id)?.device_name || row.device_id);
            const location = row.location || (this.devices.find(d => d.device_id === row.device_id)?.location || '-');

            const datetime = new Date(row.timestamp).toLocaleString('id-ID');
            const distance = row.distance !== null ? `${row.distance} cm` : '-';
            const moisture = row.soil_moisture !== null ? `${row.soil_moisture}%` : '-';
            const temperature = row.temperature !== null ? `${parseFloat(row.temperature).toFixed(1)}°C` : '-';
            const rain = row.rain_percentage !== null ? `${row.rain_percentage}%` : '-';
            const status = this.getOverallStatus(row);
            
            return `
                <tr>
                    <td class="text-dark">${deviceName}</td>
                    <td class="text-dark">${datetime}</td>
                    <td class="text-dark">${distance}</td>
                    <td class="text-dark">${moisture}</td>
                    <td class="text-dark">${temperature}</td>
                    <td class="text-dark">${rain}</td>
                    <td><span class="badge ${status.class}">${status.text}</span></td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows;
    }

    updateAllCharts(data) {
        if (!data || data.length === 0) {
            Object.values(this.charts).forEach(chart => {
                chart.data.labels = [];
                chart.data.datasets.forEach(dataset => { dataset.data = []; });
                chart.update();
            });
            return;
        }

        // Sort data by timestamp ascending for chart
        const sortedData = [...data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Limit data points for better performance on chart
        const maxPoints = 200; // Max points to display on chart
        const step = Math.max(1, Math.floor(sortedData.length / maxPoints));
        const filteredData = sortedData.filter((_, index) => index % step === 0);

        const labels = filteredData.map(row => {
            const date = new Date(row.timestamp);
            return date.toLocaleDateString('id-ID') + ' ' + 
                   date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        });

        // Update Distance Chart
        this.charts.distance.data.labels = labels;
        this.charts.distance.data.datasets[0].data = filteredData.map(row => row.distance);
        this.charts.distance.update();

        // Update Moisture Chart
        this.charts.moisture.data.labels = labels;
        this.charts.moisture.data.datasets[0].data = filteredData.map(row => row.soil_moisture);
        this.charts.moisture.update();

        // Update Temperature Chart
        this.charts.temperature.data.labels = labels;
        this.charts.temperature.data.datasets[0].data = filteredData.map(row => row.temperature);
        this.charts.temperature.update();

        // Update Rain Chart
        this.charts.rain.data.labels = labels;
        this.charts.rain.data.datasets[0].data = filteredData.map(row => row.rain_percentage);
        this.charts.rain.update();
    }

    updateAnalytics(data) {
        if (!data || data.length === 0) {
            this.resetAnalytics();
            return;
        }

        // Extract valid data points, filtering out null/undefined
        const distances = data.map(row => row.distance).filter(val => val !== null && val !== undefined);
        const moistures = data.map(row => row.soil_moisture).filter(val => val !== null && val !== undefined);
        const temperatures = data.map(row => row.temperature).filter(val => val !== null && val !== undefined);
        const rains = data.map(row => row.rain_percentage).filter(val => val !== null && val !== undefined);

        // Helper to calculate min, avg, max
        const calculateStats = (arr) => {
            if (arr.length === 0) return { min: '--', avg: '--', max: '--' };
            const min = Math.min(...arr);
            const max = Math.max(...arr);
            const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
            return { min, avg, max };
        };

        // Analytics section is removed from history.html in this modification,
        // so this part of the code will not directly update elements.
        // Keeping it here for completeness if you decide to re-add an analytics summary.
        const distStats = calculateStats(distances);
        // document.getElementById('distance-min').textContent = distStats.min !== '--' ? `${distStats.min} cm` : '--';
        // document.getElementById('distance-max').textContent = distStats.max !== '--' ? `${distStats.max} cm` : '--';
        // document.getElementById('distance-avg').textContent = distStats.avg !== '--' ? `${distStats.avg.toFixed(1)} cm` : '--';

        const moistStats = calculateStats(moistures);
        // document.getElementById('moisture-min').textContent = moistStats.min !== '--' ? `${mo moistStats.min}%` : '--';
        // document.getElementById('moisture-max').textContent = moistStats.max !== '--' ? `${moistStats.max}%` : '--';
        // document.getElementById('moisture-avg').textContent = moistStats.avg !== '--' ? `${moistStats.avg.toFixed(1)}%` : '--';

        const tempStats = calculateStats(temperatures);
        // document.getElementById('temperature-min').textContent = tempStats.min !== '--' ? `${tempStats.min.toFixed(1)}°C` : '--';
        // document.getElementById('temperature-max').textContent = tempStats.max !== '--' ? `${tempStats.max.toFixed(1)}°C` : '--';
        // document.getElementById('temperature-avg').textContent = tempStats.avg !== '--' ? `${tempStats.avg.toFixed(1)}°C` : '--';

        const rainStats = calculateStats(rains);
        // document.getElementById('rain-min').textContent = rainStats.min !== '--' ? `${rainStats.min}%` : '--';
        // document.getElementById('rain-max').textContent = rainStats.max !== '--' ? `${rainStats.max}%` : '--';
        // document.getElementById('rain-avg').textContent = rainStats.avg !== '--' ? `${rainStats.avg.toFixed(1)}%` : '--';

        // General analytics
        // document.getElementById('total-data-points').textContent = data.length;
        
        // Device count
        // const uniqueDevices = [...new Set(data.map(row => row.device_id))];
        // document.getElementById('device-count').textContent = uniqueDevices.length;

        // Data period
        // if (data.length > 0) {
        //     const sortedByTime = [...data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        //     const firstDate = new Date(sortedByTime[0].timestamp);
        //     const lastDate = new Date(sortedByTime[sortedByTime.length - 1].timestamp);
        //     const period = `${firstDate.toLocaleDateString('id-ID')} - ${lastDate.toLocaleDateString('id-ID')}`;
        //     // document.getElementById('data-period').textContent = period;
        // } else {
        //     // document.getElementById('data-period').textContent = '--';
        // }

        // document.getElementById('data-status').textContent = 'Loaded';
    }

    resetAnalytics() {
        // This function is now mostly for placeholder as analytics section is removed
        // from history.html in this modification.
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
                    <a class="page-link" href="#" onclick="window.iotHistory.loadHistoryData(${pagination.current_page - 1})">
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
                    <a class="page-link" href="#" onclick="window.iotHistory.loadHistoryData(1)">1</a>
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
                    <a class="page-link" href="#" onclick="window.iotHistory.loadHistoryData(${i})">${i}</a>
                </li>
            `;
        }

        if (endPage < pagination.total_pages) {
            if (endPage < pagination.total_pages - 1) {
                paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="window.iotHistory.loadHistoryData(${pagination.total_pages})">
                        ${pagination.total_pages}
                    </a>
                </li>
            `;
        }

        // Next button
        if (pagination.current_page < pagination.total_pages) {
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="window.iotHistory.loadHistoryData(${pagination.current_page + 1})">
                        <i class="fas fa-chevron-right"></i>
                    </a>
                </li>
            `;
        }

        paginationContainer.innerHTML = paginationHtml;
    }

    getOverallStatus(row) {
        const alerts = [];
        
        // Check each sensor for alerts based on common thresholds
        if (row.distance !== null && row.distance < 20) alerts.push('water-high'); // Example: water too high
        if (row.soil_moisture !== null && row.soil_moisture < 30) alerts.push('dry-soil'); // Example: soil too dry
        if (row.temperature !== null && row.temperature > 35) alerts.push('hot'); // Example: temp too high
        if (row.rain_percentage !== null && row.rain_percentage > 50) alerts.push('rain'); // Example: raining heavily

        if (alerts.length === 0) {
            return { class: 'bg-success', text: 'Normal' };
        } else if (alerts.some(alert => ['water-high', 'hot'].includes(alert))) {
            return { class: 'bg-danger', text: 'Critical' };
        } else {
            return { class: 'bg-warning text-dark', text: 'Warning' };
        }
    }

    showLoading() {
        const tbody = document.getElementById('data-table-body');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div> Loading data...
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
        // window.history = this; // Changed to window.iotHistory to avoid conflict

        // Attach event listener to filter button
        document.querySelector('.btn-primary[onclick="applyFilter()"]').addEventListener('click', () => this.loadHistoryData(1));
    }
}

// Global functions for HTML onclick events
function applyFilter() {
    if (window.iotHistory) { // Changed from window.history
        window.iotHistory.loadHistoryData(1);
    }
}

function exportData() {
    const filterType = document.getElementById('filter-type').value;
    const deviceId = document.getElementById('device-select-history').value;
    
    const params = new URLSearchParams({
        export: 'csv',
    });
    
    // Add device filter
    if (deviceId !== 'all') {
        params.append('device_id', deviceId);
    }
    
    // Add date/time parameters based on filter type
    if (filterType === 'range') {
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        params.append('filter_type', filterType);
    } else if (filterType === 'day') {
        const selectedDate = document.getElementById('start-date').value;
        if (selectedDate) params.append('target_date', selectedDate);
        params.append('filter_type', filterType);
    } else if (filterType === 'hour' || filterType === 'minute') {
        const datetimeValue = document.getElementById('datetime-input').value;
        if (datetimeValue) {
            params.append('target_datetime', datetimeValue);
            params.append('time_granularity', filterType);
        }
        params.append('filter_type', filterType);
    } else { // filterType === 'none' or default
        params.append('filter_type', 'none');
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
        document.querySelector('#start-date-container label').textContent = 'Tanggal Mulai';
        document.querySelector('#end-date-container label').textContent = 'Tanggal Akhir';
    } else if (filterType === 'day') {
        startDateContainer.classList.remove('d-none');
        document.querySelector('#start-date-container label').textContent = 'Pilih Tanggal';
    } else if (filterType === 'hour') {
        datetimeContainer.classList.remove('d-none');
        document.querySelector('#datetime-container label').textContent = 'Pilih Jam (Data per Jam)';
    } else if (filterType === 'minute') {
        datetimeContainer.classList.remove('d-none');
        document.querySelector('#datetime-container label').textContent = 'Pilih Waktu (Data per Menit)';
    }
}

// Initialize history when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.iotHistory = new IoTHistory();
});