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
 * Compares captured screenshots against the accepted Skia goldens.
 *
 * Usage:
 *   node visual/compare.mjs                  auto-detects current/native,
 *                                            falling back to current/skia
 *   node visual/compare.mjs --renderer=skia  explicit candidate renderer
 *
 * Never writes to visual/baselines/. Produces per-scenario difference heat
 * maps plus JSON and HTML reports under artifacts/visual-diff/.
 *
 * There is deliberately no universal pass/fail pixel threshold: CanvasKit
 * and DOM/SVG antialiasing legitimately differ, so tolerances are opt-in
 * per scenario via visual/tolerances.json:
 *
 *   { "mobile/swap-050": { "maxChangedPct": 1.5 }, ... }
 *
 * Exit code is non-zero only for missing images or explicit tolerance
 * violations. Human visual approval remains authoritative.
 */
import {
    existsSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import {
    BASELINE_ROOT,
    CURRENT_ROOT,
    DIFF_ROOT,
    PROJECT_ROOT,
    REPORT_ROOT,
    VIEWPORTS,
    ensureDir,
    parseArgs,
} from "./lib.mjs";

const args = parseArgs(process.argv);
// The accepted goldens are the native renderer's; the pre-migration Skia
// captures are retained as an archive and can be compared against with
// --baseline=skia while they remain useful.
const baselineRenderer =
    args.baseline ??
    (existsSync(join(BASELINE_ROOT, "native")) ? "native" : "skia");
const baselineDir = join(BASELINE_ROOT, baselineRenderer);
const candidateRenderer = args.renderer ?? "native";
const candidateDir = join(CURRENT_ROOT, candidateRenderer);

if (!existsSync(baselineDir)) {
    console.error(
        `No accepted goldens at ${baselineDir}.\n` +
            `Create them explicitly with: npm run visual:update-baselines`,
    );
    process.exit(1);
}
if (!existsSync(candidateDir)) {
    console.error(
        `No captured candidates at ${candidateDir}.\n` +
            `Capture them with: npm run visual:capture-${candidateRenderer}`,
    );
    process.exit(1);
}

const tolerancePath = join(PROJECT_ROOT, "visual", "tolerances.json");
const tolerances = existsSync(tolerancePath)
    ? JSON.parse(readFileSync(tolerancePath, "utf8"))
    : {};

const PIXELMATCH_OPTIONS = {
    // Perceptual YIQ color-distance threshold per pixel; tuned to ignore
    // subpixel antialiasing noise while catching real shape/color drift.
    threshold: 0.1,
    includeAA: false,
};

const results = [];
for (const viewport of VIEWPORTS) {
    const viewportBaselineDir = join(baselineDir, viewport.id);
    if (!existsSync(viewportBaselineDir)) {
        continue;
    }
    const diffDir = ensureDir(join(DIFF_ROOT, viewport.id));
    const baselineFiles = readdirSync(viewportBaselineDir)
        .filter((name) => name.endsWith(".png"))
        .sort();

    for (const fileName of baselineFiles) {
        const scenarioId = fileName.replace(/\.png$/, "");
        const key = `${viewport.id}/${scenarioId}`;
        const baselinePath = join(viewportBaselineDir, fileName);
        const candidatePath = join(candidateDir, viewport.id, fileName);
        const result = {
            key,
            scenario: scenarioId,
            viewport: viewport.id,
            baseline: relative(PROJECT_ROOT, baselinePath),
            candidate: relative(PROJECT_ROOT, candidatePath),
            status: "compared",
        };
        results.push(result);

        if (!existsSync(candidatePath)) {
            result.status = "missing-candidate";
            continue;
        }
        const baselinePng = PNG.sync.read(readFileSync(baselinePath));
        const candidatePng = PNG.sync.read(readFileSync(candidatePath));
        if (
            baselinePng.width !== candidatePng.width ||
            baselinePng.height !== candidatePng.height
        ) {
            result.status = "size-mismatch";
            result.baselineSize = `${baselinePng.width}x${baselinePng.height}`;
            result.candidateSize = `${candidatePng.width}x${candidatePng.height}`;
            continue;
        }

        const { width, height } = baselinePng;
        const diffPng = new PNG({ width, height });
        const changedPixels = pixelmatch(
            baselinePng.data,
            candidatePng.data,
            diffPng.data,
            width,
            height,
            PIXELMATCH_OPTIONS,
        );
        const diffPath = join(diffDir, fileName);
        writeFileSync(diffPath, PNG.sync.write(diffPng));

        const totalPixels = width * height;
        result.changedPixels = changedPixels;
        result.changedPct = (changedPixels / totalPixels) * 100;
        result.similarityPct = 100 - result.changedPct;
        result.diff = relative(PROJECT_ROOT, diffPath);

        const tolerance = tolerances[key];
        if (tolerance?.maxChangedPct != null) {
            result.maxChangedPct = tolerance.maxChangedPct;
            result.status =
                result.changedPct <= tolerance.maxChangedPct
                    ? "pass"
                    : "tolerance-exceeded";
        }
    }
}

// Candidates that have no accepted golden yet.
for (const viewport of VIEWPORTS) {
    const candidateViewportDir = join(candidateDir, viewport.id);
    if (!existsSync(candidateViewportDir)) {
        continue;
    }
    for (const fileName of readdirSync(candidateViewportDir)) {
        if (!fileName.endsWith(".png")) {
            continue;
        }
        const scenarioId = fileName.replace(/\.png$/, "");
        const key = `${viewport.id}/${scenarioId}`;
        if (!results.some((result) => result.key === key)) {
            results.push({
                key,
                scenario: scenarioId,
                viewport: viewport.id,
                candidate: relative(
                    PROJECT_ROOT,
                    join(candidateViewportDir, fileName),
                ),
                status: "missing-baseline",
            });
        }
    }
}

results.sort((a, b) => a.key.localeCompare(b.key));

ensureDir(REPORT_ROOT);
const report = {
    generatedAt: new Date().toISOString(),
    candidateRenderer,
    baseline: relative(PROJECT_ROOT, baselineDir),
    pixelmatch: PIXELMATCH_OPTIONS,
    results,
};
const reportJsonPath = join(REPORT_ROOT, "report.json");
writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));

const rowsHtml = results
    .map((result) => {
        const image = (label, path) =>
            path
                ? `<figure><figcaption>${label}</figcaption>` +
                  `<img loading="lazy" src="${"../".repeat(2)}${path.replaceAll("\\", "/")}" /></figure>`
                : "";
        const metrics =
            result.changedPct != null
                ? `${result.changedPct.toFixed(3)}% changed · ` +
                  `${result.similarityPct.toFixed(3)}% similar` +
                  (result.maxChangedPct != null
                      ? ` · tolerance ${result.maxChangedPct}%`
                      : "")
                : "";
        return `
<section class="row status-${result.status}">
  <h2>${result.key} <span class="status">${result.status}</span></h2>
  <p>${metrics}</p>
  <div class="images">
    ${image(`baseline (${baselineRenderer})`, result.baseline)}
    ${image(`candidate (${candidateRenderer})`, result.candidate)}
    ${image("difference heat map", result.diff)}
  </div>
</section>`;
    })
    .join("\n");

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Conduit visual comparison — ${candidateRenderer} vs ${baselineRenderer} goldens</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; background: #14121a; color: #eee; }
  h1 { font-size: 20px; }
  .row { border-top: 1px solid #333; padding: 16px 0; }
  .row h2 { font-size: 15px; }
  .status { font-weight: normal; opacity: 0.7; margin-left: 8px; }
  .status-tolerance-exceeded h2, .status-missing-candidate h2, .status-size-mismatch h2 { color: #ff8a80; }
  .status-pass h2 { color: #b9f6ca; }
  .images { display: flex; gap: 12px; flex-wrap: wrap; }
  figure { margin: 0; }
  figcaption { font-size: 12px; opacity: 0.7; margin-bottom: 4px; }
  img { max-width: 390px; max-height: 500px; background:
    repeating-conic-gradient(#222 0% 25%, #333 0% 50%) 0 0 / 16px 16px; }
</style>
</head>
<body>
<h1>Visual comparison — candidate: ${candidateRenderer} · baseline: ${baselineRenderer} goldens</h1>
<p>Generated ${report.generatedAt}. Perceptual per-pixel threshold ${PIXELMATCH_OPTIONS.threshold}. Heat maps are diagnostic aids; human approval is authoritative for metaball and glow states.</p>
${rowsHtml}
</body>
</html>`;
const reportHtmlPath = join(REPORT_ROOT, "report.html");
writeFileSync(reportHtmlPath, html);

const problems = results.filter((result) =>
    ["missing-candidate", "size-mismatch", "tolerance-exceeded"].includes(
        result.status,
    ),
);
for (const result of results) {
    const metric =
        result.changedPct != null
            ? `${result.changedPct.toFixed(3)}% changed`
            : "";
    console.log(
        `${result.status.padEnd(20)} ${result.key.padEnd(36)} ${metric}`,
    );
}
console.log(`\nJSON report: ${relative(PROJECT_ROOT, reportJsonPath)}`);
console.log(`HTML report: ${relative(PROJECT_ROOT, reportHtmlPath)}`);
if (problems.length > 0) {
    console.error(`\n${problems.length} comparison problem(s) found.`);
    process.exitCode = 1;
}
