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
 * Precomputes tight bounds for every country in assets/worldmapPaths.json,
 * replacing the former runtime Skia computeTightBounds() calls in
 * RegionalWorldMap. Bounds are keyed by the source file's original keys;
 * runtime code normalizes keys the same way it does for path lookups.
 *
 * Usage:
 *   node scripts/generate-worldmap-bounds.mjs           regenerate
 *   node scripts/generate-worldmap-bounds.mjs --check   fail if stale
 *
 * --check runs as part of `npm run check` so the generated file can never
 * silently drift from the source paths.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pathBounds from "svg-path-bounds";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(projectRoot, "assets", "worldmapPaths.json");
const outputPath = join(projectRoot, "assets", "worldmapBounds.json");

const worldMapPaths = JSON.parse(readFileSync(sourcePath, "utf8"));

function toPathStrings(value) {
    if (typeof value === "string") {
        return [value];
    }
    if (Array.isArray(value)) {
        return value.filter((path) => typeof path === "string");
    }
    const paths = value?.path ?? value?.d;
    if (typeof paths === "string") {
        return [paths];
    }
    if (Array.isArray(paths)) {
        return paths.filter((path) => typeof path === "string");
    }
    return [];
}

function round(value) {
    return Number(value.toFixed(3));
}

const bounds = {};
for (const [key, value] of Object.entries(worldMapPaths)) {
    const paths = toPathStrings(value);
    if (paths.length === 0) {
        continue;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const path of paths) {
        const [left, top, right, bottom] = pathBounds(path);
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, right);
        maxY = Math.max(maxY, bottom);
    }
    bounds[key] = {
        x: round(minX),
        y: round(minY),
        width: round(maxX - minX),
        height: round(maxY - minY),
    };
}

const output = JSON.stringify(bounds, null, 2) + "\n";

if (process.argv.includes("--check")) {
    let existing = null;
    try {
        existing = readFileSync(outputPath, "utf8");
    } catch {
        // Missing counts as stale.
    }
    if (existing !== output) {
        console.error(
            `${outputPath} is stale. Regenerate it with:\n` +
                `  node scripts/generate-worldmap-bounds.mjs`,
        );
        process.exit(1);
    }
    console.log("worldmapBounds.json is up to date");
} else {
    writeFileSync(outputPath, output);
    console.log(
        `Wrote bounds for ${Object.keys(bounds).length} regions to ${outputPath}`,
    );
}
