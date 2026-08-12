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
 * Deterministically generates the raster assets used by the native (non-Skia)
 * orb renderer:
 *
 *   assets/images/generated/metaball-bridge.png
 *       White-on-transparent alpha mask of the liquid neck between two equal
 *       circles, computed the same way Skia's morph layer produced it:
 *       gaussian-blur the circles, threshold the alpha (5x - 2), then cut the
 *       circle interiors away so only the bridge remains. Rendered behind
 *       orb bodies and stretched/rotated/tinted at runtime.
 *
 *   assets/images/generated/particle-tail.png
 *       Smaller tapered mask for connection-light absorption, generated from
 *       one large and one small circle with the same blur+threshold.
 *
 *   assets/images/generated/noise-tile-a.png / noise-tile-b.png
 *       Seeded RGB noise tiles replacing the Skia Turbulence TV-static on
 *       the onboarding phone screen (two tiles crossfade at runtime).
 *
 * All outputs are pure functions of the constants below — `--check` verifies
 * the committed files match (wired into `npm run check`).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pngjs";

const { PNG } = pkg;

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(projectRoot, "assets", "images", "generated");

// --- shared helpers ---------------------------------------------------------

/** Separable gaussian approximation via three box blurs. */
function blurAlpha(alpha, width, height, sigma) {
    const boxRadius = Math.max(
        1,
        Math.round(sigma * Math.sqrt((3 * Math.PI) / 4) * 0.5),
    );
    let source = alpha;
    for (let pass = 0; pass < 3; pass++) {
        const target = new Float64Array(source.length);
        // Horizontal
        for (let y = 0; y < height; y++) {
            let sum = 0;
            for (let x = -boxRadius; x <= boxRadius; x++) {
                sum += source[y * width + Math.max(0, Math.min(width - 1, x))];
            }
            for (let x = 0; x < width; x++) {
                target[y * width + x] = sum / (2 * boxRadius + 1);
                const outIndex = Math.max(0, Math.min(width - 1, x - boxRadius));
                const inIndex = Math.max(
                    0,
                    Math.min(width - 1, x + boxRadius + 1),
                );
                sum += source[y * width + inIndex] - source[y * width + outIndex];
            }
        }
        // Vertical
        const vertical = new Float64Array(target.length);
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let y = -boxRadius; y <= boxRadius; y++) {
                sum += target[
                    Math.max(0, Math.min(height - 1, y)) * width + x
                ];
            }
            for (let y = 0; y < height; y++) {
                vertical[y * width + x] = sum / (2 * boxRadius + 1);
                const outIndex = Math.max(
                    0,
                    Math.min(height - 1, y - boxRadius),
                );
                const inIndex = Math.max(
                    0,
                    Math.min(height - 1, y + boxRadius + 1),
                );
                sum +=
                    target[inIndex * width + x] - target[outIndex * width + x];
            }
        }
        source = vertical;
    }
    return source;
}

function circleAlpha(alpha, width, cx, cy, radius) {
    const height = alpha.length / width;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const distance = Math.hypot(x - cx, y - cy);
            // 1px anti-aliased edge.
            const coverage = Math.max(0, Math.min(1, radius - distance + 0.5));
            const index = y * width + x;
            alpha[index] = Math.max(alpha[index], coverage);
        }
    }
}

/** Skia morph threshold: alpha' = clamp(5a - 2), i.e. solid above 0.4. */
function threshold(value) {
    return Math.max(0, Math.min(1, 5 * value - 2));
}

function writeMaskPng(name, alpha, width, height) {
    const png = new PNG({ width, height });
    for (let index = 0; index < width * height; index++) {
        png.data[index * 4] = 255;
        png.data[index * 4 + 1] = 255;
        png.data[index * 4 + 2] = 255;
        png.data[index * 4 + 3] = Math.round(
            Math.max(0, Math.min(1, alpha[index])) * 255,
        );
    }
    return { name, buffer: PNG.sync.write(png) };
}

// --- metaball bridge mask ----------------------------------------------------

/**
 * Two equal circles at the strong-bridge distance. The circle interiors are
 * subtracted after thresholding so the runtime can layer the bridge behind
 * the orb bodies without doubling their alpha.
 */
function generateBridgeMask() {
    const width = 512;
    const height = 256;
    const radius = 96;
    const centerDistance = radius * 2.18;
    const cxA = width / 2 - centerDistance / 2;
    const cxB = width / 2 + centerDistance / 2;
    const cy = height / 2;
    // In the Skia scene the soft morph-ring halo outside each orb feeds the
    // blur+threshold goo; fold that reach into a wider blur here.
    const sigma = radius * 0.34;

    const circles = new Float64Array(width * height);
    circleAlpha(circles, width, cxA, cy, radius);
    circleAlpha(circles, width, cxB, cy, radius);
    const blurred = blurAlpha(circles, width, height, sigma);

    const mask = new Float64Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const goo = threshold(blurred[index]);
            // Remove the (slightly inset) circle bodies; keep only the neck
            // plus a thin overlap band so it tucks under the orbs cleanly.
            const insideA = Math.hypot(x - cxA, y - cy) - (radius - 4);
            const insideB = Math.hypot(x - cxB, y - cy) - (radius - 4);
            const outsideBodies = Math.max(
                0,
                Math.min(1, Math.min(insideA, insideB) + 0.5),
            );
            mask[index] = goo * outsideBodies;
        }
    }
    return writeMaskPng("metaball-bridge.png", mask, width, height);
}

// --- particle absorption tail -------------------------------------------------

/**
 * The neck of goo that swells where a connection light meets an orb's rim.
 *
 * Drawn from an explicit profile rather than derived from a blur+threshold of
 * two circles. Coaxing this shape out of a metaball simulation and then
 * cropping the bodies away proved fragile — small changes in gap or sigma
 * flipped between a solid slab, a detached blob, and nothing at all. The
 * shape wanted here is simple enough to state directly.
 *
 * Layout, in a canvas whose vertical middle is the neck axis:
 *
 *     x = 0 .......... RIM_X .......... width
 *     [ inside lump ] [ rim ] [ outward neck -> light ]
 *
 * The mask deliberately extends INSIDE the rim: a lump on the orb side makes
 * the goo read as continuous through the surface instead of stopping dead at
 * the edge. The runtime places RIM_X on the orb rim (see NativeParticleTail).
 */
// ---------------------------------------------------------------------------
// TUNING DIALS for the rim neck. Change these, run
// `npm run generate:orb-assets`, and the renderer picks up both the new PNG
// and its geometry (written to particle-tail.json) automatically — there is
// no matching constant to update by hand in the component.
//
//   TAIL_RIM_X_RATIO  where the orb rim sits across the mask, 0..1.
//                     Smaller = less lump inside the orb, longer outward neck.
//   TAIL_INSIDE_HALF  half-thickness of the inside lump, in units of height.
//   TAIL_WAIST_DEPTH  how much the neck pinches just outside the rim.
//   TAIL_FLARE_HALF   half-thickness where it flares toward the light.
// ---------------------------------------------------------------------------
//   TAIL_PEAK_ALPHA   maximum opacity along the neck's centre line. Below 1
//                     so the neck stays translucent and blends rather than
//                     reading as a hard-edged slab.
const TAIL_RIM_X_RATIO = 0.2;
const TAIL_INSIDE_HALF = 1.8;
const TAIL_WAIST_DEPTH = 0.4;
const TAIL_FLARE_HALF = 1.5;
const TAIL_PEAK_ALPHA = 0.72;

function generateParticleTail() {
    const width = 122;
    const height = 122;
    const cy = height / 2;
    const rimX = width * TAIL_RIM_X_RATIO;

    // Half-thickness of the neck across its axis, as a function of x. Peaks
    // just inside the rim (the inside lump), waists a little outside it, then
    // flares again toward the light before tapering to nothing.
    const halfWidthAt = (x) => {
        const insideSpan = rimX;
        const outsideSpan = width - rimX;
        if (x <= rimX) {
            // Inside the orb: rounded lump, fading in from x = 0.
            const t = x / insideSpan; // 0 at inner tip, 1 at rim
            return (
                Math.sin(Math.min(1, t) * (Math.PI / 2)) *
                height *
                TAIL_INSIDE_HALF
            );
        }
        // Outside: waist then flare, ending in a rounded cap.
        const t = (x - rimX) / outsideSpan; // 0 at rim, 1 at far edge
        const waist =
            TAIL_FLARE_HALF -
            TAIL_WAIST_DEPTH * Math.sin(Math.min(1, t / 0.45) * Math.PI);
        const cap = Math.cos(
            Math.min(1, Math.max(0, (t - 0.72) / 0.28)) * (Math.PI / 2),
        );
        return waist * height * cap;
    };

    const mask = new Float64Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const half = halfWidthAt(x);
            if (half <= 0) {
                continue;
            }
            const dy = Math.abs(y - cy);
            const edge = 1 - dy / half;
            if (edge <= 0) {
                continue;
            }
            // Gaussian-ish falloff across the neck. The previous version
            // multiplied by 1.35 and clamped, which made most of the
            // cross-section fully opaque — the neck read as a hard-edged slab
            // wherever it did not overlap the light sprite. Keeping the peak
            // below 1 leaves it translucent all the way across so it blends
            // into both the orb body and the light.
            const across = Math.pow(Math.sin(edge * (Math.PI / 2)), 1.5);
            // Fade along the length too, so the outer end dissolves toward
            // the light instead of stopping at a visible boundary.
            const t = (x - rimX) / (width - rimX);
            const lengthwise =
                t <= 0 ? 1 : 1 - Math.pow(Math.max(0, Math.min(1, t)), 2.2);
            mask[y * width + x] = across * TAIL_PEAK_ALPHA * lengthwise;
        }
    }
    return [
        writeMaskPng("particle-tail.png", mask, width, height),
        // Geometry the renderer needs to seat the mask on the rim. Emitted
        // alongside the PNG so the two can never drift out of sync.
        {
            name: "particle-tail.json",
            buffer: Buffer.from(
                JSON.stringify(
                    {
                        width,
                        height,
                        rimXRatio: TAIL_RIM_X_RATIO,
                    },
                    null,
                    2,
                ) + "\n",
            ),
        },
    ];
}

// --- noise tiles ---------------------------------------------------------------

function generateNoiseTile(name, seed) {
    const size = 128;
    const png = new PNG({ width: size, height: size });
    let state = seed;
    const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) | 0;
        return (state >>> 0) / 4294967296;
    };
    for (let index = 0; index < size * size; index++) {
        png.data[index * 4] = Math.floor(next() * 256);
        png.data[index * 4 + 1] = Math.floor(next() * 256);
        png.data[index * 4 + 2] = Math.floor(next() * 256);
        png.data[index * 4 + 3] = 255;
    }
    return { name, buffer: PNG.sync.write(png) };
}

// --- main ------------------------------------------------------------------------

const outputs = [
    generateBridgeMask(),
    ...generateParticleTail(),
    generateNoiseTile("noise-tile-a.png", 0x1234abcd),
    generateNoiseTile("noise-tile-b.png", 0x7654fed9),
].flat();

if (process.argv.includes("--check")) {
    let stale = false;
    for (const output of outputs) {
        const path = join(outputDir, output.name);
        const existingHash = existsSync(path)
            ? createHash("sha256").update(readFileSync(path)).digest("hex")
            : null;
        const expectedHash = createHash("sha256")
            .update(output.buffer)
            .digest("hex");
        if (existingHash !== expectedHash) {
            console.error(`stale: ${path}`);
            stale = true;
        }
    }
    if (stale) {
        console.error(
            "Regenerate with: node scripts/generate-orb-assets.mjs",
        );
        process.exit(1);
    }
    console.log("generated orb assets are up to date");
} else {
    mkdirSync(outputDir, { recursive: true });
    for (const output of outputs) {
        writeFileSync(join(outputDir, output.name), output.buffer);
        console.log(`wrote ${join(outputDir, output.name)}`);
    }
}
