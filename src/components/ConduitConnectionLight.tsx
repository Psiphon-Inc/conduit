// must be rendered within a canvas
import {
    Blur,
    Circle,
    Group,
    interpolateColors,
    interpolateVector,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import {
    useDerivedValue,
    useFrameCallback,
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
    canvasSize,
    orbRadius,
}: {
    canvasSize: number;
    orbRadius: number;
}) {
    // A connection light will be rendered for every connection to the Conduit.
    // Each light will start at a random position horizontally off-screen, fly
    // into the Conduit Orb, then fly up to the Psiphon Network dots.
    // Each orb will do this in a loop, choosing new random initial values each
    // time. A spinner will animate from -1 to 1.
    const spinner = useSharedValue(-1);

    // Randomize y starting position
    const yStart = useSharedValue(1);
    // Randomize x polarity (start on left or right, off screen)
    const xStartSign = useSharedValue(1);

    // Use a frame callback to randomize at the end of each spinner loop.
    const randomizerReady = useSharedValue(0);
    const randomizeVelocity = useFrameCallback((_) => {
        if (spinner.value > 0.9 && randomizerReady.value === 1) {
            // end of spinner loop, pick new random values
            yStart.value = Math.random();
            xStartSign.value = Math.random() > 0.5 ? 1 : -1;
            // Don't re-randomize until the next loop
            randomizerReady.value = 0;
        }
        if (spinner.value < -0.9 && randomizerReady.value === 0) {
            // start of spinner loop, prepare to re-randomize
            randomizerReady.value = 1;
        }
    });

    // interpolate trajectory between semi-random vectors
    const trajectory = useDerivedValue(() => {
        return interpolateVector(
            spinner.value,
            [-1, -0.6, 0, 0.6, 1],
            [
                vec(
                    xStartSign.value * canvasSize,
                    (canvasSize / 1.5) * yStart.value,
                ),
                vec(xStartSign.value * orbRadius, orbRadius * yStart.value),
                vec(0, 0),
                vec(0, -orbRadius),
                vec(0, -(canvasSize / 1.7)),
            ],
        );
    });

    // animate light color along trajectory
    const lightColors = [
        palette.white,
        palette.blue,
        palette.blue,
        palette.purple,
        palette.red,
    ];
    const lightColor = useDerivedValue(() => {
        return interpolateColors(
            spinner.value,
            [-1, -0.6, 0, 0.6, 1],
            lightColors,
        );
    });

    // Start the spinner and activate the randomizer frame callback
    // Use a random delay on the spinner activation so that the lights are
    // staggered when user opens the app up and there are already connections.
    React.useEffect(() => {
        randomizeVelocity.setActive(true);
        spinner.value = withDelay(
            Math.round(Math.random() * 2500),
            withRepeat(withTiming(1, { duration: 5000 }), -1),
        );
    }, []);

    return (
        <Group>
            <Circle
                c={trajectory}
                r={orbRadius / 10}
                color={lightColor}
            ></Circle>
            <Blur blur={2} />
        </Group>
    );
}
