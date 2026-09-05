# Native Collector app

This is the Android-focused Expo application for the collector experience. It must be run as an **Expo Development Build**, not Expo Go: the local TFLite dependency requires native code.

```powershell
cd collector-app
npm install
npx expo prebuild
npm run android
```

Before a device build, copy the approved `ml/models/classifier/material_classifier_v1.tflite` and its preprocessing metadata into an app asset directory and wire the classifier adapter to that binary. The existing model labels are contract-compatible; no confidence values are invented.
