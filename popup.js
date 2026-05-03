// Popup Script - Communicates with content script and manages settings
document.addEventListener('DOMContentLoaded', () => {
  const sensitivitySlider = document.getElementById('sensitivity');
  const sensitivityValue = document.getElementById('sensitivityValue');
  const normalHoldFramesSlider = document.getElementById('normalHoldFrames');
  const normalHoldFramesValue = document.getElementById('normalHoldFramesValue');
  const showNotificationToggle = document.getElementById('showNotification');
  const protectionEnabledToggle = document.getElementById('protectionEnabled');
  const resetBtn = document.getElementById('resetStats');
  const flashesDetectedEl = document.getElementById('flashesDetected');
  const videosProtectedEl = document.getElementById('videosProtected');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusContainer = document.getElementById('status');

  chrome.storage.sync.get(['sensitivity', 'normalHoldFrames', 'showNotification', 'protectionEnabled'], (result) => {
    if (result.sensitivity !== undefined) {
      sensitivitySlider.value = result.sensitivity;
      sensitivityValue.textContent = result.sensitivity;
    }
    if (result.normalHoldFrames !== undefined) {
      normalHoldFramesSlider.value = result.normalHoldFrames;
      normalHoldFramesValue.textContent = result.normalHoldFrames;
    }
    if (result.showNotification !== undefined) {
      showNotificationToggle.checked = result.showNotification;
    }
    if (result.protectionEnabled !== undefined) {
      protectionEnabledToggle.checked = result.protectionEnabled;
    }
    updateStatus(result.protectionEnabled !== false);
  });

  sensitivitySlider.addEventListener('input', (e) => {
    const value = e.target.value;
    sensitivityValue.textContent = value;
    chrome.storage.sync.set({ sensitivity: parseInt(value) });
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

  protectionEnabledToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.sync.set({ protectionEnabled: enabled });
    updateStatus(enabled);
    sendToggleToContent(enabled);
  });

  resetBtn.addEventListener('click', () => {
    chrome.storage.sync.set({ flashesDetected: 0, videosProtected: 0 });
    flashesDetectedEl.textContent = '0';
    videosProtectedEl.textContent = '0';
    chrome.runtime.sendMessage({ action: 'resetStats' });
  });

  function updateStatus(enabled) {
    if (enabled) {
      statusContainer.classList.remove('disabled');
      statusDot.classList.add('active');
      statusText.textContent = 'Protection Active';
    } else {
      statusContainer.classList.add('disabled');
      statusDot.classList.remove('active');
      statusText.textContent = 'Protection Disabled';
    }
  }

  function sendSettingsToContent() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateSettings',
          settings: {
            sensitivity: parseInt(sensitivitySlider.value),
            normalHoldFrames: parseInt(normalHoldFramesSlider.value),
            showNotification: showNotificationToggle.checked
          }
        });
      }
    });
  }

  function sendToggleToContent(enabled) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleProtection',
          enabled: enabled
        });
      }
    });
  }

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

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'statsUpdate') {
      flashesDetectedEl.textContent = message.flashesDetected;
      videosProtectedEl.textContent = message.videosProtected;
    }
  });
});