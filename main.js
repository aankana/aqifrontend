// AE Sensor Live Dashboard - Pure JS
const elements = {
  aqiValue: document.getElementById('aqi-value'),
  aqiCategory: document.getElementById('aqi-category'),
  aqiMoodIcon: document.getElementById('aqi-mood-icon'),
  aqiProgressBar: document.getElementById('aqi-progress-bar'),
  pm25Value: document.getElementById('pm25-value'),
  pm10Value: document.getElementById('pm10-value'),
  pm25ActualValue: document.getElementById('pm25-actual-value'),
  tempValue: document.getElementById('temp-value'),
  humidityValue: document.getElementById('humidity-value'),
  rawAvg: document.getElementById('raw-avg'),
  rawVar: document.getElementById('raw-var'),
  statusIndicator: document.getElementById('status-indicator'),
  statusText: document.getElementById('status-text'),
  lastUpdated: document.getElementById('last-updated'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  backendIpInput: document.getElementById('backend-ip'),
  saveSettingsBtn: document.getElementById('save-settings'),
  closeSettingsBtn: document.getElementById('close-settings')
};

// State
let config = {
  ip: localStorage.getItem('ae_sensor_ip') || '192.168.4.1',
  pollInterval: 2000,
  timer: null
};

// Initialize
elements.backendIpInput.value = config.ip;
startPolling();

// Polling Logic
function startPolling() {
  if (config.timer) clearInterval(config.timer);
  
  // Initial fetch
  fetchData();
  
  // Set interval
  config.timer = setInterval(fetchData, config.pollInterval);
}

async function fetchData() {
  const url = `http://${config.ip}/data`;
  
  try {
    const response = await fetch(url, { 
      mode: 'cors',
      cache: 'no-cache'
    });
    
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
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
  }
}

function updateUI(data) {
  // Update Values
  elements.aqiValue.textContent = data.pm2_5; 
  elements.pm25Value.textContent = data.pm2_5;
  elements.pm10Value.textContent = data.pm10;
  elements.pm25ActualValue.textContent = data.pm25;
  elements.tempValue.textContent = data.env.temp.toFixed(1);
  elements.humidityValue.textContent = data.env.humidity.toFixed(1);
  elements.rawAvg.textContent = data.features.avg;
  elements.rawVar.textContent = data.features.variance;
  
  // AQI Classification
  const category = data.aqi.toUpperCase();
  elements.aqiCategory.textContent = category;
  
  // Update Colors and Icons based on category
  updateAQIStyle(data.pm2_5, category);
  
  // Update Timestamp
  const now = new Date();
  elements.lastUpdated.textContent = `Last update: ${now.toLocaleTimeString()}`;
  
  // Flash effect on values
  document.querySelectorAll('.value').forEach(el => {
    el.classList.add('updated');
    setTimeout(() => el.classList.remove('updated'), 500);
  });
}

function updateAQIStyle(value, category) {
  let color = '#00f5d4';
  let icon = 'smile';
  let progress = Math.min((value / 300) * 100, 100);

  if (category.includes('GOOD')) {
    color = '#00f5d4';
    icon = 'smile';
  } else if (category.includes('MODERATE') || category.includes('SATISFACTORY')) {
    color = '#fee440';
    icon = 'meh';
  } else {
    color = '#ff5d8f';
    icon = 'frown';
  }

  elements.aqiCategory.style.color = color;
  elements.aqiProgressBar.style.width = `${progress}%`;
  elements.aqiProgressBar.style.backgroundColor = color;
  
  // Update Icon
  elements.aqiMoodIcon.setAttribute('data-lucide', icon);
  lucide.createIcons();
}

// Event Listeners
elements.settingsBtn.addEventListener('click', () => {
  elements.settingsModal.classList.remove('hidden');
});

elements.closeSettingsBtn.addEventListener('click', () => {
  elements.settingsModal.classList.add('hidden');
});

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

// Close modal on escape key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !elements.settingsModal.classList.contains('hidden')) {
    elements.settingsModal.classList.add('hidden');
  }
});
