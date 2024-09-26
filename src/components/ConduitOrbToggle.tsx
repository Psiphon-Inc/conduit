import {
    Blur,
    Canvas,
    Circle,
    ColorMatrix,
    ColorShader,
    Group,
    Image,
    Paint,
    RadialGradient,
    Shadow,
    Text,
    interpolateColors,
    useFont,
    useImage,
    vec,
} from "@shopify/react-native-skia";
import { VideoView, useVideoPlayer } from "expo-video";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import {
    useDerivedValue,
    useSharedValue,
    withDelay,
    withRepeat,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import { useInProxyContext } from "@/src/inproxy/context";
import {
    useInProxyCurrentConnectedClients,
    useInProxyStatus,
} from "@/src/inproxy/hooks";
import { fonts, palette, sharedStyles as ss } from "@/src/styles";
import { z } from "zod";
import { ConduitConnectionLight } from "./ConduitConnectionLight";

export function ConduitOrbToggle({ size }: { size: number }) {
    const { t } = useTranslation();
    const { toggleInProxy } = useInProxyContext();
    const { data: inProxyStatus } = useInProxyStatus();
    const { data: inProxyCurrentConnectedClients } =
        useInProxyCurrentConnectedClients();

    // At the top of the canvas there is a grid of dots around the Psiphon logo,
    // representing the Psiphon Network the InProxy is proxying traffic towards.
    const dotsPng = useImage(require("@/assets/images/dots.png"));
    const psiphonLogoPng = useImage(
        require("@/assets/images/psiphon-logo.png"),
    );
    // the dots and Psiphon logo will fade in
    const dotsOpacity = useSharedValue(0);
    const psiphonLogoOpacity = useDerivedValue(() => {
        return dotsOpacity.value - 0.2;
    });

    // In the center of the canvas is the orb, a button that toggles InProxy.
    // The orb will have an animated gradient depending on InProxyState, flowing
    // between the following colors
    const orbColors = [
        palette.black,
        palette.blueShade3,
        palette.purpleShade3,
        palette.redShade3,
        palette.purpleShade3,
    ];
    // Animate the index of this array of colors, interpolating a gradient
    const orbColorsIndex = useSharedValue(0);
    const orbGradientColors = useDerivedValue(() => {
        return [
            palette.black,
            interpolateColors(orbColorsIndex.value, [0, 1, 2, 3, 4], orbColors),
        ];
    });
    // The "Turn On" text also uses interpolation to appear to fade in by going
    // from transparent to it's final color.
    const orbText = t("TURN_ON_I18N.string");
    const orbTextColors = [palette.transparent, palette.white];
    const orbTextColorIndex = useSharedValue(0);
    const orbTextColor = useDerivedValue(() => {
        return interpolateColors(
            orbTextColorIndex.value,
            [0, 1],
            orbTextColors,
        );
    });
    // The orb will pop into existence at the start, animating from radius 0 up
    const orbRadius = useSharedValue(0);
    const finalOrbRadius = size / 4;
    // Use a transform to center the orb and the lights that flow through it
    const orbCenteringTransform = [
        {
            translateY: size / 2 + finalOrbRadius / 2,
        },
        {
            translateX: size / 2,
        },
    ];

    function animateProxyAnnouncing() {
        console.log("animateProxyAnnouncing()");
        orbColorsIndex.value = withRepeat(
            // only animate through the first 4 colors while announcing
            withTiming(3, {
                duration: 2000,
            }),
            -1,
            true,
        );
        orbTextColorIndex.value = withTiming(0, { duration: 500 });
        dotsOpacity.value = withTiming(1, { duration: 1000 });
    }

    function animateProxyInUse() {
        console.log("animateProxyInUse()");
        orbColorsIndex.value = withTiming(4, { duration: 2000 });
        dotsOpacity.value = withTiming(1, { duration: 1000 });
    }

    function animateTurnOffProxy() {
        console.log("animateTurnOffProxy()");
        orbColorsIndex.value = withTiming(0, { duration: 500 });
        orbTextColorIndex.value = withTiming(1, { duration: 500 });
        dotsOpacity.value = withTiming(0.2, { duration: 1000 });
    }

    function animateIntro(delay: number) {
        console.log(`animateIntro(${delay})`);
        orbRadius.value = withDelay(
            delay,
            withSpring(finalOrbRadius, {
                mass: 1,
                damping: 10,
                stiffness: 100,
                overshootClamping: false,
                restDisplacementThreshold: 0.01,
                restSpeedThreshold: 2,
            }),
        );
        dotsOpacity.value = withDelay(
            delay,
            withTiming(0.2, { duration: 1000 }),
        );
        if (delay > 0) {
            // if we're introing with a delay, it means the InProxy is stopped,
            // so we will fade in our button text.
            orbTextColorIndex.value = withDelay(
                delay,
                withTiming(1, { duration: 1000 }),
            );
        }
    }

    // We have 4 animation states that depend on the state of the InProxy:
    const AnimationStateSchema = z.enum([
        // Conduit running but 0 clients connected, the orb will pulse.
        "ProxyAnnouncing",
        // Conduit running with > 0 clients connected, flying lights.
        "ProxyInUse",
        // Conduit stopped, animates values towards the "off" state
        "ProxyIdle",
        // InProxy Status is not yet known, so we don't animate anything yet
        "Unknown",
    ]);
    type AnimationState = z.infer<typeof AnimationStateSchema>;
    const animationState = React.useRef<AnimationState>("Unknown");
    React.useEffect(() => {
        if (inProxyStatus === "RUNNING") {
            if (inProxyCurrentConnectedClients === 0) {
                if (animationState.current !== "ProxyAnnouncing") {
                    animateProxyAnnouncing();
                    animationState.current = "ProxyAnnouncing";
                }
            } else {
                if (animationState.current !== "ProxyInUse") {
                    animateProxyInUse();
                    animationState.current = "ProxyInUse";
                }
            }
        } else if (inProxyStatus === "STOPPED") {
            if (
                animationState.current !== "ProxyIdle" &&
                animationState.current !== "Unknown"
            ) {
                animateTurnOffProxy();
                animationState.current = "ProxyIdle";
            }
        }
        // implicit do nothing if status is UNKNOWN
    }, [inProxyStatus, inProxyCurrentConnectedClients]);

    // In addition to the 4 inProxyStatus dependent animation states above, we
    // also have an intro animation to play when the app is opened.
    const introVideoPlayer = useVideoPlayer(
        require("@/assets/video/particle-swirl.mp4"),
        (player) => {
            player.loop = false;
            player.play();
        },
    );
    // If InProxy is already RUNNING when the app is opened, the intro animation
    // will be a quick fade in of the UI. If the InProxy is STOPPED when the app
    // is opened, this fade should be delayed until the particle animation video
    // has played.
    // The inProxyStatus will begin as UNKNOWN, and then become RUNNING or
    // STOPPED once the module is hooked up. We need only want to play the
    // particle effect intro if the proxy is stopped when the app is opened.
    const [showVideo, setShowVideo] = React.useState(false);
    const initialStateDetermined = React.useRef(false);
    React.useEffect(() => {
        if (!initialStateDetermined.current) {
            if (inProxyStatus === "RUNNING") {
                // Already Running: play intro animation without delay
                setShowVideo(false);
                animateIntro(0);
                initialStateDetermined.current = true;
            } else if (inProxyStatus === "STOPPED") {
                // Stopped: play intro video and delay animation
                setShowVideo(true);
                setTimeout(() => {
                    setShowVideo(false);
                }, 2800);
                animateIntro(2800);
                initialStateDetermined.current = true;
                animationState.current = "ProxyIdle";
            }
            // implicit do nothing if status is UNKNOWN
        }
    }, [inProxyStatus]);

    // This morphLayer creates a neat effect where elements that are close to
    // each other appear to morph together. Any overlapping elements in the
    // Group with this layer applied to it will have the effect applied.
    const morphLayer = React.useMemo(() => {
        return (
            <Paint>
                <Blur blur={5} />
                <ColorMatrix
                    // prettier-ignore
                    matrix={[
                        // R, G, B, A, Bias
                        1, 0, 0, 0, 0,
                        0, 1, 0, 0, 0,
                        0, 0, 1, 0, 0,
                        0, 0, 0, 5, -2,
                    ]}
                />
            </Paint>
        );
    }, []);

    const font = useFont(fonts.JuraRegular, 20);
    if (!font) {
        return null;
    }
    const orbTextXOffset = -font.measureText(orbText).width / 2;
    const orbTextYOffset = font.measureText(orbText).height / 2;

    return (
        <View
            style={{
                width: size,
                height: size,
            }}
        >
            {/* intro video played if Conduit Station is off on start */}
            {showVideo && (
                <VideoView
                    style={[
                        ss.absolute,
                        {
                            top: finalOrbRadius / 2,
                            width: size,
                            height: size,
                        },
                    ]}
                    player={introVideoPlayer}
                    nativeControls={false}
                />
            )}
            <Canvas style={[ss.flex]}>
                <Group>
                    {/* the red dots at top representing Psiphon Network */}
                    <Image
                        image={dotsPng}
                        x={size / 2 - 128 / 2}
                        y={0}
                        width={128}
                        height={90}
                        fit={"contain"}
                        opacity={dotsOpacity}
                    />
                </Group>
                <Group>
                    {/* The Orb and Lights Scene*/}
                    <Group transform={orbCenteringTransform}>
                        {/* vec(0,0) at the center of the Orb */}
                        <Group layer={morphLayer}>
                            {/* morph layer blurs overlapping elements together */}
                            <Group>
                                {/* The Orb */}
                                <Circle r={orbRadius} color={palette.black}>
                                    <Shadow
                                        dx={10}
                                        dy={10}
                                        blur={10}
                                        color={palette.purple}
                                        inner
                                    />
                                    <Shadow
                                        dx={-10}
                                        dy={-10}
                                        blur={10}
                                        color={palette.blue}
                                        inner
                                    />
                                    <RadialGradient
                                        c={vec(0, 0)}
                                        r={finalOrbRadius}
                                        colors={orbGradientColors}
                                    />
                                </Circle>
                                <Circle
                                    r={finalOrbRadius}
                                    style="stroke"
                                    strokeWidth={2}
                                    color={palette.blueTint4}
                                />
                            </Group>
                            {/* 1 flying light per connected client */}
                            {[
                                ...Array(inProxyCurrentConnectedClients).keys(),
                            ].map((i) => {
                                return (
                                    <ConduitConnectionLight
                                        key={i}
                                        canvasSize={size}
                                        orbRadius={finalOrbRadius}
                                    />
                                );
                            })}
                        </Group>
                        <Group>
                            {/* Turn ON text displayed when Conduit is off */}
                            <Text
                                x={orbTextXOffset}
                                y={orbTextYOffset}
                                text={orbText}
                                font={font}
                            >
                                <ColorShader color={orbTextColor} />
                            </Text>
                        </Group>
                    </Group>
                </Group>
                <Group>
                    {/* the psiphon logo at top z-indexed above orbs */}
                    <Image
                        image={psiphonLogoPng}
                        x={size / 2 - 29 / 2}
                        y={0}
                        width={29}
                        height={29}
                        fit={"contain"}
                        opacity={psiphonLogoOpacity}
                    />
                </Group>
            </Canvas>
            {/* Pressable overlay over orb to turn it ON */}
            <Pressable
                style={[
                    ss.absolute,
                    {
                        width: finalOrbRadius * 2,
                        height: finalOrbRadius * 2,
                        left: 0.25 * size,
                        top: size / 2 + finalOrbRadius / 2 - finalOrbRadius,
                        borderRadius: size / 2,
                    },
                ]}
                onPress={() => {
                    toggleInProxy();
                }}
            />
        </View>
    );
}
