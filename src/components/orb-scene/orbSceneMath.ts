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

export interface OrbMorphBoundsInput {
    centerX: number;
    centerY: number;
    radius: number;
    proxyReach: number;
}

export interface OrbMorphClipBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface OrbGlowGradientStops {
    outerRadius: number;
    positions: number[];
    alphaMultipliers: number[];
}

/** Builds a solid-core radial gradient with a Gaussian tail through 3 sigma. */
export function calculateOrbGlowGradientStops(
    radius: number,
    sigma: number,
): OrbGlowGradientStops {
    "worklet";
    const coreRadius = Math.max(0, radius);
    const safeSigma = Math.max(0, sigma);
    const outerRadius = coreRadius + safeSigma * 3;
    const normalizedOuterRadius = Math.max(outerRadius, 1);

    return {
        outerRadius,
        positions: [
            0,
            coreRadius / normalizedOuterRadius,
            (coreRadius + safeSigma) / normalizedOuterRadius,
            (coreRadius + safeSigma * 2) / normalizedOuterRadius,
            outerRadius / normalizedOuterRadius,
        ],
        alphaMultipliers: [1, 1, Math.exp(-0.5), Math.exp(-2), 0],
    };
}

/** Returns a conservative canvas-clamped union for the goo saveLayer. */
export function calculateOrbMorphClipBounds(
    canvasWidth: number,
    canvasHeight: number,
    orbs: OrbMorphBoundsInput[],
    blurSupport: number,
    aaPadding: number,
): OrbMorphClipBounds {
    "worklet";
    let left = canvasWidth;
    let top = canvasHeight;
    let right = 0;
    let bottom = 0;

    for (let index = 0; index < orbs.length; index++) {
        const orb = orbs[index];
        const contentReach = Math.max(orb.radius * 1.25, orb.proxyReach);
        const reach = contentReach + blurSupport + aaPadding;
        left = Math.min(left, orb.centerX - reach);
        top = Math.min(top, orb.centerY - reach);
        right = Math.max(right, orb.centerX + reach);
        bottom = Math.max(bottom, orb.centerY + reach);
    }

    const clampedLeft = Math.max(0, Math.min(canvasWidth, left));
    const clampedTop = Math.max(0, Math.min(canvasHeight, top));
    const clampedRight = Math.max(clampedLeft, Math.min(canvasWidth, right));
    const clampedBottom = Math.max(clampedTop, Math.min(canvasHeight, bottom));
    return {
        x: clampedLeft,
        y: clampedTop,
        width: clampedRight - clampedLeft,
        height: clampedBottom - clampedTop,
    };
}
