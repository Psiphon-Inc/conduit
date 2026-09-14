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
    const trigger = page.getByTestId("skin-picker");
    const dropdown = page.getByTestId("skin-picker-dropdown");
    async function openPicker() {
        await trigger.click();
        await dropdown.waitFor();
    }
    async function expectClosed(label) {
        await dropdown.waitFor({ state: "detached" });
        assert((await trigger.getAttribute("aria-label")).includes(label));
        assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    }
    await trigger.waitFor();
    assert.equal(
        await current.count(),
        0,
        "Options must not occupy settings layout",
    );
    const rowBounds = await trigger.boundingBox();
    assert(rowBounds.height <= 64, "Appearance must be a single compact row");
    await openPicker();
    assert.deepEqual(
        await trigger.boundingBox(),
        rowBounds,
        "Opening overlay must not shift its row",
    );
    const menuBounds = await dropdown.boundingBox();
    assert(
        menuBounds.y >= rowBounds.y + rowBounds.height,
        "Dropdown should anchor below this row",
    );
    assert(
        menuBounds.y + menuBounds.height <= 844,
        "Dropdown must fit the viewport",
    );
    assert(await current.isChecked(), "Current must be the initial skin");
    await page.screenshot({
        path: join(output, "settings-dropdown-current.png"),
    });
    await page.keyboard.press("Escape");
    await expectClosed("Current (default)");
    await page.waitForFunction(
        () =>
            document.activeElement?.getAttribute("data-testid") ===
            "skin-picker",
    );
    await page.keyboard.press("Enter");
    await dropdown.waitFor();
    await page
        .getByTestId("skin-picker-backdrop")
        .click({ position: { x: 4, y: 4 } });
    await expectClosed("Current (default)");
    await openPicker();
    await classic.click();
    await expectClosed("Classic Dark");
    await page.waitForFunction(
        () => localStorage.getItem("appSkin") === "classic-dark",
    );
    await page.screenshot({ path: join(output, "settings-classic-dark.png") });
    await page.reload();
    await expectClosed("Classic Dark");

    // Browser-native radios supply Space and arrow-key selection, not only clicks.
    await openPicker();
    await page.waitForFunction(
        () => document.activeElement?.getAttribute("value") === "classic-dark",
    );
    await current.focus();
    await page.keyboard.press("Space");
    await page.waitForFunction(
        () => localStorage.getItem("appSkin") === "current",
    );
    await expectClosed("Current (default)");
    await openPicker();
    await page.waitForFunction(
        () => document.activeElement?.getAttribute("value") === "current",
    );
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
        () => localStorage.getItem("appSkin") === "classic-dark",
    );
    await expectClosed("Classic Dark");
    await openPicker();
    assert(await classic.isChecked());
    await page.screenshot({
        path: join(output, "settings-dropdown-classic-dark.png"),
    });
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
        const originalSetItem = Storage.prototype.setItem;
        window.restoreSkinStorage = () => {
            Storage.prototype.setItem = originalSetItem;
        };
        Storage.prototype.setItem = function (key, value) {
            if (key === "appSkin")
                throw new Error("Blocked skin preference write");
            originalSetItem.call(this, key, value);
        };
    });
    await openPicker();
    await current.click();
    await page.getByRole("alert").waitFor();
    await expectClosed("Current (default)");
    assert.deepEqual(
        await trigger.boundingBox(),
        rowBounds,
        "Save feedback must not expand the row",
    );
    await page.evaluate(() => window.restoreSkinStorage());
    await openPicker();
    await dropdown
        .getByText(
            "Skin applied, but could not be saved. Select it again to retry.",
        )
        .waitFor();
    await current.click(); // Already checked: onChange alone cannot perform this retry.
    await page.waitForFunction(
        () => localStorage.getItem("appSkin") === "current",
    );
    await page.getByRole("alert").waitFor({ state: "detached" });
    await expectClosed("Current (default)");
    await openPicker();
    await classic.click();
    await expectClosed("Classic Dark");
    await page.getByTestId("nav-home").click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(output, "home-classic-dark.png") });

    await page.evaluate(() =>
        localStorage.setItem("appSkin", "unknown-future-skin"),
    );
    await page.goto(new URL("/settings", BASE_URL).toString());
    await expectClosed("Current (default)");
    await page.screenshot({ path: join(output, "settings-current.png") });

    await openPicker();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectClosed("Current (default)");
    await openPicker();
    await page.waitForFunction(
        () => document.activeElement?.getAttribute("value") === "current",
    );
    await page.keyboard.press("Tab");
    assert(
        await page
            .getByRole("dialog")
            .evaluate((dialog) => dialog.contains(document.activeElement)),
        "Tab must remain inside the dropdown modal",
    );
    await page.screenshot({
        path: join(output, "settings-dropdown-desktop.png"),
    });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 360 });
    await openPicker();
    const shortMenu = await dropdown.boundingBox();
    assert(
        shortMenu.y >= 0 && shortMenu.y + shortMenu.height <= 360,
        "Short viewport dropdown must fit above or below the row",
    );
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });

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
        `Skin verification passed: compact anchored dropdown, dismissal/focus, selection, reload, keyboard, failed-write retry, invalid storage, isolated previews and 16 scene captures in ${output}`,
    );
} finally {
    await browser.close();
}
