// ==========================================
// AE Sensor Live Dashboard - Pure JS
// ==========================================

// -----------------------------------------
// DOM Elements
// -----------------------------------------
const elements = {
    // Main Hero
    aqiValue: document.getElementById('aqi-value'),
    aqiCategory: document.getElementById('aqi-category'),
    aqiMoodIcon: document.getElementById('aqi-mood-icon'),
    aqiProgressBar: document.getElementById('aqi-progress-bar'),
    
    // Environment
    tempValue: document.getElementById('temp-value'),
    humidityValue: document.getElementById('humidity-value'),
    
    // Raw Values (Now in Advanced Section)
    pm25Value: document.getElementById('pm25-value'),
    pm10Value: document.getElementById('pm10-value'),
    pm25ActualValue: document.getElementById('pm25-actual-value'),
    rawAvg: document.getElementById('raw-avg'),
    rawVar: document.getElementById('raw-var'),
    
    // System & Nav
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    lastUpdated: document.getElementById('last-updated'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    backendIpInput: document.getElementById('backend-ip'),
    saveSettingsBtn: document.getElementById('save-settings'),
    closeSettingsBtn: document.getElementById('close-settings'),
    pollutantBtns: document.querySelectorAll('.pollutant-btn')
};

// -----------------------------------------
// Application State
// -----------------------------------------
let config = {
    ip: localStorage.getItem('ae_sensor_ip') || '127.0.0.1:8000',
    pollInterval: 1000, 
    timer: null,
    activePollutant: 'PM2.5',
    latestData: null,
    envUpdateTick: 0  // NEW: Counter to throttle the environment updates
};

// Chart & Buffer State
let chartConfig = {
    mode: 60,            // Default to 1 Hour (60 minutes)
    maxPoints: 60,       // Points on the graph
    secondsToBuffer: 60  // Seconds to wait before plotting a point (1 min)
};

// Independent storage for all three metrics (Continuous Background Tracking)
let historyState = {
    labels: Array(chartConfig.maxPoints).fill(''),
    'PM2.5': { data: Array(chartConfig.maxPoints).fill(null), buffer: [] },
    'PM10':  { data: Array(chartConfig.maxPoints).fill(null), buffer: [] },
    'PM25':  { data: Array(chartConfig.maxPoints).fill(null), buffer: [] }
};

let aqiChartInstance = null;

// -----------------------------------------
// Initialization
// -----------------------------------------
elements.backendIpInput.value = config.ip;
setupSelectors();
initChart();
startPolling();

// -----------------------------------------
// AQI Calculation Engine (CPCB Guidelines)
// -----------------------------------------
function calculateAQI(concentration, pollutant) {
    if (concentration === undefined || concentration === null) return { value: "--", category: "WAITING" };

    let breakpoints = [];
    
    if (pollutant === 'PM2.5') {
        if (concentration > 250) {
            return { value: Math.round(400 + (100/130) * (concentration - 250)), category: 'SEVERE' };
        }
        breakpoints = [
            { BPLo: 0, BPHi: 30, ILo: 0, IHi: 50, category: 'GOOD' },
            { BPLo: 31, BPHi: 60, ILo: 51, IHi: 100, category: 'SATISFACTORY' },
            { BPLo: 61, BPHi: 90, ILo: 101, IHi: 200, category: 'MODERATE' },
            { BPLo: 91, BPHi: 120, ILo: 201, IHi: 300, category: 'POOR' },
            { BPLo: 121, BPHi: 250, ILo: 301, IHi: 400, category: 'VERY POOR' }
        ];
    } else if (pollutant === 'PM10') {
        if (concentration > 430) {
            return { value: Math.round(400 + (100/70) * (concentration - 430)), category: 'SEVERE' }; 
        }
        breakpoints = [
            { BPLo: 0, BPHi: 50, ILo: 0, IHi: 50, category: 'GOOD' },
            { BPLo: 51, BPHi: 100, ILo: 51, IHi: 100, category: 'SATISFACTORY' },
            { BPLo: 101, BPHi: 250, ILo: 101, IHi: 200, category: 'MODERATE' },
            { BPLo: 251, BPHi: 350, ILo: 201, IHi: 300, category: 'POOR' },
            { BPLo: 351, BPHi: 430, ILo: 301, IHi: 400, category: 'VERY POOR' }
        ];
    } else {
        // PM25 has no standard AQI breakpoints, display raw value
        return { value: Math.round(concentration), category: 'RAW VALUE' };
    }

    // Apply Linear Interpolation Formula: Ip = [(IHi - ILo) / (BPHi - BPLo)] * (Cp - BPLo) + ILo
    for (let bp of breakpoints) {
        if (concentration >= bp.BPLo && concentration <= bp.BPHi) {
            const aqi = ((bp.IHi - bp.ILo) / (bp.BPHi - bp.BPLo)) * (concentration - bp.BPLo) + bp.ILo;
            return { value: Math.round(aqi), category: bp.category };
        }
    }
    
    return { value: "--", category: "WAITING" };
}

// -----------------------------------------
// Chart Initialization
// -----------------------------------------
function initChart() {
    const ctx = document.getElementById('aqiChart').getContext('2d');
    aqiChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: historyState.labels,
            datasets: [{
                label: 'Selected AQI Value',
                data: historyState[config.activePollutant].data, // Bind to active pollutant
                borderColor: '#00ffff',
                backgroundColor: 'rgba(0, 255, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, 
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a0aec0' }
                },
                x: {
                    grid: { display: false },
                    ticks: { display: false } 
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}

// -----------------------------------------
// Event Setup (Buttons & Toggles)
// -----------------------------------------
function setupSelectors() {
    // Pollutant Selectors (PM2.5, PM10, PM25)
    elements.pollutantBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            elements.pollutantBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            config.activePollutant = e.target.getAttribute('data-pollutant');
            
            // Swap chart's data pointer to the selected history bank (No wiping!)
            if (aqiChartInstance) {
                aqiChartInstance.data.datasets[0].data = historyState[config.activePollutant].data;
                aqiChartInstance.update();
            }
            
            if (config.latestData) updateUI(config.latestData);
        });
    });

    // Timeframe Selectors (1H vs 6H)
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const minutes = parseInt(e.target.getAttribute('data-time'));
            if (minutes === 60) {
                chartConfig.secondsToBuffer = 60; // 1 avg point every minute
                chartConfig.maxPoints = 60;       // 60 points total = 1 hour
            } else if (minutes === 360) {
                chartConfig.secondsToBuffer = 300; // 1 avg point every 5 mins
                chartConfig.maxPoints = 72;        // 72 points total = 6 hours
            }

            // Reset ALL memory banks because the timeframe scale changed
            historyState.labels = Array(chartConfig.maxPoints).fill('');
            ['PM2.5', 'PM10', 'PM25'].forEach(key => {
                historyState[key].data = Array(chartConfig.maxPoints).fill(null);
                historyState[key].buffer = [];
            });
            
            if (aqiChartInstance) {
                aqiChartInstance.data.labels = historyState.labels;
                aqiChartInstance.data.datasets[0].data = historyState[config.activePollutant].data;
                aqiChartInstance.update();
            }
        });
    });
}

// -----------------------------------------
// Network Polling Logic
// -----------------------------------------
function startPolling() {
    if (config.timer) clearInterval(config.timer);
    fetchData();
    config.timer = setInterval(fetchData, config.pollInterval);
}

async function fetchData() {
    const url = `http://${config.ip}/data`;
    try {
        const response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
        if (!response.ok) throw new Error('Network error');
        
        const data = await response.json();
        config.latestData = data; 
        updateUI(data);
        setConnectionStatus(true);
    } catch (error) {
        console.error('Fetch error:', error);
        setConnectionStatus(false);
    }
}

function setConnectionStatus(isConnected) {
    if (isConnected) {
        elements.statusIndicator.classList.remove('disconnected');
        elements.statusIndicator.classList.add('connected');
        elements.statusText.textContent = 'Live';
    } else {
        elements.statusIndicator.classList.remove('connected');
        elements.statusIndicator.classList.add('disconnected');
        elements.statusText.textContent = 'Offline';
        elements.aqiValue.textContent = '--';
        elements.aqiCategory.textContent = 'WAITING';
        elements.aqiCategory.style.color = 'var(--text-secondary)';
    }
}

// -----------------------------------------
// UI Rendering & Continuous Tracking
// -----------------------------------------
function updateUI(data) {
    // Populate Raw Value Cards (Updates every 1s)
    elements.pm25Value.textContent = data.pm2_5;
    elements.pm10Value.textContent = data.pm10;
    elements.pm25ActualValue.textContent = data.pm25;
    elements.rawAvg.textContent = data.features?.avg || data.avg || '--';
    elements.rawVar.textContent = data.features?.variance || data.variance || '--';
    
    // --- NEW: Throttled Environment Updates (Every 2s) ---
    config.envUpdateTick++;
    if (config.envUpdateTick % 2 === 0) {
        elements.tempValue.textContent = data.env?.temp?.toFixed(1) || data.temperature?.toFixed(1) || '--';
        elements.humidityValue.textContent = data.env?.humidity?.toFixed(1) || data.humidity?.toFixed(1) || '--';
        
        // Flash animation just for temp/humidity
        [elements.tempValue, elements.humidityValue].forEach(el => {
            el.classList.add('updated');
            setTimeout(() => el.classList.remove('updated'), 500);
        });
    }
    
    // --- CONTINUOUS BACKGROUND TRACKING LOGIC ---
    if (aqiChartInstance) {
        const streams = [
            { key: 'PM2.5', raw: data.pm2_5 },
            { key: 'PM10', raw: data.pm10 },
            { key: 'PM25', raw: data.pm25 }
        ];

        streams.forEach(stream => {
            const result = calculateAQI(stream.raw, stream.key);
            
            // Update main hero UI text for the *active* pollutant
            if (stream.key === config.activePollutant) {
                elements.aqiValue.textContent = result.value;
                elements.aqiCategory.textContent = result.category;
                updateAQIStyle(result.value, result.category);
            }
            
            // Store the data in the background buffer
            if (result.value !== "--") {
                historyState[stream.key].buffer.push(result.value);

                if (historyState[stream.key].data.every(val => val === null)) {
                    historyState[stream.key].data[chartConfig.maxPoints - 1] = result.value;
                }

                if (historyState[stream.key].buffer.length >= chartConfig.secondsToBuffer) {
                    const average = historyState[stream.key].buffer.reduce((a, b) => a + b, 0) / historyState[stream.key].buffer.length;
                    historyState[stream.key].data.push(Math.round(average));
                    historyState[stream.key].data.shift(); 
                    historyState[stream.key].buffer = []; 
                }
            }
        });

        aqiChartInstance.update();
    }

    // Timestamp
    const now = new Date();
    elements.lastUpdated.textContent = `Last update: ${now.toLocaleTimeString()}`;
    
    // Visual Flash for the fast 1-second metrics
    const fastMetrics = [elements.aqiValue, elements.pm25Value, elements.pm10Value, elements.pm25ActualValue];
    fastMetrics.forEach(el => {
        el.classList.add('updated');
        setTimeout(() => el.classList.remove('updated'), 500);
    });
}

// -----------------------------------------
// Styling Helpers
// -----------------------------------------
function updateAQIStyle(value, category) {
    let color = '#a0aec0'; 
    let icon = 'help-circle';
    let progress = 0;

    if (value !== "--") {
        progress = Math.min((value / 500) * 100, 100);
    }

    if (category.includes('GOOD')) {
        color = '#00f5d4';
        icon = 'smile';
    } else if (category.includes('SATISFACTORY')) {
        color = '#94d2bd';
        icon = 'smile';
    } else if (category.includes('MODERATE')) {
        color = '#fee440';
        icon = 'meh';
    } else if (category.includes('POOR') && !category.includes('VERY')) {
        color = '#f4a261';
        icon = 'frown';
    } else if (category.includes('VERY POOR')) {
        color = '#e76f51';
        icon = 'frown';
    } else if (category.includes('SEVERE')) {
        color = '#ff5d8f';
        icon = 'alert-triangle';
    } else if (category === 'RAW VALUE') {
        color = '#00ffff';
        icon = 'database';
        progress = Math.min((value / 100) * 100, 100); 
    }

    elements.aqiCategory.style.color = color;
    elements.aqiProgressBar.style.width = `${progress}%`;
    elements.aqiProgressBar.style.backgroundColor = color;
    
    elements.aqiMoodIcon.setAttribute('data-lucide', icon);
    lucide.createIcons();
}

// -----------------------------------------
// Modal Event Listeners
// -----------------------------------------
elements.settingsBtn.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
elements.closeSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));

elements.saveSettingsBtn.addEventListener('click', () => {
    const newIp = elements.backendIpInput.value.trim();
    if (newIp) {
        config.ip = newIp;
        localStorage.setItem('ae_sensor_ip', config.ip);
        elements.settingsModal.classList.add('hidden');
        elements.statusText.textContent = 'Reconnecting...';
        startPolling();
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elements.settingsModal.classList.contains('hidden')) {
        elements.settingsModal.classList.add('hidden');
    }
});

// =========================================
// UI DESIGNER TEST MODE
// =========================================
// UNCOMMENT the "runMockTest();" line below to see the dashboard animate 
// without needing the .exe simulator!

function runMockTest() {
    console.log("🛠️ Running in Mock UI Test Mode...");
    if (config.timer) clearInterval(config.timer);
    
    // Force graph to draw quickly for visual testing
    chartConfig.secondsToBuffer = 1; 
    
    setInterval(() => {
        const basePM25 = 80 + (Math.sin(Date.now() / 10000) * 40); 
        
        const mockData = {
            pm2_5: Math.round(basePM25 + (Math.random() * 10 - 5)),
            pm10: Math.round(basePM25 * 1.5 + (Math.random() * 15 - 7.5)),
            pm25: Math.round(basePM25 * 2.2 + (Math.random() * 20 - 10)),
            env: {
                temp: 26.0 + (Math.random() * 2 - 1),
                humidity: 65.0 + (Math.random() * 4 - 2)
            },
            features: {
                avg: Math.floor(Math.random() * 500) + 1000,
                variance: Math.floor(Math.random() * 50) + 10
            }
        };

        config.latestData = mockData;
        updateUI(mockData);
        setConnectionStatus(true);
        
    }, 1000); 
}

 runMockTest();