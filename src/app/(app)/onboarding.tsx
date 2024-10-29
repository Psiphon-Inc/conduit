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

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    Canvas,
    Circle,
    ColorMatrix,
    Fill,
    Group,
    LinearGradient,
    Paint,
    Paragraph,
    RoundedRect,
    SkParagraphStyle,
    SkTextStyle,
    Skia,
    TextAlign,
    useFonts,
    vec,
} from "@shopify/react-native-skia";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { BackHandler, useWindowDimensions } from "react-native";
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
    SharedValue,
    runOnJS,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { drawBigFont } from "@/src/common/utils";
import { LearnMoreLink } from "@/src/components/LearnMoreLink";
import { PrivacyPolicyLink } from "@/src/components/PrivacyPolicyLink";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { OnboardingScene } from "@/src/components/canvas/OnboardingScene";
import { ASYNCSTORAGE_HAS_ONBOARDED_KEY } from "@/src/constants";
import { useNotificationsPermissions } from "@/src/hooks";
import { fonts, palette, sharedStyles as ss } from "@/src/styles";

export default function OnboardingScreen() {
    const win = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const notificationPermissions = useNotificationsPermissions();
    const router = useRouter();

    const [shouldAskForNotifications, setShouldAskForNotifications] =
        React.useState(false);

    const buttonTextChanged = useSharedValue(false);

    React.useEffect(() => {
        if (
            notificationPermissions.data &&
            notificationPermissions.data === "NOT_GRANTED_CAN_ASK"
        ) {
            setShouldAskForNotifications(true);
            buttonTextChanged.value = true;
        }
    }, [notificationPermissions]);

    const usableWidth = win.width - (insets.left + insets.right);
    const usableHeight = win.height;

    const views = [
        {
            // WELCOME
            headerText: t("ONBOARDING_WELCOME_HEADER_I18N.string"),
            bodyText: t("ONBOARDING_WELCOME_BODY_I18N.string"),
            buttonText: t("ONBOARDING_WELCOME_BUTTON_I18N.string"),
            beforeNext: undefined,
        },
        {
            // INFO_1
            headerText: t("ONBOARDING_INFO_1_HEADER_I18N.string"),
            bodyText: t("ONBOARDING_INFO_1_BODY_I18N.string"),
            buttonText: t("ONBOARDING_INFO_1_BUTTON_I18N.string"),
            beforeNext: undefined,
        },
        {
            // PRIVACY POLICY
            headerText: t("ONBOARDING_PRIVACY_POLICY_HEADER_I18N.string"),
            bodyText: t("ONBOARDING_PRIVACY_POLICY_BODY_I18N.string"),
            buttonText: t("ONBOARDING_PRIVACY_POLICY_BUTTON_I18N.string"),
            beforeNext: undefined,
        },
        {
            // PERMISSIONS
            headerText: t("ONBOARDING_PERMISSIONS_HEADER_I18N.string"),
            bodyText: t("ONBOARDING_PERMISSIONS_BODY_I18N.string"),
            buttonText: t("ONBOARDING_PERMISSIONS_BUTTON_I18N.string"),
            beforeNext: async () => {
                if (shouldAskForNotifications) {
                    await Notifications.requestPermissionsAsync();
                }
            },
        },
    ];

    const currentView = useSharedValue(0);
    const learnMoreLinkStyle = useAnimatedStyle(() => {
        return currentView.value === 1
            ? {
                  display: "flex",
              }
            : {
                  display: "none",
              };
    });
    const privacyPolicyLinkStyle = useAnimatedStyle(() => {
        return currentView.value === 2
            ? {
                  display: "flex",
              }
            : {
                  display: "none",
              };
    });

    const headerText = useDerivedValue(() => {
        return views[currentView.value].headerText;
    });
    const bodyText = useDerivedValue(() => {
        return views[currentView.value].bodyText;
    });
    const buttonText = useDerivedValue(() => {
        return views[currentView.value].buttonText;
    });

    // header takes up the first 15% of usableHeight
    const headerTransform = [
        { translateY: usableHeight * 0.05 },
        { translateX: usableWidth * 0.02 },
    ];
    const headerSize = {
        width: usableWidth * 0.96,
    };
    // image takes up the next 33% of usableHeight (48% total)
    const sceneTransform = [
        { translateY: usableHeight * 0.15 },
        //{ translateX: usableWidth * 0.18 },
    ];
    const sceneSize = {
        width: usableWidth,
        height: usableHeight * 0.25,
    };
    // body takes up the next 31% of usableHeight (79% total)
    const bodyTransform = [
        { translateY: usableHeight * 0.48 },
        { translateX: usableWidth * 0.06 },
    ];
    const bodySize = {
        width: usableWidth * 0.88,
        height: usableHeight * 0.31,
    };
    // indicator dots take up the next 3% of usableHeight (82% total)
    const dotWidth = 24;
    const dotsTransform = [
        { translateY: usableHeight * 0.79 },
        { translateX: usableWidth * 0.5 - (dotWidth * (views.length - 1)) / 2 },
    ];
    // button claims the next 8% of usableHeight (90% total)
    const buttonTransform = [
        { translateY: usableHeight * 0.82 },
        { translateX: usableWidth * 0.06 },
    ];
    const buttonSize = {
        width: usableWidth * 0.88,
        height: usableHeight * 0.08,
    };
    const buttonBorderRadius = 15;
    const privacyPolicyHeight = usableHeight * 0.05;
    // 10% of usable height is left for the Privacy Policy link to appear in

    const fontMgr = useFonts({
        Rajdhani: [fonts.Rajdhani],
        Jura: [fonts.JuraRegular],
    });

    const bigFontSize = drawBigFont(win) ? 34 : 24;
    const fontSize = drawBigFont(win) ? 20 : 16;

    const headerP = useDerivedValue(() => {
        if (!fontMgr) {
            return null;
        }
        const paragraphStyle = {
            textAlign: TextAlign.Center,
        };
        const textStyle: SkTextStyle = {
            color: Skia.Color(palette.white),
            fontFamilies: ["Jura"],
            fontSize: bigFontSize,
            fontStyle: {
                weight: 500,
            },
            letterSpacing: 0.5,
        };

        return Skia.ParagraphBuilder.Make(paragraphStyle, fontMgr)
            .pushStyle(textStyle)
            .addText(headerText.value)
            .build();
    });

    const bodyP = useDerivedValue(() => {
        if (!fontMgr) {
            return null;
        }
        const paragraphStyle: SkParagraphStyle = {
            textAlign: TextAlign.Left,
        };
        const textStyle: SkTextStyle = {
            color: Skia.Color(palette.white),
            fontFamilies: ["Rajdhani"],
            fontSize: fontSize,
            fontStyle: {
                weight: 400,
            },
            letterSpacing: fontSize * 0.05,
        };

        return Skia.ParagraphBuilder.Make(paragraphStyle, fontMgr)
            .pushStyle(textStyle)
            .addText(bodyText.value)
            .build();
    });

    const buttonP = useDerivedValue(() => {
        buttonTextChanged.value;
        if (!fontMgr) {
            return null;
        }
        const paragraphStyle = {
            textAlign: TextAlign.Center,
        };
        const textStyle: SkTextStyle = {
            color: Skia.Color(palette.blueTint2),
            fontFamilies: ["Jura"],
            fontSize: bigFontSize * 0.8,
            fontStyle: {
                weight: 400,
            },
            letterSpacing: bigFontSize * 0.05,
        };

        return Skia.ParagraphBuilder.Make(paragraphStyle, fontMgr)
            .pushStyle(textStyle)
            .addText(buttonText.value)
            .build();
    });

    // Take over "Back" Navigation from the system, we'll use gestures below
    React.useEffect(() => {
        const backListener = BackHandler.addEventListener(
            "hardwareBackPress",
            () => {
                // when this callback returns false, the hardware back is
                // actuated, when it returns true the hardware back is ignored.
                if (currentView.value === 0) {
                    return false; // allow hardware back from first view only
                } else {
                    return true;
                }
            },
        );

        return () => {
            backListener.remove();
        };
    }, []);

    function replaceOrGoBack() {
        // this will be called in an animation callback using runOnJS, need to
        // encapsulate so we can consume the output of a synchronous function.
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace("/(app)/");
        }
    }

    async function goToNext() {
        const beforeNext = views[currentView.value].beforeNext;
        if (beforeNext) {
            await beforeNext();
        }
        if (currentView.value < views.length - 1) {
            // continue onboarding
            currentView.value += 1;
        } else {
            // onboarding done, record completion and fade to main view
            await AsyncStorage.setItem(ASYNCSTORAGE_HAS_ONBOARDED_KEY, "true");
            everythingOpacity.value = withTiming(0, { duration: 500 }, () => {
                runOnJS(replaceOrGoBack)();
            });
        }
    }

    const buttonGesture = Gesture.Tap().onEnd(goToNext).runOnJS(true);

    const anywhereGesture = Gesture.Pan()
        .onEnd(async (event) => {
            if (event.translationX < -usableWidth * 0.1) {
                // when user swipes over 10% to the right, move view forward
                goToNext();
            } else if (event.translationX > usableWidth * 0.1) {
                // when user swipes over 10% to the left, move view backwards
                if (currentView.value > 0) {
                    currentView.value -= 1;
                }
            }
        })
        .runOnJS(true);

    const everythingOpacity = useSharedValue(0);
    const everythingOpacityMatrix = useDerivedValue(() => {
        // prettier-ignore
        return [
          //R, G, B, A, Bias
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, everythingOpacity.value, 0,
        ];
    });

    const contentOpacity = useSharedValue(1);
    const contentOpacityMatrix = useDerivedValue(() => {
        // prettier-ignore
        return [
          //R, G, B, A, Bias
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, contentOpacity.value, 0,
        ];
    });

    React.useEffect(() => {
        everythingOpacity.value = withTiming(1, { duration: 1000 });
    }, []);

    return (
        <SafeAreaView>
            <GestureHandlerRootView>
                <Canvas style={[ss.flex]}>
                    <Group
                        layer={
                            <Paint>
                                <ColorMatrix matrix={everythingOpacityMatrix} />
                            </Paint>
                        }
                    >
                        <Fill>
                            <LinearGradient
                                start={vec(win.width / 2, 0)}
                                end={vec(win.width / 2, win.height)}
                                colors={[
                                    palette.black,
                                    palette.black,
                                    palette.black,
                                    palette.purpleShade3,
                                    palette.maroon,
                                ]}
                            />
                        </Fill>
                        <Group
                            layer={
                                <Paint>
                                    <ColorMatrix
                                        matrix={contentOpacityMatrix}
                                    />
                                </Paint>
                            }
                        >
                            <Group transform={headerTransform}>
                                <Paragraph
                                    paragraph={headerP}
                                    x={0}
                                    y={0}
                                    width={headerSize.width}
                                />
                            </Group>
                            <Group transform={sceneTransform}>
                                <OnboardingScene
                                    currentView={currentView}
                                    sceneWidth={sceneSize.width}
                                    sceneHeight={sceneSize.height}
                                />
                            </Group>
                            <Group transform={bodyTransform}>
                                <Paragraph
                                    paragraph={bodyP}
                                    x={0}
                                    y={0}
                                    width={bodySize.width}
                                />
                            </Group>
                            <Group transform={dotsTransform}>
                                <ProgressDots
                                    dotWidth={dotWidth}
                                    currentView={currentView}
                                />
                            </Group>
                            <Group transform={buttonTransform}>
                                <RoundedRect
                                    x={0}
                                    y={0}
                                    width={buttonSize.width}
                                    height={buttonSize.height}
                                    style="stroke"
                                    strokeWidth={3}
                                    color={palette.blueTint2}
                                    r={buttonBorderRadius}
                                />
                                <Paragraph
                                    paragraph={buttonP}
                                    x={0}
                                    y={usableHeight * 0.02}
                                    width={buttonSize.width}
                                />
                            </Group>
                        </Group>
                    </Group>
                </Canvas>
                <GestureDetector gesture={anywhereGesture}>
                    <Animated.View
                        accessible={true}
                        accessibilityLabel={"Onboarding Info, will update"}
                        accessibilityRole={"text"}
                        aria-valuetext={bodyText}
                        style={{
                            position: "absolute",
                            width: usableWidth,
                            height: usableHeight,
                        }}
                    />
                </GestureDetector>
                <GestureDetector gesture={buttonGesture}>
                    <Animated.View
                        accessible={true}
                        accessibilityLabel={buttonText}
                        accessibilityRole={"button"}
                        style={{
                            position: "absolute",
                            borderRadius: buttonBorderRadius,
                            transform: buttonTransform,
                            width: buttonSize.width,
                            height: buttonSize.height,
                        }}
                    />
                </GestureDetector>
            </GestureHandlerRootView>
            <Animated.View style={{ opacity: everythingOpacity }}>
                <Animated.View style={learnMoreLinkStyle}>
                    <LearnMoreLink
                        textStyle={{ ...ss.boldFont, ...ss.whiteText }}
                        containerHeight={privacyPolicyHeight}
                    />
                </Animated.View>
            </Animated.View>
            <Animated.View style={{ opacity: everythingOpacity }}>
                <Animated.View style={privacyPolicyLinkStyle}>
                    <PrivacyPolicyLink
                        textStyle={{ ...ss.boldFont, ...ss.whiteText }}
                        containerHeight={privacyPolicyHeight}
                    />
                </Animated.View>
            </Animated.View>
        </SafeAreaView>
    );
}

function ProgressDots({
    dotWidth,
    currentView,
}: {
    dotWidth: number;
    currentView: SharedValue<number>;
}) {
    // Couldn't figure out a way to avoid hardcoding these
    const dot0Fill = useDerivedValue(() => {
        return currentView.value >= 0 ? palette.blueTint2 : palette.transparent;
    });
    const dot1Fill = useDerivedValue(() => {
        return currentView.value >= 1 ? palette.blueTint2 : palette.transparent;
    });
    const dot2Fill = useDerivedValue(() => {
        return currentView.value >= 2 ? palette.blueTint2 : palette.transparent;
    });
    const dot3Fill = useDerivedValue(() => {
        return currentView.value >= 3 ? palette.blueTint2 : palette.transparent;
    });

    return (
        <Group>
            <Circle
                c={vec(dotWidth * 0, 0)}
                r={dotWidth / 4}
                style={"stroke"}
                strokeWidth={1}
                color={palette.blueTint2}
            />
            <Circle
                c={vec(dotWidth * 0, 0)}
                r={dotWidth / 4}
                style={"fill"}
                color={dot0Fill}
            />
            <Circle
                c={vec(dotWidth * 1, 0)}
                r={dotWidth / 4}
                style={"stroke"}
                strokeWidth={1}
                color={palette.blueTint2}
            />
            <Circle
                c={vec(dotWidth * 1, 0)}
                r={dotWidth / 4}
                style={"fill"}
                color={dot1Fill}
            />
            <Circle
                c={vec(dotWidth * 2, 0)}
                r={dotWidth / 4}
                style={"stroke"}
                strokeWidth={1}
                color={palette.blueTint2}
            />
            <Circle
                c={vec(dotWidth * 2, 0)}
                r={dotWidth / 4}
                style={"fill"}
                color={dot2Fill}
            />
            <Circle
                c={vec(dotWidth * 3, 0)}
                r={dotWidth / 4}
                style={"stroke"}
                strokeWidth={1}
                color={palette.blueTint2}
            />
            <Circle
                c={vec(dotWidth * 3, 0)}
                r={dotWidth / 4}
                style={"fill"}
                color={dot3Fill}
            />
        </Group>
    );
}
