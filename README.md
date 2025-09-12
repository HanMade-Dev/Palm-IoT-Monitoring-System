# 🌱 SISTEM MONITORING IOT SAWIT
## Dokumentasi Lengkap Program dan Fitur-Fitur Sistem

---

## 🎯 **APA ITU SISTEM IOT MONITORING SAWIT?**

Sistem IoT Monitoring Sawit adalah solusi teknologi canggih berbasis **Internet of Things (IoT)** yang dirancang khusus untuk memantau kondisi perkebunan sawit secara **real-time** dan otomatis. Sistem ini menggunakan berbagai sensor pintar yang terpasang di lapangan untuk mengukur kondisi lingkungan yang penting bagi pertumbuhan sawit.

### **Kelebihan sistem:**

- ✅ **Pantau kebun dari mana saja** menggunakan smartphone/laptop
- ✅ **Notifikasi otomatis** jika ada masalah di kebun
- ✅ **Data akurat real-time** setiap detik tentang kondisi kebun
- ✅ **Hemat waktu, tenaga, dan biaya** operasional
- ✅ **Produktivitas meningkat** hingga 30-50%
- ✅ **Keputusan berbasis data** yang akurat dan tepat waktu

---

## 🌐 **FITUR-FITUR WEBSITE**

Sistem ini memiliki 3 halaman utama yang masing-masing memiliki fungsi khusus:

### 🏠 **1. HALAMAN BERANDA**
**Fungsi:** Halaman pembuka yang memperkenalkan sistem
**Fitur Utama:**
- **Hero Section** dengan penjelasan sistem yang menarik
- **Kartu fitur** yang menampilkan 4 sensor utama:
  - 🌡️ **Suhu Udara** - Monitor suhu lingkungan
  - 💧 **Kelembaban Tanah** - Pantau kondisi kelembaban tanah  
  - 🌊 **Tinggi Air** - Monitor level air irigasi
  - 🌧️ **Curah Hujan** - Deteksi kondisi hujan
- **Navigasi mudah** ke halaman Dashboard, History, dan Analysis
- **Desain responsif** yang bisa diakses dari smartphone, tablet, atau komputer

---

### 📊 **2. HALAMAN DASHBOARD**
**Fungsi:** Pusat kendali utama untuk monitoring real-time

#### **🎛️ FITUR MONITORING REAL-TIME**
- **Status Koneksi Live** - Menampilkan status koneksi perangkat (Online/Offline)
- **Update Otomatis** setiap beberapa detik tanpa perlu refresh halaman
- **Timestamp** terakhir data masuk dengan akurasi detik

#### **🚨 SISTEM ALERT PINTAR**
- **Notifikasi Otomatis** jika:
  - Kelembaban tanah terlalu rendah (butuh penyiraman)
  - Suhu terlalu tinggi/rendah (tidak normal)
  - Level air irigasi menurun drastis
  - Ada gangguan koneksi perangkat
- **Alert berwarna** (merah=bahaya, kuning=peringatan, hijau=normal)

#### **🗺️ PETA LOKASI PERANGKAT INTERAKTIF**
- **Google Maps terintegrasi** menampilkan lokasi semua perangkat
- **Marker berwarna** (hijau=online, merah=offline)
- **Info popup** saat klik marker menampilkan detail perangkat
- **Toggle on/off** untuk menyembunyikan/menampilkan peta
- **Zoom dan navigasi** seperti Google Maps biasa

#### **📱 KARTU STATUS DEVICE PINTAR**
Setiap device ditampilkan dalam kartu yang menampilkan:
- **Nama dan ID perangkat** yang unik
- **Lokasi geografis** perangkat terpasang
- **Status koneksi** real-time (Online/Offline dengan indikator warna)
- **4 Sensor utama** dengan nilai dan status:
  - 🌊 **Jarak Air** (cm) - Mengukur jarak permukaan air untuk mengetahui ketinggian air
  - 💧 **Kelembaban Tanah** (%) - Persentase kelembaban tanah
  - 🌡️ **Suhu Udara** (°C) - Suhu lingkungan dalam Celsius  
  - 🌧️ **Curah Hujan** (%) - Persentase kelembaban akibat hujan

#### **🔧 FITUR MANAJEMEN DEVICE CANGGIH**

##### **A. Tambah Device Baru**
- **Form wizard** yang mudah digunakan
- **Input data device:**
  - Device ID (unik, hanya huruf/angka)
  - Nama device yang mudah diingat
  - Lokasi descriptive
  - Deskripsi optional
- **Peta interaktif** untuk menentukan koordinat GPS
- **Klik pada peta** untuk set lokasi otomatis
- **Generate kode ESP32** otomatis setelah device ditambahkan
- **Copy-paste kode** langsung ke Arduino IDE

##### **B. Edit Device**
- **Update informasi** device yang sudah ada
- **Pindah lokasi** device di peta
- **Edit nama dan deskripsi**
- **Validasi data** sebelum menyimpan

##### **C. Hapus Device**
- **Konfirmasi penghapusan** untuk mencegah kesalahan
- **Soft delete** untuk menjaga integritas data historis

#### **📈 DETAIL MONITORING PER DEVICE**
Klik device untuk membuka **Modal Detail** yang menampilkan:
- **Informasi lengkap** device (ID, lokasi, status, last seen)
- **4 kartu sensor** dengan nilai real-time dan status visual
- **4 grafik mini** untuk setiap sensor menampilkan trend 24 jam terakhir
- **Auto-refresh** data setiap 30 detik
- **Indikator sinyal WiFi** dan **Free Heap Memory** device

---

### 📜 **3. HALAMAN HISTORY**
**Fungsi:** Melihat dan menganalisis data historis

#### **🔍 SISTEM FILTER DATA CANGGIH**
- **Filter berdasarkan Device** - Pilih device spesifik atau semua device
- **Filter berdasarkan Sensor** - Fokus pada sensor tertentu (jarak air, kelembaban, suhu, hujan)
- **Filter berdasarkan Tanggal** - Range tanggal start dan end
- **Jumlah data per halaman** - 25, 50, 100, atau 200 records
- **Search real-time** tanpa reload halaman

#### **📋 TABEL DATA HISTORIS LENGKAP**
- **Tabel responsif** yang bisa diakses dari mobile
- **Kolom lengkap:**
  - Timestamp (tanggal dan jam)
  - Device name dan ID
  - Location device
  - Distance/Jarak Air (cm)
  - Soil Moisture/Kelembaban Tanah (%)
  - Temperature/Suhu (°C)
  - Rain/Curah Hujan (%)
- **Sorting/pengurutan** untuk setiap kolom (ascending/descending)
- **Pagination** dengan navigasi halaman
- **Counter total records** yang ditemukan

#### **📥 EXPORT DATA**
- **Export ke CSV** untuk analisis lebih lanjut di Excel
- **Filter data sebelum export** untuk data yang spesifik
- **Format CSV** yang kompatibel dengan Microsoft Excel dan Google Sheets

---

### 📊 **4. HALAMAN ANALYSIS**
**Fungsi:** Analisis mendalam dan reporting

#### **📈 OVERVIEW DATA STATISTIK**
**3 Kartu Statistik Utama:**

##### **A. Data Overview (Biru)**
- **Total Records** - Jumlah total data dalam database
- **Last Data Timestamp** - Kapan data terakhir masuk

##### **B. Data Rate (Hijau)**
- **Average Records per Hour** - Rata-rata data masuk per jam
- **Average Records per Day** - Rata-rata data masuk per hari

##### **C. Data Completeness (Kuning)**
- **Persentase kelengkapan data** untuk setiap sensor:
  - Distance sensor completeness
  - Soil Moisture sensor completeness  
  - Temperature sensor completeness
  - Rain sensor completeness

#### **🎯 ANALYTICS SUMMARY (MIN/MAX/AVERAGE)**
**4 Kartu Analisis Sensor:**
- **Nilai Minimum, Maximum, dan Average** untuk setiap sensor
- **Rentang waktu** analisis yang bisa disesuaikan
- **Color coding** berdasarkan status (merah=berbahaya, kuning=warning, hijau=normal)

#### **🥧 CONDITION SUMMARY (PIE CHARTS)**
**4 Pie Chart Interaktif:**
- **Temperature Conditions** - Distribusi kondisi suhu (Dingin/Normal/Panas)
- **Soil Moisture Conditions** - Distribusi kelembaban tanah (Kering/Normal/Basah)  
- **Water Level Conditions** - Distribusi tinggi air (Rendah/Sedang/Tinggi)
- **Rainfall Conditions** - Distribusi hujan (Kering/Gerimis/Hujan)

#### **📊 SENSOR TRENDS (LINE CHARTS)**
**4 Line Chart untuk Trend Sensor:**
- **Jarak Air Chart** - Grafik perubahan ketinggian air dari waktu ke waktu
- **Kelembaban Tanah Chart** - Trend kelembaban tanah
- **Suhu Udara Chart** - Perubahan suhu lingkungan
- **Curah Hujan Chart** - Pattern curah hujan
- **Klik chart** untuk membuka **popup detail** dengan chart yang lebih besar

#### **🔄 COMPARISON CHARTS**
**2 Comparison Chart:**
- **Temperature vs. Soil Moisture** - Korelasi antara suhu dan kelembaban tanah
- **Rain vs. Water Level** - Hubungan antara curah hujan dan tinggi air

#### **📄 EXPORT REPORTS**
- **Export to PDF** - Report lengkap dalam format PDF professional
- **Export to HTML** - Report dalam format HTML yang bisa dibuka di browser
- **Include charts dan statistics** dalam report
- **Custom date range** untuk report
