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

import {
    connectionLightMotionBufferOffset,
    connectionLightProxyEnvelope,
} from "@/src/components/canvas/connectionLightMotion";

const TAIL_MASK = require("@/assets/images/generated/particle-tail.png");

// Mask geometry is emitted by scripts/generate-orb-assets.mjs next to the PNG,
// so the shape and the code that seats it can never drift apart. Edit the
// TAIL_* dials in that script and re-run `npm run generate:orb-assets`.
//
// The mask's vertical middle is the neck axis. `rimXRatio` is where the orb
// rim falls across the width: to its left is the lump inside the orb, to its
// right the outward neck, so the goo reads as continuous through the surface.
const TAIL_GEOMETRY =
    require("@/assets/images/generated/particle-tail.json") as {
        width: number;
        height: number;
        rimXRatio: number;
    };

const MASK_WIDTH = TAIL_GEOMETRY.width;
const MASK_HEIGHT = TAIL_GEOMETRY.height;
// Clamped: the sheet width divides by (1 - ratio), so a value outside (0, 1)
// would collapse or invert the element and render nothing.
const MASK_RIM_X_RATIO = Math.min(0.9, Math.max(0.05, TAIL_GEOMETRY.rimXRatio));

/**
 * How far out from the rim the neck reaches, in units of the orb radius.
 * Larger reaches further toward the light. Safe to tune freely.
 */
const NECK_REACH_RATIO = 0.23;

/**
 * Pushes the whole neck along the rim normal, in units of the orb radius.
 * This is the offset-from-edge dial:
 *   0      the mask's rim line sits exactly on the orb rim
 *   > 0    slides outward, away from the orb centre
 *   < 0    sinks into the orb, burying more of the inside lump
 * Safe to tune freely.
 */
const NECK_EDGE_OFFSET_RATIO = 0;

/**
 * The liquid neck that swells at an orb's rim while a connection light
 * crosses it — the native approximation of the Skia blur+threshold morph.
 *
 * The neck is a fixed element: it stays pinned to the rim, oriented toward
 * the light, and fades in and out rather than travelling or stretching. An
 * earlier version anchored the mask to the light itself, which both dragged
 * the shape across the scene and haloed the light on all sides instead of
 * filling the gap between light and orb.
 *
 * Mount inside the same zero-size orb-center anchor as the lights.
 */
export function NativeParticleTail({
    orbRadius,
    sharedMotionBuffer,
    sharedMotionIndex,
    tint = "rgba(255,222,205,0.2)",
    masterOpacity,
}: {
    orbRadius: number;
    sharedMotionBuffer: SharedValue<number[]>;
    sharedMotionIndex: number;
    tint?: string;
    masterOpacity?: SharedValue<number>;
}) {
    // The sheet is sized from the orb so it never resizes at runtime; only
    // its rotation and opacity animate. Its outward half must be long enough
    // to reach the light across the whole contact band the envelope allows.
    const outwardReach = orbRadius * NECK_REACH_RATIO;
    const sheetWidth = outwardReach / (1 - MASK_RIM_X_RATIO);
    const sheetHeight = sheetWidth * (MASK_HEIGHT / MASK_WIDTH);
    // Distance from the sheet's centre to the rim line inside the mask.
    const rimToCentre = sheetWidth * (0.5 - MASK_RIM_X_RATIO);
    const motionOffset = connectionLightMotionBufferOffset(sharedMotionIndex);

    const wrapperStyle = useAnimatedStyle(() => {
        const buffer = sharedMotionBuffer.value;
        const lfo = buffer[motionOffset] ?? -1;
        const x = buffer[motionOffset + 1] ?? 0;
        const y = buffer[motionOffset + 2] ?? 0;
        const distance = Math.sqrt(x * x + y * y);
        const angle = Math.atan2(y, x);
        const envelope = connectionLightProxyEnvelope(lfo);
        // The Skia goo only bridged while the light's blurred field
        // overlapped the orb's from OUTSIDE; inside the body the goo was
        // invisible against the already-solid interior. Gate on the rim
        // band, fading fast on the inside.
        const proximity =
            distance >= orbRadius
                ? Math.max(0, 1 - (distance - orbRadius) / (orbRadius * 0.55))
                : Math.max(0, 1 - (orbRadius - distance) / (orbRadius * 0.18));
        return {
            opacity: envelope * proximity * (masterOpacity?.value ?? 1),
            // Rotate about the orb centre to face the light, then step out so
            // the mask's rim line lands exactly on the orb rim. The offset is
            // constant, so the neck stays welded to the edge while only its
            // orientation and opacity change — the inside lump ends up under
            // the orb body, which is what makes the goo read as continuous.
            transform: [
                { rotate: `${angle}rad` },
                {
                    translateX:
                        orbRadius +
                        rimToCentre +
                        orbRadius * NECK_EDGE_OFFSET_RATIO,
                },
            ],
        };
    }, [
        masterOpacity,
        motionOffset,
        orbRadius,
        rimToCentre,
        sharedMotionBuffer,
    ]);

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                {
                    position: "absolute",
                    left: -sheetWidth / 2,
                    top: -sheetHeight / 2,
                    width: sheetWidth,
                    height: sheetHeight,
                },
                wrapperStyle,
            ]}
        >
            <ExpoImage
                source={TAIL_MASK}
                tintColor={tint}
                style={StyleSheet.absoluteFillObject}
                contentFit="fill"
            />
        </Animated.View>
    );
}
