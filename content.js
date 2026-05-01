// YouTube Flash Protector - Content Script
// Analyzes video frames for brightness and shows warning overlay when flash is detected

(function() {
  'use strict';

  // Default settings
  let settings = {
    sensitivity: 200,      // Brightness threshold (0-255)
    sampleRate: 3,        // Frames per second to sample
    flashHoldFrames: 5,    // Consecutive frames with flash to trigger warning (reduces flicker)
    normalHoldFrames: 10,  // Consecutive frames normal to hide warning
    showNotification: true // Play notification sound
  };

  // Stats
  let stats = {
    flashesDetected: 0,
    videosProtected: 0
  };

  // State
  let video = null;
  let canvas = null;
  let ctx = null;
  let warningOverlay = null;
  let sampleInterval = null;
  let isEnabled = true;
  let isFlashDetected = false;
  let flashFrameCount = 0;
  let normalFrameCount = 0;
  let wasAlreadyDetected = false; // Track if we already counted this flash episode

  // Initialize the extension
  function init() {
    // Load settings from storage
    chrome.storage.sync.get(settings, (result) => {
      settings = { ...settings, ...result };
      loadStats();
    });

    // Create hidden canvas for frame analysis
    canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    canvas.width = 160;  // Low resolution for performance
    canvas.height = 90;
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Find and monitor video
    monitorVideo();

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(handleMessage);

    // Create warning overlay styles
    createWarningStyles();
  }

  // Load stats from storage
  function loadStats() {
    chrome.storage.sync.get(['flashesDetected', 'videosProtected'], (result) => {
      stats.flashesDetected = result.flashesDetected || 0;
      stats.videosProtected = result.videosProtected || 0;
    });
  }

  // Save stats to storage
  function saveStats() {
    chrome.storage.sync.set({
      flashesDetected: stats.flashesDetected,
      videosProtected: stats.videosProtected
    });
  }

  // Monitor for video element changes
  function monitorVideo() {
    // MutationObserver to detect dynamically loaded videos
    const observer = new MutationObserver(() => {
      const newVideo = document.querySelector('video.html5-main-video');
      if (newVideo && newVideo !== video) {
        video = newVideo;
        startMonitoring();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Check if video already exists
    video = document.querySelector('video.html5-main-video');
    if (video) {
      startMonitoring();
    }
  }

  // Start monitoring the video
  function startMonitoring() {
    // Clear any existing monitoring
    if (sampleInterval) {
      clearInterval(sampleInterval);
    }

    // Reset state for new video
    isFlashDetected = false;
    flashFrameCount = 0;
    normalFrameCount = 0;
    wasAlreadyDetected = false;
    removeWarningOverlay();

    // Start sampling frames
    const intervalMs = 1000 / settings.sampleRate;
    sampleInterval = setInterval(sampleFrame, intervalMs);
  }

  // Sample a video frame and analyze brightness
  function sampleFrame() {
    if (!video || !isEnabled || video.paused || video.ended) {
      return;
    }

    try {
      // Draw current frame to canvas (mirrored for YouTube's mirrored videos)
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      // Get pixel data from center region only (to ignore subtitles/UI)
      const centerX = Math.floor(canvas.width * 0.2);
      const centerY = Math.floor(canvas.height * 0.2);
      const centerW = Math.floor(canvas.width * 0.6);
      const centerH = Math.floor(canvas.height * 0.6);

      const imageData = ctx.getImageData(centerX, centerY, centerW, centerH);
      const data = imageData.data;

      // Calculate average brightness and white pixel percentage
      let totalBrightness = 0;
      let whitePixels = 0;
      const pixelCount = data.length / 4;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Calculate perceived brightness
        const brightness = (r * 0.299 + g * 0.587 + b * 0.114);

        // Check if pixel is "white" (high values in all channels)
        if (r > settings.sensitivity && g > settings.sensitivity && b > settings.sensitivity) {
          whitePixels++;
        }

        totalBrightness += brightness;
      }

      const avgBrightness = totalBrightness / pixelCount;
      const whitePercentage = (whitePixels / pixelCount) * 100;

      // Detect flash: high average brightness OR significant white area
      const brightnessThreshold = settings.sensitivity * 0.8;
      const whiteThreshold = 50; // 50% white pixels triggers protection

      const currentFrameHasFlash = avgBrightness > brightnessThreshold || whitePercentage > whiteThreshold;

      if (currentFrameHasFlash) {
        // Flash detected in this frame
        flashFrameCount++;
        normalFrameCount = 0;

        // Only trigger warning after consecutive flash frames (reduces flicker/stutter)
        if (flashFrameCount >= settings.flashHoldFrames && !isFlashDetected) {
          triggerWarning(avgBrightness, whitePercentage);
        }
      } else {
        // Normal frame
        normalFrameCount++;
        flashFrameCount = 0;

        // Only hide warning after consecutive normal frames
        if (normalFrameCount >= settings.normalHoldFrames && isFlashDetected) {
          hideWarning();
        }
      }
    } catch (e) {
      // CORS or other errors - ignore
    }
  }

  // Trigger flash warning (video keeps playing)
  function triggerWarning(avgBrightness, whitePercentage) {
    isFlashDetected = true;

    // Count as a new flash episode (only once per episode)
    if (!wasAlreadyDetected) {
      wasAlreadyDetected = true;
      stats.flashesDetected++;

      // Increment videos protected only if this is a new video
      const currentVideoId = new URLSearchParams(window.location.search).get('v');
      if (currentVideoId) {
        stats.videosProtected++;
      }

      saveStats();
      notifyStatsUpdate();

      // Play notification sound if enabled
      if (settings.showNotification) {
        playNotificationSound();
      }
    }

    // Show warning overlay (video continues in background)
    showWarningOverlay();
  }

  // Show warning overlay
  function showWarningOverlay() {
    // Don't recreate if already exists
    if (warningOverlay && warningOverlay.parentNode) {
      // Update status text to show "Detecting..."
      const statusEl = warningOverlay.querySelector('.warning-status');
      if (statusEl) {
        statusEl.textContent = 'Bright flash detected - protecting your eyes';
      }
      return;
    }

    warningOverlay = document.createElement('div');
    warningOverlay.id = 'flash-protector-warning';
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

    // Trigger fade-in animation after a tiny delay
    requestAnimationFrame(() => {
      if (warningOverlay) {
        warningOverlay.classList.add('visible');
      }
    });
  }

  // Hide warning overlay
  function hideWarning() {
    if (warningOverlay) {
      warningOverlay.classList.remove('visible');
      // Remove after transition completes
      setTimeout(() => {
        removeWarningOverlay();
      }, 300); // Match the transition duration
    }
    isFlashDetected = false;
    wasAlreadyDetected = false;
    normalFrameCount = 0;
  }

  // Remove warning overlay
  function removeWarningOverlay() {
    if (warningOverlay) {
      if (warningOverlay.parentNode) {
        warningOverlay.remove();
      }
      warningOverlay = null;
    }
  }

  // Play notification sound
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
    } catch (e) {
      // Audio not supported
    }
  }

  // Create warning overlay styles
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
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
        pointer-events: none;
      }

      #flash-protector-warning.visible {
        opacity: 1;
        pointer-events: auto;
      }

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

  // Handle messages from popup
  function handleMessage(message, sender, sendResponse) {
    if (message.action === 'updateSettings') {
      settings = { ...settings, ...message.settings };
      // Restart monitoring with new settings
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
      } else if (sampleInterval) {
        clearInterval(sampleInterval);
        removeWarningOverlay();
      }
      sendResponse({ success: true });
    }
    return true;
  }

  // Notify popup of stats update
  function notifyStatsUpdate() {
    chrome.runtime.sendMessage({
      action: 'statsUpdate',
      flashesDetected: stats.flashesDetected,
      videosProtected: stats.videosProtected
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();