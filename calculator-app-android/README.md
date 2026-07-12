# Omni Calculator — Android app

Native Android wrapper for the [Omni Calculator web app](../calculator-app/). All features work on Android:

- 🧮 Standard calculator (with on-screen keypad)
- 📅 Date & time calculators (difference, add/subtract, age)
- 📏⚖️🚀🧪🌡️ Length, weight, speed, volume and temperature converters (metric, US & imperial)
- 💱 Currency converter with live rates (offline fallback included)
- 🕐 Live time, date and local-temperature widgets (uses the device's location with a proper Android permission prompt)
- 🌓 Light/dark theme

## How it works

The app hosts `calculator-app/index.html` in a `WebView`, served via `WebViewAssetLoader`
at `https://appassets.androidplatform.net/...` so the page runs in a **secure context**
(required for `navigator.geolocation`). The HTML file is copied from `../calculator-app/`
into the APK's assets automatically at build time — the web app stays the single source
of truth, nothing is duplicated.

`MainActivity` bridges the browser geolocation prompt to the Android runtime
location permission, so the temperature widget shows the standard system
"Allow location?" dialog the first time.

| | |
|---|---|
| Language | Kotlin |
| Min SDK | 26 (Android 8.0) |
| Target SDK | 35 (Android 15) |
| Build | Gradle 8.14.3 · AGP 8.7.3 · Kotlin 2.0.21 |
| Permissions | `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` |

## Build & run

### Option 1 — Android Studio (easiest)
1. Open the `calculator-app-android` folder in Android Studio (Ladybug or newer).
2. Let Gradle sync finish.
3. Press **Run ▶** with a device or emulator connected.

### Option 2 — Command line
Requires the Android SDK (`ANDROID_HOME` set or a `local.properties` file):

```bash
cd calculator-app-android
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Release build
```bash
./gradlew assembleRelease   # sign with your own keystore for Play Store distribution
```

## Notes

- Internet is only needed for live currency rates and the weather widget; the calculator, date tools, and all unit converters work fully offline.
- If you deny the location permission, everything else still works — the temperature widget simply shows "Location denied".
