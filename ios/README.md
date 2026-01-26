## Build

### iOS deployment target

The minimum iOS version is **16.0**. React Native 0.79 and ExpoModulesCore require at least 15.1; we use 16.0 to match @shopify/react-native-skia's prebuilt binaries and avoid linker warnings.

The single source of truth is **`ios.deploymentTarget`** in `Podfile.properties.json`. The Podfile applies it to `platform :ios` and, in `post_install`, to the app target in the Xcode project. Do not set `IPHONEOS_DEPLOYMENT_TARGET` manually in `project.pbxproj`; it would be overwritten on `pod install`.

### First time setup

1. Replace `ios_embedded_server_entries.stub` and `ios_psiphon_config.stub` with the actual values. The bundled files `ios_embedded_server_entries` and `ios_psiphon_config` must contain real data (embedded server entries and Psiphon config). If `ios_embedded_server_entries` is empty, the in-proxy will fail to start with an explicit error.
   - **To test without real Psiphon resources:** set `EXPO_PUBLIC_USE_MOCK_INPROXY=1` in a `.env` file in the project root; the app will use the mocked in-proxy. See `src/inproxy/README.md`.
2. Run `npm ci` to install dependencies (from `package-lock.json`).
3. Run `npm run ios`, this is required for a fresh clone to appropriate scripts for Cocoapods.

### Development instructions

- Run `pod install`.
- Run `npm run dev-server` to start the "Metro Bundler" node server. Note that your target device needs to be on the same network and able to reach the node server.
- Open `conduit.xcworkspace` in Xcode.
- Develop and build the app from Xcode on your target device.

### Unit testing instructions

- Ensure versions of Xcode and Swift are compatible with [Swift Testing Framework](https://developer.apple.com/documentation/testing/).
- Run `pod install`.
- Do not run `npm run dev-server` as the bridge to this layer is simulated.
- Open `conduit.xcworkspace` in Xcode.
- Run tests from `Play` buttons in Test Navigator, or `conduitTests/conduitTests.swift` file.