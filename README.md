# Conduit

Conduit runs inproxy from [psiphon-tunnel-core](https://github.com/Psiphon-Labs/psiphon-tunnel-core). This repository targets a mobile app on Android, iOS, and Mac (via Catalyst), as well as a cross-platform CLI.

CLI and Mac releases are available on this repository's releases page. The Android mobile app is available on the Google Play store: https://play.google.com/store/apps/details?id=ca.psiphon.conduit. The iOS app is not currently released due to technical limitations.

For more information about Conduit, [visit the web site](https://conduit.psiphon.ca).

## React Native App

The React Native app is implemented in src/ and the relevant native folders (android/, ios/). This project uses expo, so follow the instructions there for setting up an expo development environment.

To run the app in a development environment, you need a psiphon config file. This can be obtained from Psiphon at conduit-oss@psiphon.ca.

Run the android client with:

```bash
npm install
npm run android
```

This starts a metro development server automatically.

## CLI App

See the [cli](./cli) folder for more details about the Conduit CLI.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for information about contributing to Conduit.

## Git LFS Usage

This project uses [Git LFS](https://git-lfs.github.com/) to manage large files such as the tunnel core libraries.

## Translations

For information about pulling and verifying translations, see [i18n/README.md](i18n/README.md).
