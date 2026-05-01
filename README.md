# YouTube Flash Protector

A Chrome extension that protects photosensitive users from bright flashes in YouTube videos by displaying a protective overlay while the video continues playing in the background.

## Features

- **Automatic Flash Detection**: Uses canvas-based frame analysis to detect bright flashes
- **Non-Intrusive Protection**: Warning overlay appears while video continues in background
- **Flicker Prevention**: Configurable delay prevents warning stuttering on brief flashes
- **Customizable Sensitivity**: Adjust the brightness threshold to match your needs
- **Configurable Sample Rate**: Choose how often frames are analyzed (1-10 FPS)
- **Auto-Hide**: Warning automatically disappears once the flash ends
- **Audio Alert**: Optional notification sound when a flash is detected
- **Statistics Tracking**: See how many flashes have been detected and videos protected

## Installation

1. Open Google Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right corner)
3. Click "Load unpacked"
4. Select the `youtube-flash-protector` folder
5. The extension icon will appear in your Chrome toolbar

## Usage

1. Navigate to any YouTube video
2. Click the extension icon in your toolbar to open settings
3. Adjust sensitivity and other preferences:
   - **Brightness Threshold**: Lower values = more sensitive (detects dimmer flashes)
   - **Sample Rate**: Higher values = more responsive but uses more CPU
   - **Flash Detection Delay**: Number of consecutive flash frames before warning appears
   - **Normal Detection Delay**: Number of consecutive normal frames before warning hides
4. Watch videos safely! When a flash is detected, a protective overlay appears while the video continues in the background.

## How It Works

1. The extension injects a content script into YouTube pages
2. It creates a hidden canvas element for frame analysis
3. At regular intervals, it draws the current video frame to the canvas
4. The script analyzes pixel data from the center region of the frame
5. If brightness exceeds the threshold for multiple consecutive frames:
   - A full-screen warning overlay appears
   - The video continues playing in the background (muted visually by the overlay)
6. Once brightness returns to normal for multiple consecutive frames, the overlay auto-hides

## Recommended Settings for Photosensitivity

- **Brightness Threshold**: 150-170 (lower = more sensitive)
- **Sample Rate**: 3-5 FPS
- **Flash Detection Delay**: 3-5 frames
- **Normal Detection Delay**: 8-12 frames

## Technical Details

- **Manifest Version**: 3
- **Permissions**: ActiveTab, Storage (for settings)
- **Frame Analysis**: Low-resolution sampling (160x90) for performance
- **Center-Focus**: Analyzes center 60% of frame to ignore subtitles/UI
- **Flicker Prevention**: Requires consecutive frames to trigger/hide warning

## Files

```
youtube-flash-protector/
├── manifest.json      # Extension configuration
├── content.js        # Main detection logic
├── popup.html       # Settings UI
├── popup.css        # Styling
├── popup.js         # UI logic
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Browser Compatibility

- Google Chrome 88+
- Microsoft Edge (Chromium)
- Other Chromium-based browsers