// first import and run any polyfills
import { polyfillWebCrypto } from "expo-standard-web-crypto";
polyfillWebCrypto();

// then launch the router
import "expo-router/entry";
