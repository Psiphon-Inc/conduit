import assert from "node:assert/strict";
import { join } from "node:path";
import { chromium } from "playwright";

import { ARTIFACT_ROOT, BASE_URL, ensureDir } from "./lib.mjs";

// Real app placements, local preference storage and lifecycle events; no backend
// credentials or account mutations. Keep this separate from skin visual state.
const output = ensureDir(join(ARTIFACT_ROOT, "hosted-promotion"));
const key = "hostedPromotionDismissedAt";
const start = Date.UTC(2026, 8, 14);
const cooldown = 60 * 24 * 60 * 60 * 1000;
const browser = await chromium.launch();
try {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(start);
    const home = page.getByTestId("home-hosted-promotion");
    const hero = page.getByTestId("hosted-setup-promotion");
    const close = page.getByRole("button", {
        name: "Dismiss hosting promotion for 60 days",
    });
    const setupAction = page.getByTestId("signin-google");
    async function navigate(path) {
        await page.goto(new URL(path, BASE_URL).toString());
    }
    async function resumeAt(time) {
        await page.clock.setFixedTime(time);
        // Drive the real web useAppIsActive subscription (the native equivalent
        // listens to AppState change). No provider hooks or cached state are stubbed.
        await page.evaluate(() => {
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                value: "hidden",
            });
            document.dispatchEvent(new Event("visibilitychange"));
        });
        await page.evaluate(() => {
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                value: "visible",
            });
            document.dispatchEvent(new Event("visibilitychange"));
        });
    }
    await navigate("/");
    await home.waitFor();
    await page.screenshot({ path: join(output, "home-before-dismiss.png") });
    const homeUrl = page.url();
    await close.click();
    await home.waitFor({ state: "detached" });
    assert.equal(
        page.url(),
        homeUrl,
        "Dismiss must not activate promo navigation",
    );
    await page.waitForFunction(
        (key) => localStorage.getItem(key) !== null,
        key,
    );
    assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), key),
        String(start),
    );

    await navigate("/hosted-setup");
    await setupAction.waitFor();
    assert.equal(
        await hero.count(),
        0,
        "Home dismissal must suppress hosted introduction, not sign-in",
    );
    await page.screenshot({
        path: join(output, "setup-dismissed-action-retained.png"),
    });
    await page.reload();
    await setupAction.waitFor();
    assert.equal(await hero.count(), 0, "Saved cooldown must survive reload");

    await resumeAt(start + cooldown - 1);
    assert.equal(
        await hero.count(),
        0,
        "Must remain suppressed until the full 60 days",
    );
    await resumeAt(start + cooldown);
    await hero.waitFor();
    await page.screenshot({
        path: join(output, "setup-promotion-returned.png"),
    });
    await close.click();
    await hero.waitFor({ state: "detached" });
    await page.waitForFunction(
        ({ key, timestamp }) => localStorage.getItem(key) === String(timestamp),
        { key, timestamp: start + cooldown },
    );
    await navigate("/");
    await page.getByTestId("nav-home").waitFor();
    assert.equal(
        await home.count(),
        0,
        "Hosted dismissal must also suppress Home",
    );

    // Navigation stays available after both promotional placements disappear.
    await page.getByTestId("nav-dashboard").click();
    await setupAction.waitFor(); // Web without a station routes its empty dashboard to setup.
    assert.equal(await hero.count(), 0);
    await resumeAt(start + 2 * cooldown);
    await hero.waitFor();
    await page.evaluate((key) => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (name, value) {
            if (name === key) throw new Error("Preference write unavailable");
            original.call(this, name, value);
        };
    }, key);
    await close.click();
    await hero.waitFor({ state: "detached" });
    assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), key),
        String(start + cooldown),
    );
    await setupAction.waitFor();
    assert.deepEqual(errors, [], "No uncaught app errors");
    await context.close();

    for (const raw of [String(start), "Infinity", String(start + 1)]) {
        const fresh = await browser.newContext({
            viewport: { width: 390, height: 844 },
            serviceWorkers: "block",
        });
        await fresh.addInitScript(
            ({ key, raw }) => {
                localStorage.setItem(key, raw);
                window.promotionPaints = 0;
                new MutationObserver(() => {
                    if (
                        document.querySelector(
                            '[data-testid="hosted-setup-promotion"]',
                        )
                    )
                        window.promotionPaints++;
                }).observe(document, { subtree: true, childList: true });
            },
            { key, raw },
        );
        const p = await fresh.newPage();
        await p.clock.setFixedTime(start);
        await p.goto(new URL("/hosted-setup", BASE_URL).toString());
        await p.getByTestId("signin-google").waitFor();
        if (raw === String(start)) {
            assert.equal(
                await p.getByTestId("hosted-setup-promotion").count(),
                0,
            );
            assert.equal(
                await p.evaluate(() => window.promotionPaints),
                0,
                "Hydration must not flash a previously dismissed promo",
            );
        } else {
            await p.getByTestId("hosted-setup-promotion").waitFor();
        }
        await fresh.close();
    }
    console.log(
        `Hosted promotion verification passed: shared dismissal, persistence, 60-day boundary/resume, repeat dismissal, retained setup/navigation, failed-write suppression, invalid data and no hydration flash. Captures: ${output}`,
    );
} finally {
    await browser.close();
}
