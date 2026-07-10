import "@expo/metro-runtime";
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import { App } from "expo-router/build/qualified-entry";
import { renderRootComponent } from "expo-router/build/renderRootComponent";
import { polyfillWebCrypto } from "expo-standard-web-crypto";

polyfillWebCrypto();
registerServiceWorker();

LoadSkiaWeb({
    locateFile: (file) => `/canvaskit/${file}`,
})
    .then(() => {
        renderRootComponent(App);
    })
    .catch((error) => {
        console.error("Failed to load CanvasKit", error);
        renderSkiaLoadFailure();
    });

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

function renderSkiaLoadFailure() {
    const root = document.getElementById("root");
    if (!root) {
        return;
    }

    root.innerHTML = `
        <main style="box-sizing:border-box;display:flex;min-height:100%;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FEFEFE;color:#1F1A24;text-align:center;">
            <section style="max-width:420px;">
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;">Unable to load Conduit</h1>
                <p style="margin:0;font-size:16px;line-height:1.5;">The graphics engine did not finish loading. Check your connection and reload the app.</p>
            </section>
        </main>
    `;
}
