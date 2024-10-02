import {
    Canvas,
    Circle,
    ColorMatrix,
    Fill,
    Group,
    Image,
    LinearGradient,
    Paint,
    Paragraph,
    RoundedRect,
    SkImage,
    SkTextStyle,
    Skia,
    TextAlign,
    useFonts,
    useImage,
    vec,
} from "@shopify/react-native-skia";
import * as Notifications from "expo-notifications";
import { useTranslation } from "react-i18next";
import { BackHandler, useWindowDimensions } from "react-native";
import Animated, {
    runOnJS,
    useDerivedValue,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

import { useNotificationsPermissions } from "@/src/components/NotificationsStatus";
import { PrivacyPolicyLink } from "@/src/components/PrivacyPolicyLink";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { fonts, palette, sharedStyles as ss } from "@/src/styles";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React from "react";
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function OnboardingScreen() {
    const win = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const notificationPermissions = useNotificationsPermissions();

    const [shouldAskForNotifications, setShouldAskForNotifications] =
        React.useState(false);
    const buttonTextChanged = useSharedValue(false);

    React.useEffect(() => {
        if (
            notificationPermissions.data &&
            !notificationPermissions.data.granted &&
            notificationPermissions.data.canAskAgain
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
            image: useImage(require("@/assets/images/onboarding-welcome.png")),
            bodyText: t("ONBOARDING_WELCOME_BODY_I18N.string"),
            buttonText: t("ONBOARDING_WELCOME_BUTTON_I18N.string"),
            buttonBeforeNext: undefined,
        },
        {
            // INFO_1
            headerText: t("ONBOARDING_INFO_1_HEADER_I18N.string"),
            image: useImage(
                require("@/assets/images/onboarding-instructions.png"),
            ),
            bodyText: t("ONBOARDING_INFO_1_BODY_I18N.string"),
            buttonText: t("ONBOARDING_INFO_1_BUTTON_I18N.string"),
            buttonBeforeNext: undefined,
        },
        {
            // PERMISSIONS
            headerText: t("ONBOARDING_PERMISSIONS_HEADER_I18N.string"),
            image: useImage(
                require("@/assets/images/onboarding-permissions.png"),
            ),
            bodyText: t("ONBOARDING_PERMISSIONS_BODY_I18N.string"),
            buttonText: shouldAskForNotifications
                ? t("ONBOARDING_ENABLE_NOTIFICATIONS_BUTTON_I18N.string")
                : t("ONBOARDING_PERMISSIONS_BUTTON_I18N.string"),
            buttonBeforeNext: async () => {
                if (shouldAskForNotifications) {
                    await Notifications.requestPermissionsAsync();
                }
            },
        },
        {
            // PRIVACY POLICY
            headerText: t("ONBOARDING_PRIVACY_POLICY_HEADER_I18N.string"),
            image: useImage(
                require("@/assets/images/onboarding-privacy-policy.png"),
            ),
            bodyText: t("ONBOARDING_PRIVACY_POLICY_BODY_I18N.string"),
            buttonText: t("ONBOARDING_PRIVACY_POLICY_BUTTON_I18N.string"),
            buttonBeforeNext: undefined,
        },
    ];

    const currentView = useSharedValue(0);
    const headerText = useDerivedValue(() => {
        return views[currentView.value].headerText;
    });
    const bodyText = useDerivedValue(() => {
        return views[currentView.value].bodyText;
    });
    const buttonText = useDerivedValue(() => {
        return views[currentView.value].buttonText;
    });

    const fontMgr = useFonts({
        Rajdhani: [fonts.Rajdhani],
        Jura: [fonts.JuraRegular],
    });

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
            fontSize: 34,
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

    const image = useDerivedValue<SkImage | null>(() => {
        return views[currentView.value].image;
    });

    const bodyP = useDerivedValue(() => {
        if (!fontMgr) {
            return null;
        }
        const paragraphStyle = {
            textAlign: TextAlign.Left,
        };
        const textStyle: SkTextStyle = {
            color: Skia.Color(palette.white),
            fontFamilies: ["Rajdhani"],
            fontSize: 20,
            fontStyle: {
                weight: 400,
            },
            letterSpacing: 1,
        };

        return Skia.ParagraphBuilder.Make(paragraphStyle, fontMgr)
            .pushStyle(textStyle)
            .addText(bodyText.value)
            .build();
    });
    const bodyTransform = [
        { translateY: usableHeight * 0.55 },
        { translateX: usableWidth * 0.06 },
    ];
    const bodySize = {
        width: usableWidth * 0.88,
    };

    const dotWidth = 24;
    const dotsTransform = [
        { translateY: usableHeight * 0.8 },
        { translateX: usableWidth * 0.5 - (dotWidth * (views.length - 1)) / 2 },
    ];
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
            fontSize: 28,
            fontStyle: {
                weight: 400,
            },
            letterSpacing: 1,
        };

        return Skia.ParagraphBuilder.Make(paragraphStyle, fontMgr)
            .pushStyle(textStyle)
            .addText(buttonText.value)
            .build();
    });

    const buttonTransform = [
        { translateY: usableHeight * 0.85 },
        { translateX: usableWidth * 0.06 },
    ];
    const buttonSize = {
        width: usableWidth * 0.88,
        height: usableHeight * 0.08,
    };
    const buttonBorderRadius = 17;

    // Take over "Back" Navigation from the system, we'll use gestures below
    React.useEffect(() => {
        const backListener = BackHandler.addEventListener(
            "hardwareBackPress",
            () => {
                console.log("HARDWARE BACK, current view", currentView.value);
                if (currentView.value === 0) {
                    console.log("HARDWARE BACK ALLOWED");
                    return false; // allow hardware back from first view only
                } else {
                    console.log("HARDWARE BACK DISALLOWED");
                    return true; // disable hardware back, we'll handle the gesture
                }
            },
        );

        return () => {
            backListener.remove();
        };
    }, []);

    async function goToNext() {
        if (currentView.value < views.length - 1) {
            const beforeNext = views[currentView.value].buttonBeforeNext;
            if (beforeNext) {
                await beforeNext();
            }
            currentView.value += 1;
        } else {
            runOnJS(goToMainApp)();
        }
    }
    async function goToMainApp() {
        everythingOpacity.value = withTiming(0, { duration: 500 }, () => {
            runOnJS(router.replace)("/(app)/");
        });
        await AsyncStorage.setItem("hasOnboarded", "true");
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
                            <Group
                                transform={[{ translateY: win.height * 0.1 }]}
                            >
                                <Paragraph
                                    paragraph={headerP}
                                    x={0}
                                    y={0}
                                    width={usableWidth}
                                />
                            </Group>
                            <Group
                                transform={[{ translateY: win.height * 0.2 }]}
                            >
                                <Image
                                    image={image}
                                    x={usableWidth * 0.18}
                                    width={usableWidth * 0.66}
                                    height={win.height * 0.3}
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
                        style={{
                            position: "absolute",
                            width: usableWidth,
                            height: usableHeight,
                        }}
                    />
                </GestureDetector>
                <GestureDetector gesture={buttonGesture}>
                    <Animated.View
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
                <PrivacyPolicyLink />
            </Animated.View>
        </SafeAreaView>
    );
}
