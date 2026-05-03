// YouTube Flash Protector - Content Script
// Ultra-fast detection using requestAnimationFrame

(function() {
  'use strict';

  let settings = {
    sensitivity: 170,
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
  let brightnessHistory = [];
  let animationFrameId = null;

  function init() {
    console.log('[Flash Protector] Starting...');
    
    chrome.storage.sync.get(settings, (result) => {
      settings = { ...settings, ...result };
      loadStats();
    });

    canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    canvas.width = 40;
    canvas.height = 22;
    ctx = canvas.getContext('2d');

    findVideo();
    chrome.runtime.onMessage.addListener(handleMessage);
    createWarningStyles();
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
    const selectors = ['video.html5-main-video', 'video.ytp-ad-module video', 'video'];
    
    for (const sel of selectors) {
      const v = document.querySelector(sel);
      if (v && v.readyState >= 2) {
        video = v;
        console.log('[Flash Protector] Video found');
        startMonitoring();
        return;
      }
    }
    setTimeout(findVideo, 500);
  }

  function startMonitoring() {
    if (!video) return;
    
    isFlashDetected = false;
    normalFrameCount = 0;
    wasAlreadyDetected = false;
    brightnessHistory = [];
    removeWarningOverlay();
    
    sampleLoop();
  }

  function sampleLoop() {
    if (!video || !isEnabled) {
      animationFrameId = requestAnimationFrame(sampleLoop);
      return;
    }

    if (!video.paused && !video.ended && video.readyState >= 2) {
      analyzeFrame();
    }

    animationFrameId = requestAnimationFrame(sampleLoop);
  }

  function analyzeFrame() {
    if (!video || !ctx) return;

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let totalBrightness = 0;
      const pixelCount = data.length / 4;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        totalBrightness += r * 0.299 + g * 0.587 + b * 0.114;
      }

      const avgBrightness = totalBrightness / pixelCount;

      // Track brightness to detect rapid increases
      brightnessHistory.push(avgBrightness);
      if (brightnessHistory.length > 3) brightnessHistory.shift();

      // Check for flash: high brightness OR rapid increase
      const brightnessThreshold = settings.sensitivity * 0.85;
      const prevBrightness = brightnessHistory.length > 1 ? brightnessHistory[brightnessHistory.length - 2] : 0;
      const rapidIncrease = brightnessHistory.length >= 2 && (avgBrightness - prevBrightness) > 30;

      const currentFrameHasFlash = avgBrightness > brightnessThreshold || rapidIncrease;

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
    } catch (e) {}
  }

  function triggerWarning() {
    isFlashDetected = true;

    if (!wasAlreadyDetected) {
      wasAlreadyDetected = true;
      stats.flashesDetected++;
      const currentVideoId = new URLSearchParams(window.location.search).get('v');
      if (currentVideoId) stats.videosProtected++;
      saveStats();
      notifyStatsUpdate();
      if (settings.showNotification) playNotificationSound();
    }

    showWarningOverlay();
  }

  function showWarningOverlay() {
    if (warningOverlay && warningOverlay.parentNode) return;

    warningOverlay = document.createElement('div');
    warningOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#000;z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    warningOverlay.innerHTML = '<div style="text-align:center;color:#fff;padding:40px;background:linear-gradient(135deg,rgba(255,100,100,.15),rgba(255,60,60,.1));border:2px solid rgba(255,100,100,.4);border-radius:20px;max-width:450px;"><div style="font-size:60px;margin-bottom:20px;">⚡</div><h2 style="font-size:26px;margin:0 0 12px;color:#ff6b6b;">Bright Flash Detected</h2><p style="font-size:16px;margin:0 0 8px;color:#ddd;">Protecting your eyes</p><p style="font-size:13px;color:#888;margin:0;">Video continues in background</p></div>';

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
      if (warningOverlay.parentNode) warningOverlay.remove();
      warningOverlay = null;
    }
  }

  function playNotificationSound() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.3);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 0.3);
    } catch (e) {}
  }

  function createWarningStyles() {
    const s = document.createElement('style');
    s.textContent = '#flash-protector-warning{position:fixed;top:0;left:0;right:0;bottom:0;background:#000;z-index:999999;display:flex;align-items:center;justify-content:center}';
    document.head.appendChild(s);
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
      if (isEnabled) startMonitoring();
      else { cancelAnimationFrame(animationFrameId); removeWarningOverlay(); }
      sendResponse({ success: true });
    }
    return true;
  }

  function notifyStatsUpdate() {
    chrome.runtime.sendMessage({ action: 'statsUpdate', flashesDetected: stats.flashesDetected, videosProtected: stats.videosProtected });
  }

  new MutationObserver(() => { if (!video || !document.contains(video)) findVideo(); }).observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();