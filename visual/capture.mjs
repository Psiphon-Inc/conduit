/*
 * Copyright (c) 2026, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

/**
 * Captures deterministic scenario screenshots from the /orb-lab route.
 *
 * Usage:
 *   node visual/capture.mjs --renderer=skia            -> artifacts current
 *   node visual/capture.mjs --renderer=native
 *   node visual/capture.mjs --renderer=skia --out=baselines   (explicit
 *     golden update; ordinary runs never touch visual/baselines/)
 *   node visual/capture.mjs --renderer=skia --scenario=swap-050
 *   node visual/capture.mjs --renderer=skia --viewport=mobile
 *
 * Requires the web app running (npm run web) at CONDUIT_WEB_URL
 * (default http://localhost:8081).
 */
import { join } from "node:path";
import { chromium } from "playwright";

import {
    BASELINE_ROOT,
    CURRENT_ROOT,
    READY_SELECTOR,
    VIEWPORTS,
    assertServerReachable,
    ensureDir,
    fetchScenarios,
    labUrl,
    parseArgs,
    stageSelector,
} from "./lib.mjs";

const args = parseArgs(process.argv);
const renderer = args.renderer ?? "skia";
if (renderer !== "skia" && renderer !== "native") {
    throw new Error(`--renderer must be skia or native, got: ${renderer}`);
}
const outMode = args.out ?? "current";
if (outMode !== "current" && outMode !== "baselines") {
    throw new Error(`--out must be current or baselines, got: ${outMode}`);
}
if (outMode === "baselines" && renderer !== "native") {
    throw new Error(
        "Only the production (native) renderer can be written to baselines; " +
            "the legacy Skia goldens under visual/baselines/skia are an archive",
    );
}
const outputRoot =
    outMode === "baselines"
        ? join(BASELINE_ROOT, renderer)
        : join(CURRENT_ROOT, renderer);

const scenarioFilter = args.scenario;
const viewportFilter = args.viewport;
const viewports = VIEWPORTS.filter(
    (viewport) => !viewportFilter || viewport.id === viewportFilter,
);
if (viewports.length === 0) {
    throw new Error(`Unknown viewport: ${viewportFilter}`);
}

await assertServerReachable();

const browser = await chromium.launch();
try {
    const bootstrapPage = await browser.newPage();
    let scenarios = await fetchScenarios(bootstrapPage);
    await bootstrapPage.close();
    if (scenarioFilter) {
        scenarios = scenarios.filter(
            (scenario) => scenario.id === scenarioFilter,
        );
        if (scenarios.length === 0) {
            throw new Error(`Unknown scenario: ${scenarioFilter}`);
        }
    }

    let captured = 0;
    const failures = [];
    for (const viewport of viewports) {
        const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 1,
            reducedMotion: "no-preference",
        });
        const page = await context.newPage();
        const outputDir = ensureDir(join(outputRoot, viewport.id));

        for (const scenario of scenarios) {
            const url = labUrl({
                scenario: scenario.id,
                renderer,
                viewport: viewport.id,
                chrome: "0",
            });
            const outputPath = join(outputDir, `${scenario.id}.png`);
            try {
                await page.goto(url, { waitUntil: "load" });
                await page.waitForSelector(READY_SELECTOR, {
                    timeout: 60_000,
                });
                const stage = page.locator(stageSelector(renderer));
                await stage.waitFor({ state: "visible", timeout: 10_000 });
                await stage.screenshot({ path: outputPath });
                captured += 1;
                console.log(`captured ${viewport.id}/${scenario.id}`);
            } catch (error) {
                failures.push({
                    scenario: scenario.id,
                    viewport: viewport.id,
                    url,
                    message: error.message,
                });
                console.error(
                    `FAILED  ${viewport.id}/${scenario.id}: ${error.message}`,
                );
            }
        }
        await context.close();
    }

    console.log(
        `\n${captured} screenshot(s) written to ${outputRoot}` +
            (outMode === "baselines" ? " (accepted goldens updated)" : ""),
    );
    if (failures.length > 0) {
        console.error(`\n${failures.length} capture(s) failed:`);
        for (const failure of failures) {
            console.error(
                `  ${failure.viewport}/${failure.scenario}  ${failure.url}`,
            );
        }
        process.exitCode = 1;
    }
} finally {
    await browser.close();
}
