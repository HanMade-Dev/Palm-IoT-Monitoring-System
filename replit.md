# Overview

This is an IoT Monitoring System designed specifically for palm oil plantations (Kelapa Sawit). The system provides real-time monitoring of environmental conditions including soil moisture, air temperature, water levels, and rainfall. It features a responsive web interface with multiple pages for dashboard visualization, historical data analysis, and detailed analytics with data export capabilities.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Technology Stack**: Pure HTML5, CSS3, and vanilla JavaScript
- **UI Framework**: Bootstrap 5.1.3 for responsive design and components
- **Visualization**: Chart.js for data visualization and analytics
- **Icons**: Font Awesome 6.0.0 for consistent iconography
- **Document Generation**: jsPDF with AutoTable plugin for report exports

## Page Structure
- **Multi-page Application**: Separate HTML files for different functionalities
  - `index.html`: Landing page with system overview
  - `dashboard.html`: Real-time monitoring dashboard
  - `history.html`: Historical data viewing and filtering
  - `analysis.html`: Advanced analytics and reporting
- **Responsive Design**: Mobile-first approach with collapsible navigation
- **Consistent Navigation**: Fixed top navigation bar across all pages

## Data Management
- **Client-side Processing**: JavaScript handles data filtering, sorting, and pagination
- **Real-time Updates**: Dashboard implements auto-refresh functionality (10-second intervals)
- **Data Visualization**: Multiple chart types including line charts for trends and pie charts for condition analysis
- **Export Capabilities**: PDF generation for reports and data analysis

## Device Management
- **Device Registration**: JSON-based device configuration in `config/keys.json`
- **Multi-device Support**: Support for multiple IoT devices with unique identifiers
- **Device Metadata**: Stores device names, creation dates, and status information

## API Integration
- **RESTful Endpoints**: Communicates with backend through `/api/` endpoints
- **Device Data**: `get_devices.php` for device listing and management
- **Sensor Data**: Endpoints for retrieving sensor readings and historical data
- **Error Handling**: Comprehensive error handling with user-friendly messages

## Security Architecture
- **API Key Authentication**: Device authentication using SHA-256 hashed keys
- **Device Validation**: Server-side validation of device credentials
- **Data Integrity**: Structured data validation for sensor readings

# External Dependencies

## Frontend Libraries
- **Bootstrap 5.1.3**: UI framework via CDN
- **Font Awesome 6.0.0**: Icon library via CDN
- **Chart.js**: Data visualization library via CDN
- **jsPDF 2.5.1**: PDF generation library via CDN
- **jsPDF AutoTable 3.5.25**: Table plugin for PDF reports via CDN
- **date-fns 2.29.0**: Date manipulation library via CDN

## Backend Services
- **PHP Backend**: Server-side processing for API endpoints
- **Database Storage**: Data persistence layer (implementation details not visible in current structure)
- **IoT Device Integration**: Sensor data collection from palm oil plantation monitoring devices

## Monitoring Sensors
- **Environmental Sensors**: Soil moisture, air temperature, water level, and rainfall sensors
- **Real-time Data Collection**: Continuous sensor data streaming to the system
- **Multi-parameter Monitoring**: Comprehensive environmental condition tracking