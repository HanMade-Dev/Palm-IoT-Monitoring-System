
// History page JavaScript for IoT Monitoring System

let currentData = [];
let filteredData = [];
let charts = {};
let chartDetailModal;
let currentPage = 1;
let rowsPerPage = 50;
let sortColumn = '';
let sortDirection = '';

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    chartDetailModal = new bootstrap.Modal(document.getElementById('chartDetailModal'));
    loadDeviceOptions();
    setDefaultDates();
    loadHistoryData();
});

function setDefaultDates() {
    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    document.getElementById('endDate').value = today.toISOString().split('T')[0];
    document.getElementById('startDate').value = lastWeek.toISOString().split('T')[0];
}

async function loadDeviceOptions() {
    try {
        const response = await fetch('api/get_devices.php');
        const data = await response.json();
        
        if (data.success) {
            const deviceFilter = document.getElementById('deviceFilter');
            deviceFilter.innerHTML = '<option value="">All Devices</option>';
            
            data.data.forEach(device => {
                const option = document.createElement('option');
                option.value = device.device_id;
                option.textContent = `${device.device_name} (${device.device_id})`;
                deviceFilter.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading device options:', error);
    }
}

async function loadHistoryData() {
    try {
        // Show loading state
        document.getElementById('historyTableBody').innerHTML = '<tr><td colspan="7" class="text-center">Loading data...</td></tr>';
        document.getElementById('analytics-container').innerHTML = '<div class="col-12 text-center">Loading analytics...</div>';

        // Build query parameters
        const params = new URLSearchParams();
        const deviceId = document.getElementById('deviceFilter').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        
        if (deviceId) params.append('device_id', deviceId);
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        
        const response = await fetch(`api/get_history.php?${params.toString()}`);
        const data = await response.json();
        
        if (data.success) {
            currentData = data.data;
            applyFilters();
            renderAnalytics(currentData);
            renderCharts(currentData);
        } else {
            throw new Error(data.message || 'Failed to load history data');
        }
    } catch (error) {
        console.error('Error loading history data:', error);
        document.getElementById('historyTableBody').innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error: ${error.message}</td></tr>`;
        document.getElementById('analytics-container').innerHTML = `<div class="col-12"><div class="alert alert-danger">Error loading data: ${error.message}</div></div>`;
    }
}

function applyFilters() {
    const sensorFilter = document.getElementById('sensorFilter').value;
    rowsPerPage = parseInt(document.getElementById('rowsPerPage').value);
    
    if (!sensorFilter) {
        filteredData = [...currentData];
    } else {
        filteredData = currentData.filter(row => {
            switch(sensorFilter) {
                case 'distance': return row.distance !== null;
                case 'moisture': return row.soil_moisture !== null;
                case 'temperature': return row.temperature !== null;
                case 'rain': return row.rain_percentage !== null;
                default: return true;
            }
        });
    }
    
    // Apply sorting if any
    if (sortColumn && sortDirection) {
        applySorting();
    }
    
    currentPage = 1;
    renderHistoryTable();
}

function sortTable(column) {
    // Reset other headers
    document.querySelectorAll('.sortable-header').forEach(header => {
        if (header.dataset.column !== column) {
            header.classList.remove('sort-asc', 'sort-desc', 'sort-default');
            header.querySelector('.sort-icon').className = 'fas fa-sort sort-icon';
        }
    });

    const header = document.querySelector(`[data-column="${column}"]`);
    const icon = header.querySelector('.sort-icon');
    
    if (sortColumn === column) {
        // Cycle through: default -> asc -> desc -> default
        if (sortDirection === '') {
            // Default to ascending
            sortDirection = 'asc';
            header.classList.remove('sort-default', 'sort-desc');
            header.classList.add('sort-asc');
            icon.className = 'fas fa-sort-up sort-icon';
        } else if (sortDirection === 'asc') {
            // Ascending to descending
            sortDirection = 'desc';
            header.classList.remove('sort-asc', 'sort-default');
            header.classList.add('sort-desc');
            icon.className = 'fas fa-sort-down sort-icon';
        } else {
            // Descending back to default (no sort)
            sortDirection = '';
            sortColumn = '';
            header.classList.remove('sort-asc', 'sort-desc');
            header.classList.add('sort-default');
            icon.className = 'fas fa-sort sort-icon';
            
            // Reset to original data order without sorting
            filteredData = [...currentData];
            const sensorFilter = document.getElementById('sensorFilter').value;
            if (sensorFilter) {
                filteredData = currentData.filter(row => {
                    switch(sensorFilter) {
                        case 'distance': return row.distance !== null;
                        case 'moisture': return row.soil_moisture !== null;
                        case 'temperature': return row.temperature !== null;
                        case 'rain': return row.rain_percentage !== null;
                        default: return true;
                    }
                });
            }
            currentPage = 1;
            renderHistoryTable();
            return;
        }
    } else {
        // New column - start with ascending
        sortColumn = column;
        sortDirection = 'asc';
        header.classList.remove('sort-default', 'sort-desc');
        header.classList.add('sort-asc');
        icon.className = 'fas fa-sort-up sort-icon';
    }
    
    applySorting();
    currentPage = 1;
    renderHistoryTable();
}

function applySorting() {
    filteredData.sort((a, b) => {
        let valueA, valueB;
        
        switch(sortColumn) {
            case 'timestamp':
                valueA = new Date(a.timestamp);
                valueB = new Date(b.timestamp);
                break;
            case 'device':
                valueA = (a.device_name || a.device_id).toLowerCase();
                valueB = (b.device_name || b.device_id).toLowerCase();
                break;
            case 'location':
                valueA = (a.location || '').toLowerCase();
                valueB = (b.location || '').toLowerCase();
                break;
            case 'distance':
                valueA = parseFloat(a.distance) || 0;
                valueB = parseFloat(b.distance) || 0;
                break;
            case 'moisture':
                valueA = parseFloat(a.soil_moisture) || 0;
                valueB = parseFloat(b.soil_moisture) || 0;
                break;
            case 'temperature':
                valueA = parseFloat(a.temperature) || 0;
                valueB = parseFloat(b.temperature) || 0;
                break;
            case 'rain':
                valueA = parseFloat(a.rain_percentage) || 0;
                valueB = parseFloat(b.rain_percentage) || 0;
                break;
            default:
                return 0;
        }
        
        if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
        if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

function renderAnalytics(data) {
    const container = document.getElementById('analytics-container');
    
    if (data.length === 0) {
        container.innerHTML = '<div class="col-12"><div class="alert alert-warning text-center">No data available for the selected filters.</div></div>';
        return;
    }

    // Calculate analytics
    const analytics = calculateAnalytics(data);
    
    container.innerHTML = `
        <div class="col-lg-3 col-md-6 mb-3">
            <div class="analytics-card card-primary">
                <div class="analytics-header">
                    <i class="fas fa-water text-primary"></i>
                    Jarak Air
                </div>
                <div class="analytics-item">
                    <div class="analytics-label">Average</div>
                    <div class="analytics-value text-primary">${analytics.avgDistance} cm</div>
                </div>
                <div class="analytics-item">
                    <div class="analytics-label">Min / Max</div>
                    <div class="analytics-value text-primary">${analytics.minDistance} cm / ${analytics.maxDistance} cm</div>
                </div>
            </div>
        </div>
        <div class="col-lg-3 col-md-6 mb-3">
            <div class="analytics-card card-success">
                <div class="analytics-header">
                    <i class="fas fa-tint text-success"></i>
                    Soil Moisture
                </div>
                <div class="analytics-item">
                    <div class="analytics-label">Average</div>
                    <div class="analytics-value text-success">${analytics.avgMoisture}%</div>
                </div>
                <div class="analytics-item">
                    <div class="analytics-label">Min / Max</div>
                    <div class="analytics-value text-success">${analytics.minMoisture}% / ${analytics.maxMoisture}%</div>
                </div>
            </div>
        </div>
        <div class="col-lg-3 col-md-6 mb-3">
            <div class="analytics-card card-warning">
                <div class="analytics-header">
                    <i class="fas fa-thermometer-half text-warning"></i>
                    Temperature
                </div>
                <div class="analytics-item">
                    <div class="analytics-label">Average</div>
                    <div class="analytics-value text-warning">${analytics.avgTemperature}°C</div>
                </div>
                <div class="analytics-item">
                    <div class="analytics-label">Min / Max</div>
                    <div class="analytics-value text-warning">${analytics.minTemperature}°C / ${analytics.maxTemperature}°C</div>
                </div>
            </div>
        </div>
        <div class="col-lg-3 col-md-6 mb-3">
            <div class="analytics-card card-info">
                <div class="analytics-header">
                    <i class="fas fa-cloud-rain text-info"></i>
                    Rain Data
                </div>
                <div class="analytics-item">
                    <div class="analytics-label">Average</div>
                    <div class="analytics-value text-info">${analytics.avgRain}%</div>
                </div>
                <div class="analytics-item">
                    <div class="analytics-label">Max Detected</div>
                    <div class="analytics-value text-info">${analytics.maxRain}%</div>
                </div>
            </div>
        </div>
    `;
}

function calculateAnalytics(data) {
    if (data.length === 0) {
        return {
            totalRecords: 0,
            avgDistance: 0,
            minDistance: 0,
            maxDistance: 0,
            avgMoisture: 0,
            minMoisture: 0,
            maxMoisture: 0,
            avgTemperature: 0,
            minTemperature: 0,
            maxTemperature: 0,
            avgRain: 0,
            maxRain: 0
        };
    }

    const distanceValues = data.map(d => parseFloat(d.distance)).filter(v => !isNaN(v));
    const moistureValues = data.map(d => parseFloat(d.soil_moisture)).filter(v => !isNaN(v));
    const temperatureValues = data.map(d => parseFloat(d.temperature)).filter(v => !isNaN(v));
    const rainValues = data.map(d => parseFloat(d.rain_percentage)).filter(v => !isNaN(v));

    return {
        totalRecords: data.length,
        avgDistance: distanceValues.length > 0 ? (distanceValues.reduce((a, b) => a + b, 0) / distanceValues.length).toFixed(1) : 0,
        minDistance: distanceValues.length > 0 ? Math.min(...distanceValues).toFixed(1) : 0,
        maxDistance: distanceValues.length > 0 ? Math.max(...distanceValues).toFixed(1) : 0,
        avgMoisture: moistureValues.length > 0 ? (moistureValues.reduce((a, b) => a + b, 0) / moistureValues.length).toFixed(1) : 0,
        minMoisture: moistureValues.length > 0 ? Math.min(...moistureValues).toFixed(1) : 0,
        maxMoisture: moistureValues.length > 0 ? Math.max(...moistureValues).toFixed(1) : 0,
        avgTemperature: temperatureValues.length > 0 ? (temperatureValues.reduce((a, b) => a + b, 0) / temperatureValues.length).toFixed(1) : 0,
        minTemperature: temperatureValues.length > 0 ? Math.min(...temperatureValues).toFixed(1) : 0,
        maxTemperature: temperatureValues.length > 0 ? Math.max(...temperatureValues).toFixed(1) : 0,
        avgRain: rainValues.length > 0 ? (rainValues.reduce((a, b) => a + b, 0) / rainValues.length).toFixed(1) : 0,
        maxRain: rainValues.length > 0 ? Math.max(...rainValues).toFixed(1) : 0
    };
}

function renderHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    const pagination = document.getElementById('pagination');
    const totalRecordsCount = document.getElementById('totalRecordsCount');
    
    // Update total records count
    totalRecordsCount.textContent = `${filteredData.length} records`;
    
    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No data available</td></tr>';
        pagination.innerHTML = '';
        return;
    }

    // Calculate pagination
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);

    // Render table rows
    tbody.innerHTML = pageData.map(row => `
        <tr>
            <td>${new Date(row.timestamp).toLocaleString('id-ID')}</td>
            <td>${row.device_name || row.device_id}</td>
            <td>${row.location || 'N/A'}</td>
            <td>${row.distance !== null ? row.distance + ' cm' : 'N/A'}</td>
            <td>${row.soil_moisture !== null ? row.soil_moisture + '%' : 'N/A'}</td>
            <td>${row.temperature !== null ? parseFloat(row.temperature).toFixed(1) + '°C' : 'N/A'}</td>
            <td>${row.rain_percentage !== null ? row.rain_percentage + '%' : 'N/A'}</td>
        </tr>
    `).join('');

    // Render pagination
    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let paginationHtml = '';
    
    // Previous button
    if (currentPage > 1) {
        paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage - 1})">&laquo;</a></li>`;
    }
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(1)">1</a></li>`;
        if (startPage > 2) {
            paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? 'active' : '';
        paginationHtml += `<li class="page-item ${activeClass}"><a class="page-link" href="#" onclick="changePage(${i})">${i}</a></li>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${totalPages})">${totalPages}</a></li>`;
    }
    
    // Next button
    if (currentPage < totalPages) {
        paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage + 1})">&raquo;</a></li>`;
    }
    
    pagination.innerHTML = paginationHtml;
}

function changePage(page) {
    currentPage = page;
    renderHistoryTable();
}

// Event listeners for filters
document.getElementById('sensorFilter').addEventListener('change', applyFilters);
document.getElementById('rowsPerPage').addEventListener('change', applyFilters);

function renderCharts(data) {
    if (data.length === 0) return;

    // Prepare data for charts
    const labels = data.map(row => new Date(row.timestamp).toLocaleTimeString('id-ID', { 
        hour: '2-digit', 
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit' 
    }));

    // Destroy existing charts
    Object.values(charts).forEach(chart => {
        if (chart) chart.destroy();
    });

    // Distance Chart
    charts.distance = new Chart(document.getElementById('distanceChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Jarak Air (cm)',
                data: data.map(row => row.distance),
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: getChartOptions('Jarak Air', 'cm')
    });

    // Moisture Chart
    charts.moisture = new Chart(document.getElementById('moistureChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kelembaban Tanah (%)',
                data: data.map(row => row.soil_moisture),
                borderColor: '#198754',
                backgroundColor: 'rgba(25, 135, 84, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: getChartOptions('Kelembaban Tanah', '%', 0, 100)
    });

    // Temperature Chart
    charts.temperature = new Chart(document.getElementById('temperatureChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Suhu Udara (°C)',
                data: data.map(row => row.temperature),
                borderColor: '#ffc107',
                backgroundColor: 'rgba(255, 193, 7, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: getChartOptions('Suhu Udara', '°C')
    });

    // Rain Chart
    charts.rain = new Chart(document.getElementById('rainChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Curah Hujan (%)',
                data: data.map(row => row.rain_percentage),
                borderColor: '#0dcaf0',
                backgroundColor: 'rgba(13, 202, 240, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: getChartOptions('Curah Hujan', '%', 0, 100)
    });
}

function getChartOptions(title, unit, min = null, max = null) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            title: {
                display: false
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
                display: true,
                title: {
                    display: true,
                    text: unit
                },
                min: min,
                max: max
            }
        },
        interaction: {
            intersect: false,
            mode: 'index'
        }
    };
}

function showChartPopup(chartType) {
    if (!charts[chartType]) return;

    const chartTitles = {
        distance: 'Jarak Air (cm)',
        moisture: 'Kelembaban Tanah (%)',
        temperature: 'Suhu Udara (°C)',
        rain: 'Curah Hujan (%)'
    };

    const chartIcons = {
        distance: 'fas fa-water text-primary',
        moisture: 'fas fa-tint text-success',
        temperature: 'fas fa-thermometer-half text-warning',
        rain: 'fas fa-cloud-rain text-info'
    };

    const chartColors = {
        distance: '#0d6efd',
        moisture: '#198754',
        temperature: '#ffc107',
        rain: '#0dcaf0'
    };

    // Update modal title and icon
    document.getElementById('chartModalTitle').innerHTML = `<i class="${chartIcons[chartType]}"></i> ${chartTitles[chartType]}`;
    document.getElementById('chartModalIcon').className = chartIcons[chartType];

    // Get chart data from the existing chart
    const originalChart = charts[chartType];
    const chartData = originalChart.data;

    // Show modal
    chartDetailModal.show();

    // Wait for modal to be shown, then render the detailed chart
    document.getElementById('chartDetailModal').addEventListener('shown.bs.modal', function() {
        const ctx = document.getElementById('chartDetailCanvas').getContext('2d');
        
        // Destroy existing detail chart if any
        if (window.detailChart) {
            window.detailChart.destroy();
        }

        // Create detailed chart
        window.detailChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: chartTitles[chartType],
                    data: chartData.datasets[0].data,
                    borderColor: chartColors[chartType],
                    backgroundColor: chartColors[chartType] + '20',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    title: {
                        display: true,
                        text: `Detailed View - ${chartTitles[chartType]}`,
                        font: {
                            size: 16,
                            weight: 'bold'
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
                        display: true,
                        title: {
                            display: true,
                            text: chartTitles[chartType].split('(')[1]?.replace(')', '') || ''
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }, { once: true });
}

function exportData() {
    if (filteredData.length === 0) {
        alert('No data to export');
        return;
    }

    const headers = ['Timestamp', 'Device ID', 'Device Name', 'Location', 'Distance (cm)', 'Soil Moisture (%)', 'Temperature (°C)', 'Rain (%)'];
    const csvContent = [
        headers.join(','),
        ...filteredData.map(row => [
            `"${row.timestamp}"`,
            `"${row.device_id}"`,
            `"${row.device_name || row.device_id}"`,
            `"${row.location || 'N/A'}"`,
            row.distance !== null ? row.distance : '',
            row.soil_moisture !== null ? row.soil_moisture : '',
            row.temperature !== null ? parseFloat(row.temperature).toFixed(1) : '',
            row.rain_percentage !== null ? row.rain_percentage : ''
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `iot_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
