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
import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

/** Static radial-gradient orb body filling a 2*radius square layer. */
export function OrbBodyGradient({
    id,
    radius,
    innerColor,
    outerColor,
}: {
    id: string;
    radius: number;
    innerColor: string;
    outerColor: string;
}) {
    return (
        <Svg
            width={radius * 2}
            height={radius * 2}
            style={[StyleSheet.absoluteFillObject, styles.visibleOverflow]}
        >
            <Defs>
                <RadialGradient id={id} cx="50%" cy="50%" r="50%">
                    <Stop offset={0} stopColor={innerColor} />
                    <Stop offset={1} stopColor={outerColor} />
                </RadialGradient>
            </Defs>
            <Circle cx={radius} cy={radius} r={radius} fill={`url(#${id})`} />
        </Svg>
    );
}

/**
 * Offset-center radial gradient approximating a Skia inner shadow: an inner
 * shadow offset (dx, dy) tints the rim opposite the offset, so the gradient
 * center is pushed toward (dx, dy) and the far rim picks up the color.
 */
export function InnerShadowLayer({
    id,
    radius,
    color,
    dx,
    dy,
}: {
    id: string;
    radius: number;
    color: string;
    dx: number;
    dy: number;
}) {
    const cx = 50 + dx * 1.4;
    const cy = 50 + dy * 1.4;
    return (
        <Svg
            width={radius * 2}
            height={radius * 2}
            style={[StyleSheet.absoluteFillObject, styles.visibleOverflow]}
        >
            <Defs>
                <RadialGradient id={id} cx={`${cx}%`} cy={`${cy}%`} r="72%">
                    <Stop offset={0.62} stopColor={color} stopOpacity={0} />
                    <Stop offset={0.92} stopColor={color} stopOpacity={0.55} />
                    <Stop offset={1} stopColor={color} stopOpacity={0.8} />
                </RadialGradient>
            </Defs>
            <Circle cx={radius} cy={radius} r={radius} fill={`url(#${id})`} />
        </Svg>
    );
}

const styles = StyleSheet.create({
    // SVG clips to its viewport by default. The filled circle lands exactly
    // on that boundary, so transformed anti-alias pixels otherwise flatten
    // the bottom and right edges for a frame during onboarding springs.
    visibleOverflow: { overflow: "visible" },
});
