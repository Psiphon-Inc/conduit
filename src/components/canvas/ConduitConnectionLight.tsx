/*
 * Copyright (c) 2024, Psiphon Inc.
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
// must be rendered within a canvas
import {
    Blur,
    Circle,
    Group,
    SkPoint,
    interpolateColors,
    interpolateVector,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import {
    cancelAnimation,
    useDerivedValue,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

import { palette } from "@/src/styles";

/**
 * Ball of light that will take a semi-random trajectory through the origin and
 * up to the top of the canvas. Must be rendered within a Canvas.
 **/
export function ConduitConnectionLight({
    active,
    canvasWidth,
    orbRadius,
    midPoint,
    secondLastPoint,
    endPoint,
    randomize,
    x0init = 0,
    y0init = 0,
}: {
    active: boolean;
    canvasWidth: number;
    orbRadius: number;
    midPoint: SkPoint;
    secondLastPoint: SkPoint;
    endPoint: SkPoint;
    randomize: boolean;
    x0init?: number;
    y0init?: number;
}) {
    // A connection light will be rendered for every connection to the Conduit.
    // Each light will start at a random position horizontally off-screen, fly
    // into the Conduit Orb, then fly up to the Psiphon Network dots.
    // Each orb will do this in a loop, choosing new random initial values each
    // time. A lfo will animate from -1 to 1.
    // Store lfo in a ReactRef so that we don't reset it on re-render.
    const lfo = React.useRef(useSharedValue(-1));
    const periodMs = 5000;

    const y0 = useSharedValue(y0init);
    const x0 = useSharedValue(x0init);

    // interpolate trajectory between semi-random vectors
    const trajectory = useDerivedValue(() => {
        return interpolateVector(
            lfo.current.value,
            [-1, -0.6, 0, 0.6, 1],
            [
                vec(x0.value, y0.value),
                vec(
                    (x0.value / canvasWidth) * orbRadius,
                    (y0.value / canvasWidth) * orbRadius,
                ),
                midPoint,
                secondLastPoint,
                endPoint,
            ],
        );
    });

    // animate light color along trajectory
    const lightColors = [
        palette.transparent,
        palette.peach,
        palette.mauve,
        palette.purple,
        palette.transparent,
    ];
    const lightColor = useDerivedValue(() => {
        return interpolateColors(
            lfo.current.value,
            [-1, -0.6, 0, 0.6, 1],
            lightColors,
        );
    });

    // use opacity to fade out when a connection is dropped
    const lightOpacity = useSharedValue(0);

    function randomizeXYSpin() {
        "worklet";
        x0.value = (Math.random() > 0.5 ? 1 : -1) * canvasWidth;
        y0.value = Math.random() * canvasWidth;
        // add a bit of random delay to the start of each cycle to re-stagger
        // when a bunch are instantiated at once (i.e. when app is opened)
        lfo.current.value = withDelay(
            Math.random() * 1000,
            withRepeat(
                withTiming(1, {
                    duration: periodMs,
                }),
                -1,
                true,
            ),
        );
    }

    React.useEffect(() => {
        if (active) {
            lfo.current.value = -1;
            lightOpacity.value = withTiming(1, { duration: 1000 });
            if (randomize) {
                randomizeXYSpin();
            } else {
                lfo.current.value = withRepeat(
                    withTiming(1, {
                        duration: periodMs,
                    }),
                    -1,
                    true,
                );
            }
        } else {
            lightOpacity.value = withTiming(0, { duration: 1000 }, () => {
                cancelAnimation(lfo.current);
            });
        }
    }, [active]);

    React.useEffect(() => {
        return () => {
            cancelAnimation(lfo.current);
            lfo.current.value = -1;
        };
    }, []);

    return (
        <Group>
            <Circle
                c={trajectory}
                r={orbRadius / 10}
                color={lightColor}
                opacity={lightOpacity}
            ></Circle>
            <Blur blur={2} />
        </Group>
    );
}
