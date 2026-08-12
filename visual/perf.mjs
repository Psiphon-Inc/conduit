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
 * Web performance sweep for the orb renderers, driven through /orb-lab.
 *
 * Measures, per representative workload scenario:
 *   - UI-thread frame stats over a sampling window (via the dev-only
 *     [PERF] probe in src/common/perfProbe.ts, driven with live animation)
 *   - frozen mount-to-ready time
 * and, once per run:
 *   - page load timing and CanvasKit fetch+compile duration
 *
 * Usage:
 *   npm run visual:perf                     (defaults to renderer=skia)
 *   node visual/perf.mjs --renderer=native
 *
 * Requires the dev server (npm run visual:serve). Numbers are dev-bundle
 * numbers: useful for before/after comparison on the same machine, not as
 * absolute production performance. Results land in
 * artifacts/perf/web-perf-<renderer>.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

import {
    ARTIFACT_ROOT,
    BASE_URL,
    READY_SELECTOR,
    assertServerReachable,
    labUrl,
    parseArgs,
    stageSelector,
} from "./lib.mjs";

const args = parseArgs(process.argv);
const renderer = args.renderer ?? "skia";
const SAMPLE_MS = Number(args["sample-ms"] ?? 5000);
const STARTUP_RUNS = Number(args["startup-runs"] ?? 3);

/** Representative workloads from the migration plan's phase 0 list. */
const WORKLOADS = [
    { id: "single-active", label: "one idle orb" },
    { id: "lights-multi-lane", label: "three animated orbs + 7 lights" },
    { id: "lights-multiple", label: "five lights, one orb" },
    { id: "swap-050", label: "orb slot swap then idle" },
    { id: "scene-blur", label: "active orb behind scene blur" },
    { id: "mini-active", label: "hosted mini orb, active" },
];

await assertServerReachable();
const browser = await chromium.launch();

async function measureStartup() {
    const runs = [];
    for (let run = 0; run < STARTUP_RUNS; run++) {
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
        });
        const page = await context.newPage();
        const started = Date.now();
        await page.goto(
            labUrl({ scenario: "single-active", renderer, chrome: "0" }),
            { waitUntil: "load" },
        );
        await page.waitForSelector(READY_SELECTOR, { timeout: 120_000 });
        const readyMs = Date.now() - started;
        const timing = await page.evaluate(() => {
            const [nav] = performance.getEntriesByType("navigation");
            return {
                domContentLoadedMs: Math.round(
                    nav?.domContentLoadedEventEnd ?? 0,
                ),
                loadMs: Math.round(nav?.loadEventEnd ?? 0),
                canvasKitLoadMs:
                    window.__CANVASKIT_LOAD_MS__ != null
                        ? Math.round(window.__CANVASKIT_LOAD_MS__)
                        : null,
            };
        });
        runs.push({ ...timing, mountToReadyMs: readyMs });
        await context.close();
    }
    return runs;
}

async function measureWorkload(page, workload) {
    const url = labUrl({
        scenario: workload.id,
        renderer,
        chrome: "0",
        play: "1",
    });
    await page.goto(url, { waitUntil: "load" });
    await page
        .locator(stageSelector(renderer === "native" ? "native" : "skia"))
        .waitFor({ state: "visible", timeout: 60_000 });
    // Let mount springs/fades finish so the window measures steady state.
    await page.waitForTimeout(1500);

    const summaryPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error("no [PERF] summary received")),
            SAMPLE_MS + 15_000,
        );
        page.on("console", (message) => {
            const text = message.text();
            const index = text.indexOf("[PERF]");
            if (index === -1) {
                return;
            }
            try {
                const summary = JSON.parse(
                    text.slice(index + "[PERF]".length).trim(),
                );
                if (summary.label === `web:${workload.id}`) {
                    clearTimeout(timeout);
                    resolve(summary);
                }
            } catch {
                // Not a parsable summary line (e.g. probe-online beacon).
            }
        });
    });

    await page.evaluate(
        (label) => window.perfStart(label),
        `web:${workload.id}`,
    );
    await page.waitForTimeout(SAMPLE_MS);
    await page.evaluate(() => window.perfStop());
    const summary = await summaryPromise;
    return {
        scenario: workload.id,
        label: workload.label,
        durationMs: summary.durationMs,
        ...summary.ui,
    };
}

try {
    console.log(`renderer: ${renderer}  server: ${BASE_URL}\n`);
    const startup = await measureStartup();
    console.log("startup (mobile viewport):");
    for (const run of startup) {
        console.log(
            `  load ${run.loadMs}ms · canvaskit ${run.canvasKitLoadMs}ms · ` +
                `mount-to-ready ${run.mountToReadyMs}ms`,
        );
    }

    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const workloads = [];
    console.log(`\nframe stats (${SAMPLE_MS}ms live-animation windows):`);
    for (const workload of WORKLOADS) {
        try {
            const result = await measureWorkload(page, workload);
            workloads.push(result);
            console.log(
                `  ${workload.id.padEnd(20)} avg ${String(result.avgMs).padStart(6)}ms · ` +
                    `worst ${String(result.worstMs).padStart(6)}ms · ` +
                    `>20ms ${String(result.over20).padStart(3)} · ` +
                    `>33ms ${String(result.over33).padStart(3)} · ` +
                    `${result.frames} frames`,
            );
        } catch (error) {
            workloads.push({ scenario: workload.id, error: error.message });
            console.error(`  ${workload.id}: FAILED ${error.message}`);
        }
    }
    await context.close();

    const outDir = join(ARTIFACT_ROOT, "..", "perf");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `web-perf-${renderer}.json`);
    writeFileSync(
        outPath,
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                renderer,
                server: BASE_URL,
                sampleMs: SAMPLE_MS,
                startup,
                workloads,
            },
            null,
            2,
        ),
    );
    console.log(`\nwritten: ${outPath}`);
    if (workloads.some((workload) => workload.error)) {
        process.exitCode = 1;
    }
} finally {
    await browser.close();
}
