# Android / tablet support

This repo now includes a Capacitor-based Android wrapper.

## Intended flow
1. Build/export the web app
2. Sync Capacitor
3. Open Android Studio
4. Build APK/AAB

## Commands
- `npm install`
- `npm run build -w @alpha/web`
- export static assets or set up hosted WebView target
- `npm run android:sync -w @alpha/mobile`
- `npm run android:open -w @alpha/mobile`

## Tablet support
The web app should use responsive layouts and a multi-tab operator shell.
Android manifest sets resizeable activity so tablets and split-screen are supported.
