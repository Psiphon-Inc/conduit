import assert from "node:assert/strict";
import { join } from "node:path";
import { chromium } from "playwright";

import {
    ARTIFACT_ROOT,
    BASE_URL,
    READY_SELECTOR,
    ensureDir,
    labUrl,
} from "./lib.mjs";

// Run against an exported web build with EXPO_PUBLIC_VISUAL_LAB=1, or Metro.
// No hosted account, backend, native tunnel, or saved browser profile is needed.
const output = ensureDir(join(ARTIFACT_ROOT, "skins"));
const browser = await chromium.launch();
try {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/settings", BASE_URL).toString());
    const current = page.getByRole("radio", {
        name: "Current (default)",
        exact: true,
    });
    const classic = page.getByRole("radio", {
        name: "Classic Dark",
        exact: true,
    });
    await current.waitFor();
    assert(await current.isChecked(), "Current must be the initial skin");
    await classic.check();
    assert(await classic.isChecked(), "Selection must apply immediately");
    await page.waitForFunction(
        () => localStorage.getItem("appSkin") === "classic-dark",
    );
    await page.screenshot({ path: join(output, "settings-classic-dark.png") });
    await page.reload();
    await page.waitForFunction(
        () => document.querySelector('input[value="classic-dark"]')?.checked,
    );

    // Browser-native radios supply Space and arrow-key selection, not only clicks.
    await current.focus();
    await page.keyboard.press("Space");
    await page.waitForFunction(
        () => localStorage.getItem("appSkin") === "current",
    );
    assert(await current.isChecked());
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
        () => localStorage.getItem("appSkin") === "classic-dark",
    );
    assert(await classic.isChecked());
    await page.getByTestId("nav-home").click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(output, "home-classic-dark.png") });

    await page.evaluate(() =>
        localStorage.setItem("appSkin", "unknown-future-skin"),
    );
    await page.goto(new URL("/settings", BASE_URL).toString());
    await page.waitForFunction(
        () => document.querySelector('input[value="current"]')?.checked,
    );
    await page.screenshot({ path: join(output, "settings-current.png") });

    const scenarios = [
        "single-off",
        "single-active",
        "two-first-contact",
        "three-idle",
        "lights-multi-lane",
        "provisioning-marker",
        "mini-active",
        "skybox-3",
    ];
    for (const skin of ["current", "classic-dark"]) {
        for (const scenario of scenarios) {
            await page.goto(labUrl({ skin, scenario, chrome: "0" }));
            await page.waitForSelector(READY_SELECTOR);
            await page
                .locator('[data-visualstage="native"]')
                .screenshot({ path: join(output, `${skin}-${scenario}.png`) });
        }
    }
    assert.equal(
        await page.evaluate(() => localStorage.getItem("appSkin")),
        "unknown-future-skin",
        "Visual lab previews must not change the saved preference",
    );
    assert.deepEqual(errors, [], "No uncaught browser errors");
    console.log(
        `Skin verification passed: selection, reload, keyboard, invalid storage, isolated previews and 16 scene captures in ${output}`,
    );
} finally {
    await browser.close();
}
