// first import and run any polyfills
// then launch the router
import "expo-router/entry";
import { polyfillWebCrypto } from "expo-standard-web-crypto";

polyfillWebCrypto();
