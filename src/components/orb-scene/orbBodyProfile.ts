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

export interface OrbBodyProfileInput {
    /** Body radial gradient, center to edge. */
    innerColor: { r: number; g: number; b: number; alpha: number };
    outerColor: { r: number; g: number; b: number; alpha: number };
    /** Edge stroke alpha (the 1.2px 0.42-alpha ring at the body radius). */
    edgeAlpha: number;
    /** Orb base radius in px (the blur is a fixed 5px screen-space sigma). */
    radiusPx: number;
}

export interface OrbBodyProfileStop {
    /** Position within the profile's outer radius (0..1). */
    offset: number;
    color: string;
    alpha: number;
}

export interface OrbBodyProfile {
    /** Profile extent in units of the body radius (covers the blur halo). */
    outerRadiusRatio: number;
    stops: OrbBodyProfileStop[];
}

/**
 * Reproduces what Skia's morph layer does to an isolated orb body: composite
 * the body gradient, the soft morph-ring halo, and the edge stroke; gaussian
 * blur the result (5px sigma, screen space); then apply the 5a-2 alpha
 * threshold. The result is a radial profile the native renderer bakes into
 * one static SVG gradient, giving the same rim-weighted translucent shell
 * the Skia scene shows instead of the raw gradient's opaque body.
 */
export function calculateThresholdedOrbBodyProfile(
    input: OrbBodyProfileInput,
): OrbBodyProfile {
    const OUTER_RATIO = 1.45;
    const SAMPLES = 256;
    const step = OUTER_RATIO / SAMPLES;
    const sigmaNorm = Math.max(0.004, 5 / Math.max(input.radiusPx, 1));

    // Sample RGBA along the radius (source-over compositing: body, then
    // ring halo, then edge stroke — matching draw order).
    const red = new Array<number>(SAMPLES).fill(0);
    const green = new Array<number>(SAMPLES).fill(0);
    const blue = new Array<number>(SAMPLES).fill(0);
    const alpha = new Array<number>(SAMPLES).fill(0);

    const over = (
        index: number,
        r: number,
        g: number,
        b: number,
        a: number,
    ) => {
        const combined = a + alpha[index] * (1 - a);
        if (combined <= 0) {
            return;
        }
        red[index] = (r * a + red[index] * alpha[index] * (1 - a)) / combined;
        green[index] =
            (g * a + green[index] * alpha[index] * (1 - a)) / combined;
        blue[index] = (b * a + blue[index] * alpha[index] * (1 - a)) / combined;
        alpha[index] = combined;
    };

    for (let index = 0; index < SAMPLES; index++) {
        const radius = index * step;
        if (radius <= 1) {
            const mix = radius;
            over(
                index,
                input.innerColor.r +
                    (input.outerColor.r - input.innerColor.r) * mix,
                input.innerColor.g +
                    (input.outerColor.g - input.innerColor.g) * mix,
                input.innerColor.b +
                    (input.outerColor.b - input.innerColor.b) * mix,
                input.innerColor.alpha +
                    (input.outerColor.alpha - input.innerColor.alpha) * mix,
            );
        }
        // Morph ring: transparent -> rgba(255,230,218,0.22) at 0.82 ->
        // transparent, in units of the 1.25r ring radius.
        const ringRadius = radius / 1.25;
        if (ringRadius > 0.65 && ringRadius < 1.0) {
            const ringAlpha =
                ringRadius <= 0.82
                    ? (0.22 * (ringRadius - 0.65)) / 0.17
                    : (0.22 * (1.0 - ringRadius)) / 0.18;
            over(index, 255, 230, 218, Math.max(0, ringAlpha));
        }
        // Edge stroke: 1.2px band at the body radius.
        const strokeHalf = 0.6 / Math.max(input.radiusPx, 1);
        if (Math.abs(radius - 1) <= strokeHalf) {
            over(
                index,
                input.outerColor.r,
                input.outerColor.g,
                input.outerColor.b,
                input.edgeAlpha,
            );
        }
    }

    // 1D gaussian blur across the radial samples (an approximation of the
    // 2D blur that is exact away from the center).
    const kernelRadius = Math.max(1, Math.round((sigmaNorm / step) * 3));
    const kernel: number[] = [];
    let kernelSum = 0;
    for (let k = -kernelRadius; k <= kernelRadius; k++) {
        const weight = Math.exp(-0.5 * ((k * step) / sigmaNorm) ** 2);
        kernel.push(weight);
        kernelSum += weight;
    }
    const blurChannel = (channel: number[], weights?: number[]) =>
        channel.map((_, index) => {
            let sum = 0;
            let weightTotal = 0;
            for (let k = -kernelRadius; k <= kernelRadius; k++) {
                const sample = Math.min(SAMPLES - 1, Math.max(0, index + k));
                const weight =
                    kernel[k + kernelRadius] *
                    (weights ? Math.max(weights[sample], 0.0001) : 1);
                sum += channel[sample] * weight;
                weightTotal += weight;
            }
            return sum / Math.max(weightTotal, 1e-9);
        });

    // Blur alpha plainly; blur color alpha-weighted so transparent samples
    // don't drag colors toward black.
    const blurredA = blurChannel(alpha);
    const blurredR = blurChannel(red, alpha);
    const blurredG = blurChannel(green, alpha);
    const blurredB = blurChannel(blue, alpha);

    // Skia's ColorMatrix threshold (alpha row [0, 0, 0, 5, -2]) worked on a
    // 2D screen-space field, where overlapping contributions pushed alpha
    // well past the 0.4 knee. This 1D radial slice never gets there — raw
    // interior alpha peaks near 0.45, so a literal 5a-2 leaves the body at
    // 0.01-0.22 (a washed-out disc) with a bright ring at r≈0.91 and a hard
    // cliff to zero at the rim. That read as flat with too hard an edge on a
    // real device.
    //
    // Instead, remap the blurred alpha with a smoothstep that keeps the
    // body's own gradient shape: the core reaches a believable density, the
    // rim falls off smoothly, and nothing cuts off abruptly. RIM_SOFTNESS is
    // the dial for edge hardness — larger is softer.
    const CORE_DENSITY = 1.35;
    const RIM_SOFTNESS = 0.22;

    const stops: OrbBodyProfileStop[] = [];
    const STRIDE = 4;
    for (let index = 0; index < SAMPLES; index += STRIDE) {
        const radius = index * step;
        // Density from the composited gradient, lifted so the interior is
        // actually visible rather than threshold-crushed.
        const density = Math.min(1, blurredA[index] * CORE_DENSITY);
        // Smooth radial falloff replacing the cliff: full inside the body,
        // easing to zero across RIM_SOFTNESS beyond the rim.
        const t = Math.max(
            0,
            Math.min(1, (radius - (1 - RIM_SOFTNESS)) / (RIM_SOFTNESS * 2)),
        );
        const falloff = 1 - t * t * (3 - 2 * t); // smoothstep
        stops.push({
            offset: index / SAMPLES,
            color: `rgb(${Math.round(blurredR[index])},${Math.round(
                blurredG[index],
            )},${Math.round(blurredB[index])})`,
            alpha: density * falloff,
        });
    }
    stops.push({ offset: 1, color: stops[stops.length - 1].color, alpha: 0 });

    return { outerRadiusRatio: OUTER_RATIO, stops };
}
