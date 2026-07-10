const CACHE_PREFIX = "conduit-pwa";
const CACHE_VERSION = "v1";
const APP_SHELL_CACHE = `${CACHE_PREFIX}-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;
const APP_SHELL_URLS = [
    "/",
    "/index.html",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/apple-touch-icon.png",
    "/canvaskit/canvaskit.wasm",
];

self.addEventListener("install", (event) => {
    event.waitUntil(precacheAppShell());
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((cacheNames) =>
                Promise.all(
                    cacheNames
                        .filter(
                            (cacheName) =>
                                cacheName.startsWith(CACHE_PREFIX) &&
                                cacheName !== APP_SHELL_CACHE &&
                                cacheName !== RUNTIME_CACHE,
                        )
                        .map((cacheName) => caches.delete(cacheName)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);
    if (
        url.origin !== self.location.origin ||
        url.pathname === "/service-worker.js"
    ) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(networkFirstNavigation(request));
        return;
    }

    if (isStaticAssetRequest(request, url)) {
        event.respondWith(cacheFirst(request));
    }
});

async function networkFirstNavigation(request) {
    try {
        return await fetch(request);
    } catch {
        const cached = await caches.match("/index.html");
        if (cached) {
            return cached;
        }
        throw new Error("No cached app shell available");
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) {
        return cached;
    }

    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
    }
    return response;
}

function isStaticAssetRequest(request, url) {
    return (
        ["font", "image", "manifest", "script", "style", "worker"].includes(
            request.destination,
        ) ||
        /\.(?:avif|css|gif|ico|jpg|jpeg|js|png|svg|ttf|wasm|webp|woff|woff2)$/.test(
            url.pathname,
        )
    );
}

async function precacheAppShell() {
    const cache = await caches.open(APP_SHELL_CACHE);
    await cacheUrls(cache, APP_SHELL_URLS);
    await precacheIndexAssets(cache);
}

async function precacheIndexAssets(cache) {
    let response;
    try {
        response = await fetch("/index.html", { cache: "no-store" });
    } catch {
        return;
    }

    if (!response.ok) {
        return;
    }

    const clone = response.clone();
    await cache.put("/index.html", clone).catch(() => undefined);
    const html = await response.text().catch(() => "");
    await cacheUrls(cache, extractSameOriginAssetUrls(html));
}

async function cacheUrls(cache, urls) {
    await Promise.all(
        urls.map((url) => cache.add(url).catch(() => undefined)),
    );
}

function extractSameOriginAssetUrls(html) {
    const urls = new Set();
    const attributePattern = /\b(?:href|src)=["']([^"']+)["']/g;
    let match;

    while ((match = attributePattern.exec(html)) !== null) {
        try {
            const url = new URL(match[1], self.location.origin);
            if (
                url.origin === self.location.origin &&
                url.pathname !== "/service-worker.js"
            ) {
                urls.add(`${url.pathname}${url.search}`);
            }
        } catch {}
    }

    return [...urls];
}
