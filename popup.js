// Popup Script - Communicates with content script and manages settings
document.addEventListener('DOMContentLoaded', () => {
  const sensitivitySlider = document.getElementById('sensitivity');
  const sensitivityValue = document.getElementById('sensitivityValue');
  const sampleRateSlider = document.getElementById('sampleRate');
  const sampleRateValue = document.getElementById('sampleRateValue');
  const normalHoldFramesSlider = document.getElementById('normalHoldFrames');
  const normalHoldFramesValue = document.getElementById('normalHoldFramesValue');
  const showNotificationToggle = document.getElementById('showNotification');
  const resetBtn = document.getElementById('resetStats');
  const flashesDetectedEl = document.getElementById('flashesDetected');
  const videosProtectedEl = document.getElementById('videosProtected');
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');

  chrome.storage.sync.get(['sensitivity', 'sampleRate', 'normalHoldFrames', 'showNotification'], (result) => {
    if (result.sensitivity !== undefined) {
      sensitivitySlider.value = result.sensitivity;
      sensitivityValue.textContent = result.sensitivity;
    }
    if (result.sampleRate !== undefined) {
      sampleRateSlider.value = result.sampleRate;
      sampleRateValue.textContent = result.sampleRate;
    }
    if (result.normalHoldFrames !== undefined) {
      normalHoldFramesSlider.value = result.normalHoldFrames;
      normalHoldFramesValue.textContent = result.normalHoldFrames;
    }
    if (result.showNotification !== undefined) {
      showNotificationToggle.checked = result.showNotification;
    }
  });

  // Slider event listeners
  sensitivitySlider.addEventListener('input', (e) => {
    const value = e.target.value;
    sensitivityValue.textContent = value;
    chrome.storage.sync.set({ sensitivity: parseInt(value) });
    sendSettingsToContent();
  });

  sampleRateSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    sampleRateValue.textContent = value;
    chrome.storage.sync.set({ sampleRate: parseInt(value) });
    sendSettingsToContent();
  });

  normalHoldFramesSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    normalHoldFramesValue.textContent = value;
    chrome.storage.sync.set({ normalHoldFrames: parseInt(value) });
    sendSettingsToContent();
  });

  showNotificationToggle.addEventListener('change', (e) => {
    chrome.storage.sync.set({ showNotification: e.target.checked });
    sendSettingsToContent();
  });

  resetBtn.addEventListener('click', () => {
    chrome.storage.sync.set({ flashesDetected: 0, videosProtected: 0 });
    flashesDetectedEl.textContent = '0';
    videosProtectedEl.textContent = '0';
    chrome.runtime.sendMessage({ action: 'resetStats' });
  });

  // Send settings to content script
  function sendSettingsToContent() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateSettings',
          settings: {
            sensitivity: parseInt(sensitivitySlider.value),
            sampleRate: parseInt(sampleRateSlider.value),
            normalHoldFrames: parseInt(normalHoldFramesSlider.value),
            showNotification: showNotificationToggle.checked
          }
        });
      }
    });
  }

  // Check if on YouTube and get stats
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com')) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getStats' }, (response) => {
        if (response) {
          flashesDetectedEl.textContent = response.flashesDetected || 0;
          videosProtectedEl.textContent = response.videosProtected || 0;
        }
      });
    } else {
      statusDot.classList.remove('active');
      statusText.textContent = 'Not on YouTube';
    }
  });

  // Listen for stats updates from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'statsUpdate') {
      flashesDetectedEl.textContent = message.flashesDetected;
      videosProtectedEl.textContent = message.videosProtected;
    }
  });
});