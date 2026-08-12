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
 * Watches scripts/generate-orb-assets.mjs and regenerates the orb assets on
 * every save, so tuning the TAIL_ and bridge dials is a plain edit-and-look
 * loop instead of remembering to re-run the generator.
 *
 * Usage:  npm run watch:orb-assets     (leave running beside Metro)
 *
 * Metro picks up the rewritten PNGs automatically. expo-image caches decoded
 * bitmaps, though, so if a shape change does not appear on device, shake to
 * reload rather than assuming the edit did nothing.
 */
import { execFileSync } from "node:child_process";
import { watch } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const generator = join(scriptsDir, "generate-orb-assets.mjs");

function regenerate() {
    const startedAt = Date.now();
    try {
        execFileSync(process.execPath, [generator], { stdio: "pipe" });
        console.log(
            `[orb-assets] regenerated in ${Date.now() - startedAt}ms — ` +
                new Date().toLocaleTimeString(),
        );
    } catch (error) {
        // Keep watching: a syntax error mid-edit should not kill the loop.
        const detail =
            error.stderr?.toString().trim() || error.message || "unknown error";
        console.error(`[orb-assets] FAILED\n${detail}`);
    }
}

console.log("[orb-assets] watching scripts/generate-orb-assets.mjs");
regenerate();

// Editors often write a file as truncate-then-write, which fires several
// events; debounce so one save produces one regeneration.
let pending = null;
watch(generator, () => {
    clearTimeout(pending);
    pending = setTimeout(regenerate, 120);
});
