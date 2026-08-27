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
import * as Haptics from "expo-haptics";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    SharedValue,
    runOnJS,
    useAnimatedStyle,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import { isE2E } from "@/src/common/e2e";

// The renderer-independent tap/long-press overlay for a single orb, shared
// by the Skia and native scene renderers.

export interface OrbGestureOverlayProps {
    centerX: SharedValue<number>;
    centerY: SharedValue<number>;
    radius: SharedValue<number>;
    baseRadius: number;
    enabled: boolean;
    highlighted?: boolean;
    accessibilityLabel?: string;
    testID?: string;
    onTapAction?: () => void;
    onLongPressAction?: () => void;
}

export function OrbGestureOverlay({
    centerX,
    centerY,
    radius,
    baseRadius,
    enabled,
    highlighted = false,
    accessibilityLabel,
    testID,
    onTapAction,
    onLongPressAction,
}: OrbGestureOverlayProps) {
    const { t } = useTranslation();
    const e2e = isE2E();
    const onTapActionRef = React.useRef(onTapAction);
    const onLongPressActionRef = React.useRef(onLongPressAction);

    React.useEffect(() => {
        onTapActionRef.current = onTapAction;
    }, [onTapAction]);

    React.useEffect(() => {
        onLongPressActionRef.current = onLongPressAction;
    }, [onLongPressAction]);

    const runTapAction = React.useCallback(() => {
        onTapActionRef.current?.();
    }, []);

    const runLongPressAction = React.useCallback(() => {
        onLongPressActionRef.current?.();
    }, []);

    const animateGiggle = React.useCallback(() => {
        "worklet";
        radius.value = withSequence(
            withTiming(baseRadius * 0.97, { duration: 55 }),
            withSpring(baseRadius, {
                dampingRatio: 0.45,
            }),
        );
    }, [baseRadius, radius]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            position: "absolute",
            left: centerX.value - radius.value,
            top: centerY.value - radius.value,
            width: radius.value * 2,
            height: radius.value * 2,
            borderRadius: radius.value,
            backgroundColor: "transparent",
        };
    }, [centerX, centerY, radius]);

    const highlightStyle = React.useMemo(
        () =>
            highlighted
                ? {
                      borderWidth: 2,
                      borderColor: "rgba(255, 255, 255, 0.92)",
                  }
                : null,
        [highlighted],
    );

    const tapGesture = React.useMemo(
        () =>
            Gesture.Tap()
                .enabled(enabled)
                .onEnd(() => {
                    if (!enabled) {
                        return;
                    }
                    animateGiggle();
                    if (!e2e) {
                        runOnJS(Haptics.impactAsync)(
                            Haptics.ImpactFeedbackStyle.Medium,
                        );
                    }
                    runOnJS(runTapAction)();
                }),
        [animateGiggle, e2e, enabled, runTapAction],
    );

    const longPressEnabled = Boolean(onLongPressAction) && enabled;

    const longPressGesture = React.useMemo(
        () =>
            Gesture.LongPress()
                .enabled(longPressEnabled)
                .minDuration(1100)
                .onBegin(() => {
                    radius.value = withTiming(baseRadius * 0.85, {
                        duration: 1200,
                    });
                    if (!e2e) {
                        runOnJS(Haptics.impactAsync)(
                            Haptics.ImpactFeedbackStyle.Soft,
                        );
                    }
                })
                .onStart(() => {
                    if (!longPressEnabled) {
                        return;
                    }
                    if (!e2e) {
                        runOnJS(Haptics.impactAsync)(
                            Haptics.ImpactFeedbackStyle.Heavy,
                        );
                    }
                    runOnJS(runLongPressAction)();
                })
                .onFinalize(() => {
                    animateGiggle();
                }),
        [
            animateGiggle,
            baseRadius,
            e2e,
            longPressEnabled,
            radius,
            runLongPressAction,
        ],
    );

    const gesture = React.useMemo(
        () => Gesture.Exclusive(tapGesture, longPressGesture),
        [longPressGesture, tapGesture],
    );

    const accessibilityProps = enabled
        ? {
              accessible: true,
              accessibilityRole: "button" as const,
              accessibilityLabel:
                  accessibilityLabel ??
                  t("CONDUIT_ORB_TAP_ACCESSIBILITY_I18N.string"),
          }
        : {
              accessible: false,
          };

    const overlay = (
        <Animated.View
            testID={e2e ? undefined : testID}
            {...(!e2e ? accessibilityProps : { accessible: false })}
            pointerEvents={enabled ? "auto" : "none"}
            style={[animatedStyle, highlightStyle]}
        />
    );

    if (!enabled) {
        return highlighted ? overlay : null;
    }

    if (e2e && testID) {
        return (
            <Pressable
                testID={testID}
                {...accessibilityProps}
                onPress={runTapAction}
                onLongPress={onLongPressAction ? runLongPressAction : undefined}
                style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                }}
            >
                {overlay}
            </Pressable>
        );
    }

    return <GestureDetector gesture={gesture}>{overlay}</GestureDetector>;
}
