// History page JavaScript for IoT Monitoring System

let currentData = [];
let filteredData = [];
let currentPage = 1;
let rowsPerPage = 50;
let sortColumn = '';
let sortDirection = '';

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
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
        } else {
            throw new Error(data.message || 'Failed to load history data');
        }
    } catch (error) {
        console.error('Error loading history data:', error);
        document.getElementById('historyTableBody').innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error: ${error.message}</td></tr>`;
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