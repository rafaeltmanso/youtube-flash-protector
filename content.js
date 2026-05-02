// YouTube Flash Protector - Content Script
// Monitors video brightness and shows warning overlay when flashes are detected

(function() {
  'use strict';

  let settings = {
    sensitivity: 200,
    sampleRate: 10,
    normalHoldFrames: 5,
    showNotification: true
  };

  let stats = {
    flashesDetected: 0,
    videosProtected: 0
  };

  let video = null;
  let canvas = null;
  let ctx = null;
  let warningOverlay = null;
  let isEnabled = true;
  let isFlashDetected = false;
  let normalFrameCount = 0;
  let wasAlreadyDetected = false;
  let lastSampleTime = 0;
  let animationFrameId = null;

  function init() {
    console.log('[Flash Protector] Initializing...');
    
    chrome.storage.sync.get(settings, (result) => {
      settings = { ...settings, ...result };
      loadStats();
    });

    canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    canvas.width = 80;
    canvas.height = 45;
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    findVideo();
    
    chrome.runtime.onMessage.addListener(handleMessage);
    createWarningStyles();
    
    console.log('[Flash Protector] Ready');
  }

  function loadStats() {
    chrome.storage.sync.get(['flashesDetected', 'videosProtected'], (result) => {
      stats.flashesDetected = result.flashesDetected || 0;
      stats.videosProtected = result.videosProtected || 0;
    });
  }

  function saveStats() {
    chrome.storage.sync.set({
      flashesDetected: stats.flashesDetected,
      videosProtected: stats.videosProtected
    });
  }

  function findVideo() {
    const selectors = [
      'video.html5-main-video',
      'video.ytp-ad-module video',
      'video.style-scope',
      '#movie_player video',
      'video'
    ];
    
    for (const sel of selectors) {
      const v = document.querySelector(sel);
      if (v && v.readyState >= 2) {
        video = v;
        console.log('[Flash Protector] Video found:', sel);
        startMonitoring();
        return;
      }
    }

    // Try again after a short delay
    setTimeout(findVideo, 1000);
  }

  function startMonitoring() {
    if (!video) return;
    
    console.log('[Flash Protector] Starting monitoring');
    
    isFlashDetected = false;
    normalFrameCount = 0;
    wasAlreadyDetected = false;
    removeWarningOverlay();
    
    lastSampleTime = performance.now();
    sampleLoop();
  }

  function sampleLoop() {
    if (!video || !isEnabled) {
      animationFrameId = requestAnimationFrame(sampleLoop);
      return;
    }

    const now = performance.now();
    const sampleInterval = 1000 / settings.sampleRate;

    if (now - lastSampleTime >= sampleInterval) {
      lastSampleTime = now;
      
      if (!video.paused && !video.ended && video.readyState >= 2) {
        analyzeFrame();
      }
    }

    animationFrameId = requestAnimationFrame(sampleLoop);
  }

  function analyzeFrame() {
    if (!video || !ctx) return;

    try {
      ctx.save();
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let totalBrightness = 0;
      let whitePixels = 0;
      const pixelCount = data.length / 4;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const brightness = r * 0.299 + g * 0.587 + b * 0.114;

        if (r > settings.sensitivity && g > settings.sensitivity && b > settings.sensitivity) {
          whitePixels++;
        }

        totalBrightness += brightness;
      }

      const avgBrightness = totalBrightness / pixelCount;
      const whitePercentage = (whitePixels / pixelCount) * 100;

      const brightnessThreshold = settings.sensitivity * 0.8;
      const whiteThreshold = 50;

      const currentFrameHasFlash = avgBrightness > brightnessThreshold || whitePercentage > whiteThreshold;

      if (currentFrameHasFlash) {
        if (!isFlashDetected) {
          triggerWarning();
        }
      } else if (isFlashDetected) {
        normalFrameCount++;
        if (normalFrameCount >= settings.normalHoldFrames) {
          hideWarning();
        }
      }
    } catch (e) {
      // CORS or other errors
    }
  }

  function triggerWarning() {
    isFlashDetected = true;

    if (!wasAlreadyDetected) {
      wasAlreadyDetected = true;
      stats.flashesDetected++;

      const currentVideoId = new URLSearchParams(window.location.search).get('v');
      if (currentVideoId) {
        stats.videosProtected++;
      }

      saveStats();
      notifyStatsUpdate();

      if (settings.showNotification) {
        playNotificationSound();
      }
    }

    showWarningOverlay();
  }

  function showWarningOverlay() {
    if (warningOverlay && warningOverlay.parentNode) return;

    warningOverlay = document.createElement('div');
    warningOverlay.id = 'flash-protector-warning';
    warningOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.92);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    warningOverlay.innerHTML = `
      <div class="flash-warning-container">
        <div class="flash-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            <circle cx="12" cy="12" r="4"/>
          </svg>
        </div>
        <h2>Bright Flash Detected</h2>
        <p class="warning-status">Protecting your eyes - video is playing in background</p>
        <p class="warning-hint">This overlay will auto-hide when the flash ends</p>
      </div>
    `;

    document.body.appendChild(warningOverlay);
  }

  function hideWarning() {
    removeWarningOverlay();
    isFlashDetected = false;
    wasAlreadyDetected = false;
    normalFrameCount = 0;
  }

  function removeWarningOverlay() {
    if (warningOverlay) {
      if (warningOverlay.parentNode) {
        warningOverlay.remove();
      }
      warningOverlay = null;
    }
  }

  function playNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {}
  }

  function createWarningStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #flash-protector-warning {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.92);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        opacity: 1;
        pointer-events: auto;

      .flash-warning-container {
        text-align: center;
        color: white;
        padding: 40px 50px;
        background: linear-gradient(135deg, rgba(255, 100, 100, 0.15), rgba(255, 60, 60, 0.1));
        border: 2px solid rgba(255, 100, 100, 0.4);
        border-radius: 20px;
        max-width: 450px;
        box-shadow: 0 0 60px rgba(255, 68, 68, 0.2);
      }

      .flash-icon {
        width: 80px;
        height: 80px;
        margin: 0 auto 20px;
        color: #ff6b6b;
        animation: flash-pulse 1.5s ease-in-out infinite;
      }

      .flash-icon svg {
        width: 100%;
        height: 100%;
      }

      @keyframes flash-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.8; transform: scale(1.05); }
      }

      .flash-warning-container h2 {
        font-size: 26px;
        margin-bottom: 12px;
        color: #ff6b6b;
        font-weight: 600;
      }

      .flash-warning-container .warning-status {
        font-size: 16px;
        color: #ddd;
        margin-bottom: 8px;
        line-height: 1.4;
      }

      .flash-warning-container .warning-hint {
        font-size: 13px;
        color: #888;
        margin-bottom: 0;
      }
    `;
    document.head.appendChild(style);
  }

  function handleMessage(message, sender, sendResponse) {
    if (message.action === 'updateSettings') {
      settings = { ...settings, ...message.settings };
      startMonitoring();
      sendResponse({ success: true });
    } else if (message.action === 'getStats') {
      sendResponse(stats);
    } else if (message.action === 'resetStats') {
      stats.flashesDetected = 0;
      stats.videosProtected = 0;
      saveStats();
      sendResponse({ success: true });
    } else if (message.action === 'toggleProtection') {
      isEnabled = message.enabled;
      if (isEnabled) {
        startMonitoring();
      } else if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        removeWarningOverlay();
      }
      sendResponse({ success: true });
    }
    return true;
  }

  function notifyStatsUpdate() {
    chrome.runtime.sendMessage({
      action: 'statsUpdate',
      flashesDetected: stats.flashesDetected,
      videosProtected: stats.videosProtected
    });
  }

  // Watch for video element changes
  const videoObserver = new MutationObserver(() => {
    if (!video || !document.contains(video)) {
      findVideo();
    }
  });

  if (document.body) {
    videoObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();