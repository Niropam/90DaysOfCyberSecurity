# 📄 PDF Studio — Android

Android app that wraps the [PDF Studio web app](../pdf-reader) in a WebView.
The web app is the single source of truth: `app/build.gradle.kts` copies
`../pdf-reader` (HTML, CSS, JS and the vendored pdf.js / pdf-lib builds) into
the APK's assets on every build, so the two never drift apart.

## What the native layer adds

- Serves the app from `https://appassets.androidplatform.net` via
  `WebViewAssetLoader` — a secure context, required for ES modules and the
  pdf.js worker.
- Bridges the web app's *Open PDF* file input to the system document picker
  (`OpenDocument`).
- Saves the edited PDF through the Storage Access Framework: the page hands
  the bytes to the `AndroidBridge.savePdf` JavaScript interface and the user
  picks the destination (`CreateDocument`). WebViews can't download `blob:`
  URLs, which is why the bridge exists.

Everything runs on-device; the app needs **no permissions** (not even
Internet).

## Features

Same as the web app — sidebar navigation with **Read**, **Edit Text**,
**Insert Signature** (draw / type / upload), **Rearrange Pages**, and
**Download PDF**. On phone-sized screens the sidebar becomes a slide-in
drawer behind the ☰ button.

## Building

```bash
cd pdf-reader-android
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Requirements: JDK 17+, Android SDK 35 (a `local.properties` pointing at it,
or `ANDROID_HOME` set). Min SDK 26 (Android 8.0).
