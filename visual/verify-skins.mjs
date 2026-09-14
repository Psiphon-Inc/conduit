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
        name: /^Classic Light(?: \(Current\))?$/,
    });
    const classic = page.getByRole("radio", {
        name: /^Classic Dark(?: \(Current\))?$/,
    });
    const trigger = page.getByTestId("skin-picker");
    const dropdown = page.getByTestId("skin-picker-dropdown");
    async function optionPaints() {
        return page.locator('input[name="app-skin"]').evaluateAll((inputs) =>
            inputs.map((input) => {
                const label = input.closest("label");
                return {
                    id: input.value,
                    text: getComputedStyle(label).color,
                    gradient: Array.from(label.querySelectorAll("div"))
                        .map((node) => getComputedStyle(node).backgroundImage)
                        .find((paint) => paint !== "none"),
                };
            }),
        );
    }
    async function openPicker() {
        await trigger.click();
        await dropdown.waitFor();
        for (const [radio, name] of [
            [current, "Classic Light"],
            [classic, "Classic Dark"],
        ]) {
            const expectedLabel = (await radio.isChecked())
                ? `${name} (Current)`
                : name;
            assert.equal(
                await page
                    .getByRole("radio", { name: expectedLabel, exact: true })
                    .count(),
                1,
                "Only the selected option must carry the accessible Current suffix",
            );
            assert.equal(
                await radio.evaluate((input) =>
                    input.closest("label").textContent.trim(),
                ),
                expectedLabel,
                "Visible and accessible option labels must match",
            );
        }
    }
    async function expectClosed(label) {
        await dropdown.waitFor({ state: "detached" });
        assert((await trigger.getAttribute("aria-label")).includes(label));
        assert(
            !(await trigger.getAttribute("aria-label")).includes("(Current)"),
            "Closed row must show only the skin name",
        );
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
    assert(await current.isChecked(), "Classic Light must be the initial skin");
    const initialOptionPaints = await optionPaints();
    assert.equal(initialOptionPaints[0].text, "rgb(35, 31, 32)");
    assert.equal(initialOptionPaints[1].text, "rgb(224, 224, 224)");
    for (const color of [
        "rgb(252, 223, 215)",
        "rgb(240, 224, 235)",
        "rgb(232, 223, 242)",
        "rgb(255, 255, 255)",
    ]) {
        assert(
            initialOptionPaints[0].gradient.includes(color),
            `Light option must show its complete screen gradient: ${color}`,
        );
    }
    for (const color of [
        "rgb(27, 19, 30)",
        "rgb(11, 24, 30)",
        "rgb(0, 0, 0)",
    ]) {
        assert(
            initialOptionPaints[1].gradient.includes(color),
            `Dark option must show its complete screen gradient: ${color}`,
        );
    }
    await page.screenshot({
        path: join(output, "settings-dropdown-current.png"),
    });
    await page.keyboard.press("Escape");
    await expectClosed("Classic Light");
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
    await expectClosed("Classic Light");
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
    await expectClosed("Classic Light");
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
    assert.deepEqual(
        await optionPaints(),
        initialOptionPaints,
        "Each option's preview must be independent of the selected skin",
    );
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
    await expectClosed("Classic Light");
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
    await expectClosed("Classic Light");
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
    await expectClosed("Classic Light");
    await page.screenshot({ path: join(output, "settings-current.png") });

    await openPicker();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectClosed("Classic Light");
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
        "appearance-controls",
    ];
    for (const skin of ["current", "classic-dark"]) {
        for (const scenario of scenarios) {
            await page.goto(labUrl({ skin, scenario, chrome: "0" }));
            await page.waitForSelector(READY_SELECTOR);
            if (scenario === "appearance-controls") {
                const notice = page.getByTestId("dashboard-plot-notice");
                const noticePaint = await notice.evaluate((button) => ({
                    surface: getComputedStyle(button).backgroundColor,
                    text: getComputedStyle(button.firstElementChild).color,
                }));
                assert.deepEqual(
                    noticePaint,
                    skin === "classic-dark"
                        ? {
                              surface: "rgb(35, 73, 90)",
                              text: "rgb(196, 215, 223)",
                          }
                        : {
                              surface: "rgba(255, 255, 255, 0.78)",
                              text: "rgb(25, 18, 36)",
                          },
                    "Local-off dashboard notice must have the skin's readable foreground/surface pair",
                );
                const gradientPaint = async (testID) =>
                    page.getByTestId(testID).evaluate((root) =>
                        Array.from(root.querySelectorAll("div"))
                            .map(
                                (node) =>
                                    getComputedStyle(node).backgroundImage,
                            )
                            .find((paint) => paint !== "none"),
                    );
                const dropdownPaint = await gradientPaint(
                    "preview-local-dropdown",
                );
                const buttonPaint = await gradientPaint(
                    "preview-hosted-primary",
                );
                if (skin === "classic-dark") {
                    assert(
                        dropdownPaint.includes("rgb(16, 22, 28)") &&
                            dropdownPaint.includes("rgb(35, 73, 90)"),
                        dropdownPaint,
                    );
                    assert(
                        buttonPaint.includes("rgb(35, 73, 90)") &&
                            buttonPaint.includes("rgb(46, 33, 50)"),
                        buttonPaint,
                    );
                } else {
                    assert(
                        dropdownPaint.includes("rgba(255, 255, 255, 0.94)"),
                        dropdownPaint,
                    );
                    assert(
                        buttonPaint.includes("rgb(126, 92, 184)"),
                        buttonPaint,
                    );
                }
            }
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
        `Skin verification passed: compact anchored dropdown, dismissal/focus, selection, reload, keyboard, failed-write retry, invalid storage, control gradient paint, isolated previews and 18 scene captures in ${output}`,
    );
} finally {
    await browser.close();
}
