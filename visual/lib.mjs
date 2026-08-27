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
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BASELINE_ROOT = join(PROJECT_ROOT, "visual", "baselines");
export const ARTIFACT_ROOT = join(PROJECT_ROOT, "artifacts", "visual-diff");
export const CURRENT_ROOT = join(ARTIFACT_ROOT, "current");
export const DIFF_ROOT = join(ARTIFACT_ROOT, "diff");
export const REPORT_ROOT = join(ARTIFACT_ROOT, "reports");

// Default matches `npm run visual:serve`. The capture browser is always the
// Playwright-managed headless Chromium with an ephemeral profile — it never
// launches or reads the developer's own Chrome installation or profiles.
export const BASE_URL = process.env.CONDUIT_WEB_URL ?? "http://localhost:8090";

export const VIEWPORTS = [
    { id: "mobile", width: 390, height: 844 },
    { id: "desktop", width: 1280, height: 800 },
];

export const READY_SELECTOR = '[data-visualready="true"]';

export function stageSelector(renderer) {
    return `[data-visualstage="${renderer}"]`;
}

export function labUrl(params) {
    const url = new URL("/orb-lab", BASE_URL);
    for (const [key, value] of Object.entries(params)) {
        if (value != null) {
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}

export function parseArgs(argv) {
    const args = {};
    for (const raw of argv.slice(2)) {
        const match = /^--([a-z-]+)(?:=(.*))?$/.exec(raw);
        if (!match) {
            throw new Error(`Unrecognized argument: ${raw}`);
        }
        args[match[1]] = match[2] ?? true;
    }
    return args;
}

export function ensureDir(path) {
    mkdirSync(path, { recursive: true });
    return path;
}

export async function assertServerReachable() {
    try {
        const response = await fetch(BASE_URL, { redirect: "manual" });
        if (response.status >= 500) {
            throw new Error(`Server responded with ${response.status}`);
        }
    } catch (error) {
        throw new Error(
            `Cannot reach the Conduit web app at ${BASE_URL} (${error.message}).\n` +
                `Start it first with: npm run web\n` +
                `Or point CONDUIT_WEB_URL at a running instance.`,
        );
    }
}

/** Reads the scenario registry from the lab page (single source of truth). */
export async function fetchScenarios(page) {
    await page.goto(labUrl({ chrome: "0" }), { waitUntil: "load" });
    await page.waitForFunction(
        () => Array.isArray(window.__ORB_VISUAL_SCENARIOS__),
        undefined,
        { timeout: 120_000 },
    );
    const scenarios = await page.evaluate(
        () => window.__ORB_VISUAL_SCENARIOS__,
    );
    if (!scenarios?.length) {
        throw new Error("Lab page returned an empty scenario registry");
    }
    return scenarios;
}
