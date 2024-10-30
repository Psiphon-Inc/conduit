## Build

### First time setup

1. Replace `ios_embedded_server_entries.stub` and `ios_psiphon_config.stub` with the actual values.
2. Run `npm ci` to install dependencies (from `package-lock.json`).
3. Run `npm run ios`, this is required for a fresh clone to appropriate scripts for Cocoapods.

### Development instructions

- Run `pod install`.
- Run `npm run dev-server` to start the "Metro Bundler" node server. Note that your target device needs to be on the same network and able to reach the node server.
- Open `conduit.xcworkspace` in Xcode.
- Develop and build the app from Xcode on your target device.

