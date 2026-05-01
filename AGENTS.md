# YouTube Flash Protector - Agent Guidance

## Loading the Extension

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked" → select this folder
4. After any code changes: click the reload icon on the extension card

## File Responsibilities

| File | Role |
|------|------|
| `manifest.json` | Extension config, declares content script + popup |
| `content.js` | Main detection logic - injected into YouTube pages |
| `popup.html/js/css` | Settings UI - user configures sensitivity, sample rate, delays |
| `chrome.storage.sync` | Settings persistence - shared between popup and content script |

## Key Technical Notes

- **Detection method**: Hidden 160x90 canvas samples video frames at configurable FPS
- **Analysis region**: Center 60% of frame (ignores subtitles/YouTube UI)
- **Flicker prevention**: Requires N consecutive flash/normal frames before showing/hiding overlay
- **Settings sync**: Content script loads settings via `chrome.storage.sync.get()` at init

## Recommended Settings for Photosensitivity

- Brightness Threshold: 150-170
- Sample Rate: 3-5 FPS
- Flash Detection Delay: 3-5 frames
- Normal Detection Delay: 8-12 frames