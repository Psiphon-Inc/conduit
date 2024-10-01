// NOTE: this whole file is copied from @shopify/react-native-skia, see TODO
import { useEffect } from "react";

import {
    DataSourceParam,
    SkImage,
    useAnimatedImage,
} from "@shopify/react-native-skia";
const DEFAULT_FRAME_DURATION = 60;

import {
    FrameInfo,
    SharedValue,
    useFrameCallback,
    useSharedValue,
} from "react-native-reanimated";

export const useAnimatedImageValue = (
    source: DataSourceParam,
    paused?: SharedValue<boolean>,
) => {
    const defaultPaused = useSharedValue(false);
    const isPaused = paused ?? defaultPaused;
    const currentFrame = useSharedValue<null | SkImage>(null);
    const lastTimestamp = useSharedValue(-1);
    const animatedImage = useAnimatedImage(
        source,
        (err) => {
            console.error(err);
            throw new Error(
                `Could not load animated image - got '${err.message}'`,
            );
        },
        false,
    );
    const frameDuration =
        animatedImage?.currentFrameDuration() || DEFAULT_FRAME_DURATION;

    useFrameCallback((frameInfo: FrameInfo) => {
        if (!animatedImage) {
            currentFrame.value = null;
            return;
        }
        if (isPaused.value && lastTimestamp.value !== -1) {
            return;
        }
        const { timestamp } = frameInfo;
        const elapsed = timestamp - lastTimestamp.value;

        // Check if it's time to switch frames based on GIF frame duration
        if (elapsed < frameDuration) {
            return;
        }

        // Update the current frame
        animatedImage.decodeNextFrame();
        // TODO: this whole file is copied from @shopify/react-native-skia because
        // the following dispose call seems to be causing flickering in the animated
        // image. Will try address upstream at some point, then delete this file.
        //if (currentFrame.value) {
        //  currentFrame.value.dispose();
        //}
        currentFrame.value = animatedImage.getCurrentFrame();

        // Update the last timestamp
        lastTimestamp.value = timestamp;
    });
    useEffect(() => {
        return () => {
            animatedImage?.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return currentFrame;
};