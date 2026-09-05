# Native Collector app

This is the Android-focused Expo application for the collector experience. It must be run as an **Expo Development Build**, not Expo Go: the local TFLite dependency requires native code.

```powershell
cd collector-app
npm install
npx expo prebuild
npm run android
```

Set `EXPO_PUBLIC_API_BASE_URL` to the backend URL including `/v1` before starting the app. For an Android emulator, the default is `http://10.0.2.2:4000/v1`; a physical device must use the development machine's LAN address.

Before a device build, copy the approved `ml/models/classifier/material_classifier_v1.tflite` and its preprocessing metadata into an app asset directory and wire the classifier adapter to that binary. The existing model labels are contract-compatible; no confidence values are invented.
