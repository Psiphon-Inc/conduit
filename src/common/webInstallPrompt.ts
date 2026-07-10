export function isWebAppStandalone(): boolean {
    if (typeof window === "undefined") {
        return false;
    }

    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        ("standalone" in window.navigator &&
            Boolean(
                (window.navigator as Navigator & { standalone?: boolean })
                    .standalone,
            ))
    );
}

export function isIOSWebDevice(): boolean {
    if (typeof navigator === "undefined") {
        return false;
    }

    const platform = navigator.platform || "";
    const userAgent = navigator.userAgent || "";
    return (
        /iPad|iPhone|iPod/.test(platform) ||
        /iPad|iPhone|iPod/.test(userAgent) ||
        (platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
}
