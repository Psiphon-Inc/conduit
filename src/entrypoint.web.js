import "@expo/metro-runtime";
import { App } from "expo-router/build/qualified-entry";
import { renderRootComponent } from "expo-router/build/renderRootComponent";
import { polyfillWebCrypto } from "expo-standard-web-crypto";

polyfillWebCrypto();
registerServiceWorker();

// Nothing blocks first render anymore: the CanvasKit wasm fetch+compile
// that used to gate this call was removed with the Skia renderer.
renderRootComponent(App);

function registerServiceWorker() {
    if (
        process.env.NODE_ENV !== "production" ||
        !("serviceWorker" in navigator)
    ) {
        return;
    }

    const register = () => {
        navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    };

    if (document.readyState === "complete") {
        register();
    } else {
        window.addEventListener("load", register, { once: true });
    }
}
