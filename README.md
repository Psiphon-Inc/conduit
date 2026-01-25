# Conduit App

Conduit is a mobile application that runs inproxy from [psiphon-tunnel-core](https://github.com/Psiphon-Labs/psiphon-tunnel-core), enabling users to volunteer their devices as proxy nodes to help users in censored regions access the internet. The app targets Android, iOS, and macOS (via Catalyst).

For more information about Conduit, [visit the website](https://conduit.psiphon.ca).

## Features

- **Mobile Inproxy Node**: Run a volunteer proxy node directly from your mobile device
- **Cross-Platform**: Supports Android, iOS, and macOS (Catalyst)
- **User-Friendly Interface**: Modern React Native UI with real-time statistics
- **Configurable Limits**: Adjust client limits and bandwidth settings
- **Multi-Language Support**: Internationalized with support for multiple languages
- **Secure**: Built on Psiphon's proven tunnel core technology

## Requirements

### Development

- **Node.js** (version specified in `.nvmrc` or `package.json` if present)
- **npm** or **yarn**
- **Expo CLI** (installed globally or via npx)
- **Git LFS** (for managing large binary files)
- **Android Studio** (for Android development)
- **Xcode** (for iOS/macOS development, macOS only)

### Runtime

- Android 5.0+ (API level 21+)
- iOS 13.0+
- macOS 11.0+ (for Catalyst)

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Psiphon-Labs/conduit.git
   cd conduit
   ```

2. **Install Git LFS** (if not already installed):
   ```bash
   git lfs install
   git lfs pull
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Install iOS dependencies** (macOS only):
   ```bash
   cd ios
   pod install
   cd ..
   ```

## Development

### Running the Development Server

Start the Expo development server:

```bash
npm run dev-server
```

### Running on Android

```bash
npm run android
```

This will:
- Generate the git hash
- Build and run the app on a connected Android device or emulator

### Running on iOS

```bash
npm run ios
```

This will:
- Generate the git hash
- Build and run the app on a connected iOS device or simulator

### Code Quality

Run the full check suite (tests, formatting, and type checking):

```bash
npm run check
```

Individual commands:

- **Format code:**
  ```bash
  npm run format
  ```

- **Type checking:**
  ```bash
  npm run tsc
  ```

- **Run tests:**
  ```bash
  npm test
  ```

## Building

### Android Release Build

```bash
npm run build-release
```

This generates a release APK in `android/app/build/outputs/apk/release/`.

### iOS Release Build

Use Xcode to build and archive the iOS app:
1. Open `ios/conduit.xcworkspace` in Xcode
2. Select the appropriate scheme and destination
3. Product → Archive

## Project Structure

```
conduit/
├── android/          # Android native code and configuration
├── ios/              # iOS native code and configuration
├── cli/              # Command-line interface (see cli/README.md)
├── src/              # React Native source code
│   ├── app/          # Expo Router app structure
│   ├── auth/         # Authentication and account management
│   ├── components/   # React components
│   ├── inproxy/      # Inproxy native module integration
│   ├── i18n/         # Internationalization
│   └── ...
├── assets/           # Images, fonts, and other assets
└── i18n/             # Translation management (see i18n/README.md)
```

## Technology Stack

- **React Native** 0.79.5
- **Expo** SDK 53
- **TypeScript**
- **Expo Router** (file-based routing)
- **React Native Skia** (for advanced graphics)
- **i18next** (internationalization)
- **React Query** (data fetching and state management)

## Git LFS Usage

This project uses [Git LFS](https://git-lfs.github.com/) to manage large files such as:
- Tunnel core libraries (native binaries)
- Large image assets

Make sure Git LFS is installed and initialized before cloning or pulling updates:

```bash
git lfs install
git lfs pull
```

## Translations

For information about pulling and verifying translations, see [i18n/README.md](i18n/README.md).

## CLI

This repository also includes a command-line interface for running Conduit nodes. For detailed information, see [cli/README.md](cli/README.md).

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### First-Time Contributors

When submitting your first pull request, you'll need to agree to the contributor license agreement. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE) for details.

## Related Projects

- [psiphon-tunnel-core](https://github.com/Psiphon-Labs/psiphon-tunnel-core) - The underlying tunnel core library
- [Conduit Website](https://conduit.psiphon.ca) - Official Conduit website

## SupportFor issues, questions, or contributions, please open an issue on GitHub or contact Psiphon at info@psiphon.ca.
