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
import { Image as ExpoImage } from "expo-image";
import React from "react";
import { StyleSheet } from "react-native";
import Animated, {
    SharedValue,
    useAnimatedStyle,
} from "react-native-reanimated";

const BRIDGE_MASK = require("@/assets/images/generated/metaball-bridge.png");

// Geometry of the generated mask (see scripts/generate-orb-assets.mjs):
// two r=96 circles, centers 209.28px apart, on a 512x256 canvas.
const MASK_WIDTH = 512;
const MASK_HEIGHT = 256;
const MASK_RADIUS = 96;
const MASK_CENTER_DISTANCE = MASK_RADIUS * 2.18;

// Normalized gap band (centerDistance / summed radii) where a bridge shows:
// fade in as surfaces approach, fully out once well separated or engulfed.
const BRIDGE_FULL_MIN = 0.55;
const BRIDGE_FULL_MAX = 1.02;
const BRIDGE_FADE_OUT = 1.18;
const BRIDGE_FADE_IN = 0.4;

/**
 * The pairwise liquid neck between two orbs — the native approximation of
 * Skia's blur+threshold morph. Renders the pre-baked bridge mask, tinted,
 * positioned at the pair midpoint, rotated along the center line, scaled so
 * the mask's circle centers land on the real orb centers. Layer it behind
 * the orb bodies so its cutout edges tuck underneath.
 *
 * Mount in scene coordinates (the same space as the orb centers).
 */
export function MetaballBridge({
    ax,
    ay,
    aRadius,
    bx,
    by,
    bRadius,
    tint,
    maxOpacity = 1,
    masterOpacity,
}: {
    ax: SharedValue<number>;
    ay: SharedValue<number>;
    aRadius: SharedValue<number>;
    bx: SharedValue<number>;
    by: SharedValue<number>;
    bRadius: SharedValue<number>;
    tint: string;
    /** Cap applied on top of the gap envelope (three-body brightness cap). */
    maxOpacity?: number;
    masterOpacity?: SharedValue<number>;
}) {
    const wrapperStyle = useAnimatedStyle(() => {
        const dx = bx.value - ax.value;
        const dy = by.value - ay.value;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const summedRadii = Math.max(1, aRadius.value + bRadius.value);
        const gap = distance / summedRadii;

        let envelope = 0;
        if (gap >= BRIDGE_FULL_MIN && gap <= BRIDGE_FULL_MAX) {
            envelope = 1;
        } else if (gap > BRIDGE_FULL_MAX && gap < BRIDGE_FADE_OUT) {
            envelope =
                1 -
                (gap - BRIDGE_FULL_MAX) / (BRIDGE_FADE_OUT - BRIDGE_FULL_MAX);
        } else if (gap < BRIDGE_FULL_MIN && gap > BRIDGE_FADE_IN) {
            envelope =
                (gap - BRIDGE_FADE_IN) / (BRIDGE_FULL_MIN - BRIDGE_FADE_IN);
        }

        const midX = (ax.value + bx.value) / 2;
        const midY = (ay.value + by.value) / 2;
        const angle = Math.atan2(dy, dx);
        const scaleX = distance / MASK_CENTER_DISTANCE;
        const scaleY = (aRadius.value + bRadius.value) / 2 / MASK_RADIUS;

        return {
            opacity: envelope * maxOpacity * (masterOpacity?.value ?? 1),
            transform: [
                { translateX: midX },
                { translateY: midY },
                { rotate: `${angle}rad` },
                { scaleX },
                { scaleY },
            ],
        };
    }, [aRadius, ax, ay, bRadius, bx, by, masterOpacity, maxOpacity]);

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                {
                    position: "absolute",
                    left: -MASK_WIDTH / 2,
                    top: -MASK_HEIGHT / 2,
                    width: MASK_WIDTH,
                    height: MASK_HEIGHT,
                },
                wrapperStyle,
            ]}
        >
            <ExpoImage
                source={BRIDGE_MASK}
                tintColor={tint}
                style={StyleSheet.absoluteFillObject}
                contentFit="fill"
            />
        </Animated.View>
    );
}
