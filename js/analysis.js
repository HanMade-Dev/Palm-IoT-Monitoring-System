// Analysis page JavaScript for IoT Monitoring System

let currentData = [];
let charts = {}; // For trend charts
let conditionCharts = {}; // For pie charts
let comparisonCharts = {}; // For comparison charts

let chartDetailModal;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    chartDetailModal = new bootstrap.Modal(document.getElementById('chartDetailModal'));
    loadDeviceOptions();
    setDefaultDates();
    setupTimePeriodListener();
    loadAnalysisData(); // Initial data load
});

function setDefaultDates() {
    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    document.getElementById('endDate').value = today.toISOString().split('T')[0];
    document.getElementById('startDate').value = lastWeek.toISOString().split('T')[0];
}

function setupTimePeriodListener() {
    const timePeriodSelect = document.getElementById('timePeriod');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    // Initial state based on default selection
    if (timePeriodSelect.value !== 'custom') {
        startDateInput.disabled = true;
        endDateInput.disabled = true;
    } else {
        startDateInput.disabled = false;
        endDateInput.disabled = false;
    }

    timePeriodSelect.addEventListener('change', function() {
        const today = new Date();
        let startDate, endDate;

        switch (this.value) {
            case 'day':
                startDate = today;
                endDate = today;
                startDateInput.disabled = true;
                endDateInput.disabled = true;
                break;
            case 'week':
                startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                endDate = today;
                startDateInput.disabled = true;
                endDateInput.disabled = true;
                break;
            case 'month':
                startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                endDate = today;
                startDateInput.disabled = true;
                endDateInput.disabled = true;
                break;
            case 'custom':
                startDateInput.disabled = false;
                endDateInput.disabled = false;
                // Keep current values or set to a default range if empty
                startDate = new Date(startDateInput.value || new Date().toISOString().split('T')[0]);
                endDate = new Date(endDateInput.value || new Date().toISOString().split('T')[0]);
                break;
        }
        if (this.value !== 'custom') {
            startDateInput.value = startDate.toISOString().split('T')[0];
            endDateInput.value = endDate.toISOString().split('T')[0];
        }
    });
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

async function loadAnalysisData() {
    try {
        // Show loading state for all sections
        document.getElementById('analytics-container').innerHTML = '<div class="col-12 text-center">Loading analytics...</div>';
        document.getElementById('totalRecords').textContent = 'Loading...';
        document.getElementById('lastDataTimestamp').textContent = 'Loading...';
        document.getElementById('avgRecordsPerHour').textContent = 'Loading...';
        document.getElementById('avgRecordsPerDay').textContent = 'Loading...';
        document.getElementById('completenessDistance').textContent = 'Loading...';
        document.getElementById('completenessMoisture').textContent = 'Loading...';
        document.getElementById('completenessTemperature').textContent = 'Loading...';
        document.getElementById('completenessRain').textContent = 'Loading...';
        
        // Destroy all existing chart instances before loading new data
        destroyAllCharts();

        // Build query parameters
        const params = new URLSearchParams();
        const deviceId = document.getElementById('deviceFilter').value;
        const timePeriod = document.getElementById('timePeriod').value;
        let startDate = document.getElementById('startDate').value;
        let endDate = document.getElementById('endDate').value;

        if (deviceId) params.append('device_id', deviceId);

        // Adjust dates based on timePeriod selection
        const today = new Date();
        if (timePeriod === 'day') {
            startDate = today.toISOString().split('T')[0];
            endDate = today.toISOString().split('T')[0];
        } else if (timePeriod === 'week') {
            startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            endDate = today.toISOString().split('T')[0];
        } else if (timePeriod === 'month') {
            startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            endDate = today.toISOString().split('T')[0];
        }
        
        params.append('start_date', startDate);
        params.append('end_date', endDate);
        params.append('filter_type', 'range'); // Always use range filter for analysis page
        params.append('limit', 10000); // Fetch more data for analysis, increase limit significantly

        const response = await fetch(`api/get_history.php?${params.toString()}`);
        const data = await response.json();

        if (data.success) {
            currentData = data.data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Sort ascending for charts
            renderAnalytics(currentData);
            renderConditionSummary(currentData);
            renderTrendCharts(currentData);
            renderComparisonCharts(currentData);
            renderAdditionalMetrics(currentData, startDate, endDate); // Render new additional metrics
        } else {
            throw new Error(data.message || 'Failed to load analysis data');
        }
    } catch (error) {
        console.error('Error loading analysis data:', error);
        document.getElementById('analytics-container').innerHTML = `<div class="col-12"><div class="alert alert-danger">Error loading data: ${error.message}</div></div>`;
    }
}

// Function to destroy all existing chart instances
function destroyAllCharts() {
    // Destroy charts in 'charts' object
    for (const key in charts) {
        if (charts[key]) {
            charts[key].destroy();
            charts[key] = null; // Clear reference
        }
    }
    // Destroy charts in 'conditionCharts' object
    for (const key in conditionCharts) {
        if (conditionCharts[key]) {
            conditionCharts[key].destroy();
            conditionCharts[key] = null; // Clear reference
        }
    }
    // Destroy charts in 'comparisonCharts' object
    for (const key in comparisonCharts) {
        if (comparisonCharts[key]) {
            comparisonCharts[key].destroy();
            comparisonCharts[key] = null; // Clear reference
        }
    }
    // Also destroy the detail chart if it's open
    if (window.detailChart) {
        window.detailChart.destroy();
        window.detailChart = null;
    }
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
            avgDistance: 'N/A', minDistance: 'N/A', maxDistance: 'N/A',
            avgMoisture: 'N/A', minMoisture: 'N/A', maxMoisture: 'N/A',
            avgTemperature: 'N/A', minTemperature: 'N/A', maxTemperature: 'N/A',
            avgRain: 'N/A', maxRain: 'N/A'
        };
    }

    const distanceValues = data.map(d => parseFloat(d.distance)).filter(v => !isNaN(v) && v !== null);
    const moistureValues = data.map(d => parseFloat(d.soil_moisture)).filter(v => !isNaN(v) && v !== null);
    const temperatureValues = data.map(d => parseFloat(d.temperature)).filter(v => !isNaN(v) && v !== null);
    const rainValues = data.map(d => parseFloat(d.rain_percentage)).filter(v => !isNaN(v) && v !== null);

    const getStats = (values) => {
        if (values.length === 0) return { avg: 'N/A', min: 'N/A', max: 'N/A' };
        const sum = values.reduce((a, b) => a + b, 0);
        return {
            avg: (sum / values.length).toFixed(1),
            min: Math.min(...values).toFixed(1),
            max: Math.max(...values).toFixed(1)
        };
    };

    const distStats = getStats(distanceValues);
    const moistStats = getStats(moistureValues);
    const tempStats = getStats(temperatureValues);
    const rainStats = getStats(rainValues);

    return {
        totalRecords: data.length,
        avgDistance: distStats.avg, minDistance: distStats.min, maxDistance: distStats.max,
        avgMoisture: moistStats.avg, minMoisture: moistStats.min, maxMoisture: moistStats.max,
        avgTemperature: tempStats.avg, minTemperature: tempStats.min, maxTemperature: tempStats.max,
        avgRain: rainStats.avg, maxRain: rainStats.max
    };
}

function renderAdditionalMetrics(data, startDateStr, endDateStr) {
    document.getElementById('totalRecords').textContent = data.length;

    if (data.length > 0) {
        const firstTimestamp = new Date(data[0].timestamp);
        const lastTimestamp = new Date(data[data.length - 1].timestamp);
        document.getElementById('lastDataTimestamp').textContent = lastTimestamp.toLocaleString('id-ID');

        const timeDiffHours = (lastTimestamp - firstTimestamp) / (1000 * 60 * 60);
        const timeDiffDays = timeDiffHours / 24;

        if (timeDiffHours > 0) {
            document.getElementById('avgRecordsPerHour').textContent = (data.length / timeDiffHours).toFixed(2);
        } else {
            document.getElementById('avgRecordsPerHour').textContent = 'N/A';
        }
        if (timeDiffDays > 0) {
            document.getElementById('avgRecordsPerDay').textContent = (data.length / timeDiffDays).toFixed(2);
        } else {
            document.getElementById('avgRecordsPerDay').textContent = 'N/A';
        }

        // Data Completeness
        const totalRecords = data.length;
        const countValid = (key) => data.filter(d => d[key] !== null && !isNaN(parseFloat(d[key]))).length;

        const completenessDistance = (countValid('distance') / totalRecords * 100).toFixed(1);
        const completenessMoisture = (countValid('soil_moisture') / totalRecords * 100).toFixed(1);
        const completenessTemperature = (countValid('temperature') / totalRecords * 100).toFixed(1);
        const completenessRain = (countValid('rain_percentage') / totalRecords * 100).toFixed(1);

        document.getElementById('completenessDistance').textContent = `${completenessDistance}%`;
        document.getElementById('completenessMoisture').textContent = `${completenessMoisture}%`;
        document.getElementById('completenessTemperature').textContent = `${completenessTemperature}%`;
        document.getElementById('completenessRain').textContent = `${completenessRain}%`;

    } else {
        document.getElementById('lastDataTimestamp').textContent = 'N/A';
        document.getElementById('avgRecordsPerHour').textContent = 'N/A';
        document.getElementById('avgRecordsPerDay').textContent = 'N/A';
        document.getElementById('completenessDistance').textContent = 'N/A';
        document.getElementById('completenessMoisture').textContent = 'N/A';
        document.getElementById('completenessTemperature').textContent = 'N/A';
        document.getElementById('completenessRain').textContent = 'N/A';
    }
}


function renderConditionSummary(data) {
    if (data.length === 0) {
        // Clear charts if no data
        Object.values(conditionCharts).forEach(chart => chart && chart.destroy());
        return;
    }

    const tempConditions = { 'Dingin (<20°C)': 0, 'Normal (20-30°C)': 0, 'Panas (>30°C)': 0 };
    const moistureConditions = { 'Kering (<30%)': 0, 'Normal (30-70%)': 0, 'Basah (>70%)': 0 };
    const waterLevelConditions = { 'Tinggi (<20cm)': 0, 'Normal (20-80cm)': 0, 'Rendah (>80cm)': 0 };
    const rainConditions = { 'Kering (<10%)': 0, 'Gerimis (10-50%)': 0, 'Hujan (>50%)': 0 };

    data.forEach(row => {
        // Temperature
        if (row.temperature !== null && !isNaN(parseFloat(row.temperature))) {
            const temp = parseFloat(row.temperature);
            if (temp < 20) tempConditions['Dingin (<20°C)']++;
            else if (temp >= 20 && temp <= 30) tempConditions['Normal (20-30°C)']++;
            else tempConditions['Panas (>30°C)']++;
        }
        // Soil Moisture
        if (row.soil_moisture !== null && !isNaN(parseFloat(row.soil_moisture))) {
            const moisture = parseFloat(row.soil_moisture);
            if (moisture < 30) moistureConditions['Kering (<30%)']++;
            else if (moisture >= 30 && moisture <= 70) moistureConditions['Normal (30-70%)']++;
            else moistureConditions['Basah (>70%)']++;
        }
        // Water Level (Distance)
        if (row.distance !== null && !isNaN(parseFloat(row.distance))) {
            const distance = parseFloat(row.distance);
            if (distance < 20) waterLevelConditions['Tinggi (<20cm)']++;
            else if (distance >= 20 && distance <= 80) waterLevelConditions['Normal (20-80cm)']++;
            else waterLevelConditions['Rendah (>80cm)']++;
        }
        // Rain
        if (row.rain_percentage !== null && !isNaN(parseFloat(row.rain_percentage))) {
            const rain = parseFloat(row.rain_percentage);
            if (rain < 10) rainConditions['Kering (<10%)']++;
            else if (rain >= 10 && rain <= 50) rainConditions['Gerimis (10-50%)']++;
            else rainConditions['Hujan (>50%)']++;
        }
    });

    // Render Temperature Condition Chart
    renderPieChart('tempConditionChart', 'Temperature Conditions', Object.keys(tempConditions), Object.values(tempConditions), ['#0dcaf0', '#198754', '#dc3545']);
    // Render Soil Moisture Condition Chart
    renderPieChart('moistureConditionChart', 'Soil Moisture Conditions', Object.keys(moistureConditions), Object.values(moistureConditions), ['#dc3545', '#ffc107', '#198754']);
    // Render Water Level Condition Chart
    renderPieChart('waterLevelConditionChart', 'Water Level Conditions', Object.keys(waterLevelConditions), Object.values(waterLevelConditions), ['#198754', '#ffc107', '#dc3545']);
    // Render Rain Condition Chart
    renderPieChart('rainConditionChart', 'Rainfall Conditions', Object.keys(rainConditions), Object.values(rainConditions), ['#ffc107', '#0dcaf0', '#198754']);
}

function renderPieChart(canvasId, title, labels, data, colors) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    // Destroy existing chart on this canvas if it exists
    if (conditionCharts[canvasId]) {
        conditionCharts[canvasId].destroy();
    }
    conditionCharts[canvasId] = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                },
                title: {
                    display: false,
                    text: title
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += context.parsed;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function renderTrendCharts(data) {
    if (data.length === 0) {
        // Clear charts if no data
        Object.values(charts).forEach(chart => chart && chart.destroy());
        return;
    }

    const labels = data.map(row => new Date(row.timestamp).toLocaleString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
    }));

    // Destroy existing charts before creating new ones
    if (charts.distance) charts.distance.destroy();
    if (charts.moisture) charts.moisture.destroy();
    if (charts.temperature) charts.temperature.destroy();
    if (charts.rain) charts.rain.destroy();


    // Distance Chart
    const distanceValues = data.map(row => row.distance);
    charts.distance = new Chart(document.getElementById('distanceChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Jarak Air (cm)',
                data: distanceValues,
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0 // No anomaly highlighting
            }]
        },
        options: getChartOptions('Jarak Air', 'cm')
    });

    // Moisture Chart
    const moistureValues = data.map(row => row.soil_moisture);
    charts.moisture = new Chart(document.getElementById('moistureChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kelembaban Tanah (%)',
                data: moistureValues,
                borderColor: '#198754',
                backgroundColor: 'rgba(25, 135, 84, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0 // No anomaly highlighting
            }]
        },
        options: getChartOptions('Kelembaban Tanah', '%', 0, 100)
    });

    // Temperature Chart
    const temperatureValues = data.map(row => row.temperature);
    charts.temperature = new Chart(document.getElementById('temperatureChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Suhu Udara (°C)',
                data: temperatureValues,
                borderColor: '#ffc107',
                backgroundColor: 'rgba(255, 193, 7, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0 // No anomaly highlighting
            }]
        },
        options: getChartOptions('Suhu Udara', '°C')
    });

    // Rain Chart
    const rainValues = data.map(row => row.rain_percentage);
    charts.rain = new Chart(document.getElementById('rainChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Curah Hujan (%)',
                data: rainValues,
                borderColor: '#0dcaf0',
                backgroundColor: 'rgba(13, 202, 240, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0 // No anomaly highlighting
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

function renderComparisonCharts(data) {
    if (data.length === 0) {
        Object.values(comparisonCharts).forEach(chart => chart && chart.destroy());
        return;
    }

    const labels = data.map(row => new Date(row.timestamp).toLocaleString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
    }));

    // Temperature vs. Soil Moisture
    const tempMoistureCtx = document.getElementById('tempMoistureComparisonChart').getContext('2d');
    // Destroy existing chart on this canvas if it exists
    if (comparisonCharts.tempMoisture) {
        comparisonCharts.tempMoisture.destroy();
    }
    comparisonCharts.tempMoisture = new Chart(tempMoistureCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Suhu Udara (°C)',
                data: data.map(row => row.temperature),
                borderColor: '#ffc107',
                backgroundColor: 'rgba(255, 193, 7, 0.1)',
                fill: false,
                tension: 0.4,
                yAxisID: 'y'
            }, {
                label: 'Kelembaban Tanah (%)',
                data: data.map(row => row.soil_moisture),
                borderColor: '#198754',
                backgroundColor: 'rgba(25, 135, 84, 0.1)',
                fill: false,
                tension: 0.4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: false,
                    text: 'Temperature vs. Soil Moisture'
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
                        text: 'Temperature (°C)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Soil Moisture (%)'
                    },
                    grid: {
                        drawOnChartArea: false, // only want the grid lines for one axis to show up
                    },
                    min: 0,
                    max: 100
                }
            }
        }
    });

    // Rain vs. Water Level
    const rainWaterLevelCtx = document.getElementById('rainWaterLevelComparisonChart').getContext('2d');
    // Destroy existing chart on this canvas if it exists
    if (comparisonCharts.rainWaterLevel) {
        comparisonCharts.rainWaterLevel.destroy();
    }
    comparisonCharts.rainWaterLevel = new Chart(rainWaterLevelCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Curah Hujan (%)',
                data: data.map(row => row.rain_percentage),
                borderColor: '#0dcaf0',
                backgroundColor: 'rgba(13, 202, 240, 0.1)',
                fill: false,
                tension: 0.4,
                yAxisID: 'y'
            }, {
                label: 'Jarak Air (cm)',
                data: data.map(row => row.distance),
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                fill: false,
                tension: 0.4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: false,
                    text: 'Rain vs. Water Level'
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
                        text: 'Rainfall (%)'
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
                        text: 'Water Level (cm)'
                    },
                    grid: {
                        drawOnChartArea: false,
                    }
                }
            }
        }
    });
}

async function exportData(format) {
    if (currentData.length === 0) {
        alert('No data to export.');
        return;
    }

    const headers = ['Timestamp', 'Device ID', 'Device Name', 'Location', 'Distance (cm)', 'Soil Moisture (%)', 'Temperature (°C)', 'Rain (%)'];
    const exportableData = currentData.map(row => [
        row.timestamp,
        row.device_id,
        row.device_name || row.device_id,
        row.location || 'N/A',
        row.distance !== null ? row.distance : '',
        row.soil_moisture !== null ? row.soil_moisture : '',
        row.temperature !== null ? parseFloat(row.temperature).toFixed(1) : '',
        row.rain_percentage !== null ? row.rain_percentage : ''
    ]);

    const filename = `iot_analysis_data_${new Date().toISOString().split('T')[0]}`;

    if (format === 'pdf') {
        try {
            // Check if jsPDF is available
            if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
                console.error('jsPDF library not loaded or not accessible.');
                alert('Failed to generate PDF. jsPDF library is not loaded.');
                return;
            }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape'); // 'landscape' for wider tables

            // Check if autoTable plugin is available
            if (typeof doc.autoTable === 'undefined') {
                console.error('jspdf-autotable plugin not loaded or not accessible.');
                alert('Failed to generate PDF. jspdf-autotable plugin is not loaded.');
                return;
            }

            doc.text("IoT Monitoring System - Analysis Data", 14, 10);
            doc.autoTable({
                head: [headers],
                body: exportableData,
                startY: 20,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
                headStyles: { fillColor: [25, 135, 84], textColor: [255, 255, 255] },
                columnStyles: {
                    0: { cellWidth: 30 }, // Timestamp
                    1: { cellWidth: 25 }, // Device ID
                    2: { cellWidth: 30 }, // Device Name
                    3: { cellWidth: 25 }, // Location
                    4: { cellWidth: 20 }, // Distance
                    5: { cellWidth: 20 }, // Moisture
                    6: { cellWidth: 20 }, // Temperature
                    7: { cellWidth: 20 }  // Rain
                }
            });
            doc.save(`${filename}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF. Please check console for details.');
        }
    } else if (format === 'html') {
        const analytics = calculateAnalytics(currentData);
        const deviceFilter = document.getElementById('deviceFilter');
        const selectedDeviceText = deviceFilter.options[deviceFilter.selectedIndex].text;
        const timePeriod = document.getElementById('timePeriod').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        let filterInfo = `Periode: ${timePeriod}`;
        if (timePeriod === 'custom') {
            filterInfo += ` (${startDate} - ${endDate})`;
        }
        if (selectedDeviceText !== 'All Devices') {
            filterInfo += `, Device: ${selectedDeviceText}`;
        }

        // Capture chart images
        const chartImages = {};
        for (const chartKey in charts) {
            if (charts[chartKey]) {
                chartImages[chartKey] = charts[chartKey].toBase64Image();
            }
        }
        for (const chartKey in conditionCharts) {
            if (conditionCharts[chartKey]) {
                chartImages[chartKey] = conditionCharts[chartKey].toBase64Image();
            }
        }
        for (const chartKey in comparisonCharts) {
            if (comparisonCharts[chartKey]) {
                if (chartKey === 'tempMoisture') {
                    chartImages['tempMoistureComparisonChart'] = comparisonCharts[chartKey].toBase64Image();
                } else if (chartKey === 'rainWaterLevel') {
                    chartImages['rainWaterLevelComparisonChart'] = comparisonCharts[chartKey].toBase64Image();
                } else {
                    chartImages[chartKey] = comparisonCharts[chartKey].toBase64Image();
                }
            }
        }

        let htmlContent = `
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Laporan Analisis Data IoT Kelapa Sawit</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
                <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; background-color: #f8f9fa; color: #212529; }
                    .container-report { max-width: 1200px; margin: auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 0 15px rgba(0,0,0,0.1); }
                    h1, h2, h3 { color: #198754; }
                    .header-section { text-align: center; margin-bottom: 30px; }
                    .header-section img { max-width: 100px; margin-bottom: 15px; }
                    .analytics-section, .condition-section, .data-table-section, .chart-section { margin-bottom: 40px; }
                    .analytics-card { border: 1px solid #e9ecef; border-radius: 15px; padding: 20px; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); height: 100%; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); border-left: 4px solid; }
                    .analytics-card.card-primary { border-left-color: #0d6efd; }
                    .analytics-card.card-success { border-left-color: #198754; }
                    .analytics-card.card-warning { border-left-color: #ffc107; }
                    .analytics-card.card-info { border-left-color: #0dcaf0; }
                    .analytics-header { font-weight: 600; font-size: 16px; margin-bottom: 15px; color: #495057; display: flex; align-items: center; gap: 8px; }
                    .analytics-item { margin-bottom: 12px; padding: 8px 0; border-bottom: 1px solid rgba(0, 0, 0, 0.05); }
                    .analytics-item:last-child { border-bottom: none; margin-bottom: 0; }
                    .analytics-label { font-size: 12px; color: #6c757d; font-weight: 500; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
                    .analytics-value { font-size: 18px; font-weight: 700; line-height: 1.2; color: #212529; }
                    .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    .table th, .table td { border: 1px solid #dee2e6; padding: 8px; text-align: left; }
                    .table th { background-color: #e9ecef; font-weight: bold; }
                    .footer-section { text-align: center; margin-top: 50px; font-size: 0.9em; color: #6c757d; }
                    .chart-img { max-width: 100%; height: auto; display: block; margin: 15px auto; border: 1px solid #eee; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
                </style>
            </head>
            <body>
                <div class="container-report">
                    <div class="header-section">
                        <img src="https://via.placeholder.com/100" alt="Logo Perusahaan"> <!-- Ganti dengan logo Anda -->
                        <h1>Laporan Analisis Data IoT Kelapa Sawit</h1>
                        <p class="lead">Dibuat pada: ${new Date().toLocaleString('id-ID')}</p>
                        <p><strong>Filter Data:</strong> ${filterInfo}</p>
                    </div>

                    <div class="analytics-section">
                        <h2><i class="fas fa-chart-bar"></i> Ringkasan Analisis Sensor</h2>
                        <div class="row">
                            <div class="col-md-6 col-lg-3 mb-3">
                                <div class="analytics-card card-primary">
                                    <div class="analytics-header"><i class="fas fa-water text-primary"></i> Jarak Air</div>
                                    <div class="analytics-item"><div class="analytics-label">Average</div><div class="analytics-value text-primary">${analytics.avgDistance} cm</div></div>
                                    <div class="analytics-item"><div class="analytics-label">Min / Max</div><div class="analytics-value text-primary">${analytics.minDistance} cm / ${analytics.maxDistance} cm</div></div>
                                </div>
                            </div>
                            <div class="col-md-6 col-lg-3 mb-3">
                                <div class="analytics-card card-success">
                                    <div class="analytics-header"><i class="fas fa-tint text-success"></i> Kelembaban Tanah</div>
                                    <div class="analytics-item"><div class="analytics-label">Average</div><div class="analytics-value text-success">${analytics.avgMoisture}%</div></div>
                                    <div class="analytics-item"><div class="analytics-label">Min / Max</div><div class="analytics-value text-success">${analytics.minMoisture}% / ${analytics.maxMoisture}%</div></div>
                                </div>
                            </div>
                            <div class="col-md-6 col-lg-3 mb-3">
                                <div class="analytics-card card-warning">
                                    <div class="analytics-header"><i class="fas fa-thermometer-half text-warning"></i> Suhu Udara</div>
                                    <div class="analytics-item"><div class="analytics-label">Average</div><div class="analytics-value text-warning">${analytics.avgTemperature}°C</div></div>
                                    <div class="analytics-item"><div class="analytics-label">Min / Max</div><div class="analytics-value text-warning">${analytics.minTemperature}°C / ${analytics.maxTemperature}°C</div></div>
                                </div>
                            </div>
                            <div class="col-md-6 col-lg-3 mb-3">
                                <div class="analytics-card card-info">
                                    <div class="analytics-header"><i class="fas fa-cloud-rain text-info"></i> Curah Hujan</div>
                                    <div class="analytics-item"><div class="analytics-label">Average</div><div class="analytics-value text-info">${analytics.avgRain}%</div></div>
                                    <div class="analytics-item"><div class="analytics-label">Max Detected</div><div class="analytics-value text-info">${analytics.maxRain}%</div></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="chart-section">
                        <h2><i class="fas fa-chart-pie"></i> Ringkasan Kondisi</h2>
                        <div class="row">
                            <div class="col-md-6 mb-3">
                                <h5>Temperature Conditions</h5>
                                <img src="${chartImages.tempConditionChart || ''}" alt="Temperature Conditions Chart" class="chart-img">
                            </div>
                            <div class="col-md-6 mb-3">
                                <h5>Soil Moisture Conditions</h5>
                                <img src="${chartImages.moistureConditionChart || ''}" alt="Soil Moisture Conditions Chart" class="chart-img">
                            </div>
                            <div class="col-md-6 mb-3">
                                <h5>Water Level Conditions</h5>
                                <img src="${chartImages.waterLevelConditionChart || ''}" alt="Water Level Conditions Chart" class="chart-img">
                            </div>
                            <div class="col-md-6 mb-3">
                                <h5>Rainfall Conditions</h5>
                                <img src="${chartImages.rainConditionChart || ''}" alt="Rainfall Conditions Chart" class="chart-img">
                            </div>
                        </div>
                    </div>

                    <div class="chart-section">
                        <h2><i class="fas fa-chart-line"></i> Tren Sensor</h2>
                        <div class="row">
                            <div class="col-md-6 mb-3">
                                <h5>Jarak Air (cm)</h5>
                                <img src="${chartImages.distance || ''}" alt="Distance Chart" class="chart-img">
                            </div>
                            <div class="col-md-6 mb-3">
                                <h5>Kelembaban Tanah (%)</h5>
                                <img src="${chartImages.moisture || ''}" alt="Moisture Chart" class="chart-img">
                            </div>
                            <div class="col-md-6 mb-3">
                                <h5>Suhu Udara (°C)</h5>
                                <img src="${chartImages.temperature || ''}" alt="Temperature Chart" class="chart-img">
                            </div>
                            <div class="col-md-6 mb-3">
                                <h5>Curah Hujan (%)</h5>
                                <img src="${chartImages.rain || ''}" alt="Rain Chart" class="chart-img">
                            </div>
                        </div>
                    </div>

                    <div class="chart-section">
                        <h2><i class="fas fa-exchange-alt"></i> Perbandingan Sensor</h2>
                        <div class="row">
                            <div class="col-md-6 mb-3">
                                <h5>Temperature vs. Soil Moisture</h5>
                                <img src="${chartImages.tempMoistureComparisonChart || ''}" alt="Temperature vs. Soil Moisture Chart" class="chart-img">
                            </div>
                            <div class="col-md-6 mb-3">
                                <h5>Rain vs. Water Level</h5>
                                <img src="${chartImages.rainWaterLevelComparisonChart || ''}" alt="Rain vs. Water Level Chart" class="chart-img">
                            </div>
                        </div>
                    </div>

                    <div class="data-table-section">
                        <h2><i class="fas fa-table"></i> Data Mentah</h2>
                        <table class="table table-striped">
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Device ID</th>
                                    <th>Device Name</th>
                                    <th>Location</th>
                                    <th>Distance (cm)</th>
                                    <th>Soil Moisture (%)</th>
                                    <th>Temperature (°C)</th>
                                    <th>Rain (%)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${exportableData.map(row => `
                                    <tr>
                                        <td>${row[0]}</td>
                                        <td>${row[1]}</td>
                                        <td>${row[2]}</td>
                                        <td>${row[3]}</td>
                                        <td>${row[4]}</td>
                                        <td>${row[5]}</td>
                                        <td>${row[6]}</td>
                                        <td>${row[7]}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div class="footer-section">
                        <p>Laporan ini dihasilkan secara otomatis oleh Sistem Monitoring IoT Kelapa Sawit.</p>
                        <p>&copy; 2025 IoT Monitoring Kelapa Sawit. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.html`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}