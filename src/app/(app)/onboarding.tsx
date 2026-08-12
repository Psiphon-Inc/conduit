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
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    BackHandler,
    LayoutChangeEvent,
    Platform,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { drawBigFont } from "@/src/common/utils";
import { ExternalTextLink } from "@/src/components/ExternalTextLink";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { SkyBox } from "@/src/components/SkyBox";
import { OnboardingScene } from "@/src/components/canvas/OnboardingScene";
import {
    APP_MAX_CONTENT_WIDTH,
    ASYNCSTORAGE_HAS_ONBOARDED_KEY,
    LEARN_MORE_URL,
    PRIVACY_POLICY_URL,
} from "@/src/constants";
import { useNotificationsPermissions } from "@/src/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

export default function OnboardingScreen() {
    const win = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { t, i18n } = useTranslation();
    const isRTL = i18n.dir() === "rtl" ? true : false;
    const notificationPermissions = useNotificationsPermissions();
    const router = useRouter();

    const isIOS = Platform.OS === "ios";

    const [shouldAskForNotifications, setShouldAskForNotifications] =
        useState(false);

    useEffect(() => {
        if (
            notificationPermissions.data &&
            notificationPermissions.data === "NOT_GRANTED_CAN_ASK"
        ) {
            setShouldAskForNotifications(true);
        }
    }, [notificationPermissions]);

    // Derive usable dimensions from an absolutely positioned View
    // https://github.com/facebook/react-native/issues/47080
    const [totalUsableWidth, setTotalUsableWidth] = useState(win.width);
    const [totalUsableHeight, setTotalUsableHeight] = useState(win.height);

    function onScreenLayout(event: LayoutChangeEvent) {
        setTotalUsableWidth(
            Math.min(event.nativeEvent.layout.width, APP_MAX_CONTENT_WIDTH),
        );
        setTotalUsableHeight(
            event.nativeEvent.layout.height - (insets.top + insets.bottom),
        );
    }

    const hostedConduitView = {
        // HOSTED CONDUIT
        headerText: t("ONBOARDING_HOSTED_HEADER_I18N.string"),
        bodyText: isIOS
            ? t("ONBOARDING_HOSTED_BODY_IOS_I18N.string")
            : t("ONBOARDING_HOSTED_BODY_I18N.string"),
        buttonText: t("ONBOARDING_HOSTED_BUTTON_I18N.string"),
        beforeNext: undefined,
    };

    const views = [
        {
            // WELCOME
            headerText: t("ONBOARDING_WELCOME_HEADER_I18N.string"),
            bodyText: isIOS
                ? t("ONBOARDING_WELCOME_BODY_IOS_I18N.string")
                : t("ONBOARDING_WELCOME_BODY_I18N.string"),
            buttonText: t("ONBOARDING_WELCOME_BUTTON_I18N.string"),
            beforeNext: undefined,
        },
        {
            // INFO_1
            headerText: t("ONBOARDING_INFO_1_HEADER_I18N.string"),
            bodyText: isIOS
                ? t("ONBOARDING_INFO_1_BODY_IOS_I18N.string")
                : t("ONBOARDING_INFO_1_BODY_I18N.string"),
            buttonText: t("ONBOARDING_INFO_1_BUTTON_I18N.string"),
            beforeNext: undefined,
        },
        ...(isIOS ? [] : [hostedConduitView]),
        {
            // PRIVACY POLICY
            headerText: t("ONBOARDING_PRIVACY_POLICY_HEADER_I18N.string"),
            bodyText: isIOS
                ? t("ONBOARDING_PRIVACY_POLICY_BODY_IOS_I18N.string")
                : t("ONBOARDING_PRIVACY_POLICY_BODY_I18N.string"),
            buttonText: t("ONBOARDING_PRIVACY_POLICY_BUTTON_I18N.string"),
            beforeNext: undefined,
        },
        {
            // PERMISSIONS
            headerText: t("ONBOARDING_PERMISSIONS_HEADER_I18N.string"),
            bodyText: isIOS
                ? t("ONBOARDING_PERMISSIONS_BODY_IOS_I18N.string")
                : t("ONBOARDING_PERMISSIONS_BODY_I18N.string"),
            buttonText: isIOS
                ? t("ONBOARDING_PERMISSIONS_BUTTON_IOS_I18N.string")
                : t("ONBOARDING_PERMISSIONS_BUTTON_I18N.string"),
            beforeNext: async () => {
                if (shouldAskForNotifications) {
                    await Notifications.requestPermissionsAsync();
                }
            },
        },
    ];
    const privacyPolicyViewIndex = isIOS ? 2 : 3;

    // The scene children react to this on the UI thread; the screen's own
    // text and dots render from plain state.
    const sceneCurrentView = useSharedValue(0);
    const [viewIndex, setViewIndex] = useState(0);

    function sceneIndexForView(index: number) {
        return isIOS && index >= privacyPolicyViewIndex ? index + 1 : index;
    }

    function updateCurrentView(newIndex: number) {
        sceneCurrentView.value = sceneIndexForView(newIndex);
        setViewIndex(newIndex);
    }

    const currentViewContent = views[viewIndex];

    // header takes up the first 12% of usableHeight
    const headerTransform = [
        { translateY: totalUsableHeight * 0.05 },
        { translateX: totalUsableWidth * 0.02 },
    ];
    const headerSize = {
        width: totalUsableWidth * 0.96,
    };
    // image takes up the next 28% of usableHeight (40% total)
    const sceneTransform = [{ translateY: totalUsableHeight * 0.12 }];
    const sceneSize = {
        width: totalUsableWidth,
        height: totalUsableHeight * 0.25,
    };
    // body takes up the next 36% of usableHeight (76% total)
    const bodyTransform = [
        { translateY: totalUsableHeight * 0.4 },
        { translateX: totalUsableWidth * 0.06 },
    ];
    const bodySize = {
        width: totalUsableWidth * 0.88,
        height: totalUsableHeight * 0.36,
    };
    // indicator dots take up the next 3% of usableHeight (78% total)
    const dotWidth = 24;
    const dotsTransform = [
        { translateY: totalUsableHeight * 0.77 },
        {
            translateX:
                totalUsableWidth * 0.5 - (dotWidth * (views.length - 1)) / 2,
        },
    ];
    // button claims the next 8% of usableHeight (90% total)
    const buttonTransform = [
        { translateY: totalUsableHeight * 0.81 },
        { translateX: totalUsableWidth * 0.06 },
    ];
    const buttonSize = {
        width: totalUsableWidth * 0.88,
        height: totalUsableHeight * 0.08,
    };
    const buttonBorderRadius = 15;
    const privacyPolicyHeight = totalUsableHeight * 0.05;
    // 10% of usable height is left for the Privacy Policy link to appear in

    const bigFontSize = drawBigFont(win) ? 34 : 24;
    const fontSize = drawBigFont(win) ? 20 : 16;

    // Take over "Back" Navigation from the system, we'll use gestures below
    useEffect(() => {
        const backListener = BackHandler.addEventListener(
            "hardwareBackPress",
            () => {
                // when this callback returns false, the hardware back is
                // actuated, when it returns true the hardware back is ignored.
                if (viewIndexRef.current === 0) {
                    return false; // allow hardware back from first view only
                } else {
                    return true;
                }
            },
        );

        return () => {
            backListener.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Ref mirror so the stable BackHandler callback sees the latest index.
    const viewIndexRef = { current: viewIndex };
    viewIndexRef.current = viewIndex;

    const everythingOpacity = useSharedValue(0);

    function replaceOrGoBack() {
        // this will be called in an animation callback using runOnJS, need to
        // encapsulate so we can consume the output of a synchronous function.
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace("/(app)");
        }
    }

    async function goToNext() {
        const beforeNext = views[viewIndex].beforeNext;
        if (beforeNext) {
            await beforeNext();
        }
        if (viewIndex < views.length - 1) {
            // continue onboarding
            updateCurrentView(viewIndex + 1);
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
            if (event.translationX < -totalUsableWidth * 0.1) {
                // when user swipes over 10% to the right, move view forward
                goToNext();
            } else if (event.translationX > totalUsableWidth * 0.1) {
                // when user swipes over 10% to the left, move view backwards
                if (viewIndex > 0) {
                    updateCurrentView(viewIndex - 1);
                }
            }
        })
        .runOnJS(true);

    useEffect(() => {
        everythingOpacity.value = withTiming(1, { duration: 1000 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const everythingStyle = useAnimatedStyle(
        () => ({ opacity: everythingOpacity.value }),
        [everythingOpacity],
    );

    return (
        <GestureHandlerRootView>
            <View onLayout={onScreenLayout} style={[ss.absoluteFill]} />
            <SkyBox />
            <SafeAreaView>
                <View
                    style={{
                        flex: 1,
                        width: "100%",
                        maxWidth: APP_MAX_CONTENT_WIDTH,
                        alignSelf: "center",
                    }}
                >
                    <Animated.View
                        style={[ss.absoluteFill, everythingStyle]}
                        pointerEvents="none"
                    >
                        <View
                            style={{
                                position: "absolute",
                                transform: headerTransform,
                                width: headerSize.width,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: "JuraRegular",
                                    fontSize: bigFontSize,
                                    letterSpacing: 0.5,
                                    color: palette.black,
                                    textAlign: "center",
                                    fontWeight: "500",
                                }}
                            >
                                {currentViewContent.headerText}
                            </Text>
                        </View>
                        <View
                            style={{
                                position: "absolute",
                                transform: sceneTransform,
                            }}
                        >
                            <OnboardingScene
                                currentView={sceneCurrentView}
                                sceneWidth={sceneSize.width}
                                sceneHeight={sceneSize.height}
                            />
                        </View>
                        <View
                            style={{
                                position: "absolute",
                                transform: bodyTransform,
                                width: bodySize.width,
                                height: bodySize.height,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: "Rajdhani",
                                    fontSize: fontSize,
                                    letterSpacing: fontSize * 0.05,
                                    color: palette.black,
                                    textAlign: isRTL ? "right" : "left",
                                    writingDirection: isRTL ? "rtl" : "ltr",
                                }}
                            >
                                {currentViewContent.bodyText}
                            </Text>
                        </View>
                        <View
                            style={{
                                position: "absolute",
                                transform: dotsTransform,
                                flexDirection: "row",
                            }}
                        >
                            {views.map((_, index) => (
                                <View
                                    key={`dot-${index}`}
                                    style={{
                                        width: dotWidth / 2,
                                        height: dotWidth / 2,
                                        marginRight: dotWidth / 2,
                                        borderRadius: dotWidth / 4,
                                        borderWidth: 1,
                                        borderColor: palette.purple,
                                        backgroundColor:
                                            viewIndex >= index
                                                ? palette.purple
                                                : palette.transparent,
                                    }}
                                />
                            ))}
                        </View>
                        <View
                            style={{
                                position: "absolute",
                                transform: buttonTransform,
                                width: buttonSize.width,
                                height: buttonSize.height,
                                borderRadius: buttonBorderRadius,
                                borderWidth: 3,
                                borderColor: palette.purple,
                                backgroundColor: palette.white,
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: "JuraRegular",
                                    fontSize: bigFontSize * 0.8,
                                    letterSpacing: bigFontSize * 0.05,
                                    color: palette.purple,
                                    textAlign: "center",
                                }}
                            >
                                {currentViewContent.buttonText}
                            </Text>
                        </View>
                    </Animated.View>
                    <GestureDetector gesture={anywhereGesture}>
                        <Animated.View
                            accessible={true}
                            accessibilityLabel={t(
                                "ONBOARDING_INFO_ACCESSIBILITY_I18N.string",
                            )}
                            accessibilityRole={"text"}
                            aria-valuetext={currentViewContent.bodyText}
                            style={{
                                position: "absolute",
                                width: totalUsableWidth,
                                height: totalUsableHeight,
                            }}
                        />
                    </GestureDetector>
                    <GestureDetector gesture={buttonGesture}>
                        <Animated.View
                            testID="onboarding-next"
                            accessible={true}
                            accessibilityLabel={currentViewContent.buttonText}
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
                    <Animated.View
                        style={[ss.absoluteFill, everythingStyle]}
                        pointerEvents="box-none"
                    >
                        {viewIndex === 1 ? (
                            <ExternalTextLink
                                url={LEARN_MORE_URL}
                                labelKey="LEARN_MORE_I18N.string"
                                accessibilityLabelKey="LINK_TO_INFO_WEBSITE_ACCESSIBILITY_I18N.string"
                                textStyle={{ ...ss.boldFont, ...ss.purpleText }}
                                containerHeight={privacyPolicyHeight}
                            />
                        ) : null}
                        {viewIndex === privacyPolicyViewIndex ? (
                            <ExternalTextLink
                                url={PRIVACY_POLICY_URL}
                                labelKey="PRIVACY_POLICY_I18N.string"
                                accessibilityLabelKey="LINK_TO_PRIVACY_POLICY_ACCESSIBILITY_I18N.string"
                                textStyle={{ ...ss.boldFont, ...ss.purpleText }}
                                containerHeight={privacyPolicyHeight}
                            />
                        ) : null}
                    </Animated.View>
                </View>
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}
