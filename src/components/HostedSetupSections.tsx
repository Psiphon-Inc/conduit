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
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import { Image as ExpoImage } from "expo-image";
import * as Linking from "expo-linking";
import React from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

import { isE2E } from "@/src/common/e2e";
import {
    APPLE_STANDARD_EULA_URL,
    PRIVACY_POLICY_URL,
    TERMS_OF_USE_URL,
} from "@/src/constants";
import { HostedOnboardingPrimaryAction } from "@/src/hosted/experience/onboarding";
import {
    HostedPlanOption,
    formatHostedPlanPrice,
} from "@/src/hosted/planUtils";
import { palette, sharedStyles as ss } from "@/src/styles";

type ActionButtonVariant = "primary" | "secondary";

const GOOGLE_SIGN_IN_ICON = require("@/assets/images/google.png");
const APPLE_SIGN_IN_ICON = require("@/assets/images/apple.png");
const HOSTED_PRIMARY_GRADIENT_START = "#7E5CB8";
const HOSTED_PRIMARY_GRADIENT_END = "rgba(156, 129, 201, 0.69)";

export function HostedPlanSelection({
    offeringsLoading,
    offeringsError,
    options,
    selectedPlanKey,
    onSelectPlan,
    onRetry,
}: {
    offeringsLoading: boolean;
    offeringsError: string | null;
    offeringIdentifier: string | null;
    options: HostedPlanOption[];
    selectedPlanKey: string | null;
    onSelectPlan: (option: HostedPlanOption) => void;
    onRetry: () => void;
}) {
    const { t } = useTranslation();
    return (
        <View style={[ss.column]}>
            <Text style={[ss.extraLargeFont, ss.blackText, ss.centeredText]}>
                {t("CHOOSE_A_PLAN_I18N.string")}
            </Text>
            {offeringsLoading ? (
                <StatusText>Loading plan options from RevenueCat...</StatusText>
            ) : null}
            {options.length > 0
                ? options.map((option) => {
                      const selected = selectedPlanKey === option.key;
                      const textColor = selected
                          ? palette.white
                          : palette.black;
                      const badgeColor = selected
                          ? palette.white
                          : palette.purple;
                      return (
                          <Pressable
                              key={option.key}
                              testID={`plan-${option.matchedPlanId ?? option.key}`}
                              onPress={() => {
                                  onSelectPlan(option);
                              }}
                              style={{
                                  borderWidth: 2,
                                  borderColor: selected
                                      ? palette.purple
                                      : palette.thinPurple,
                                  borderRadius: 14,
                                  paddingHorizontal: 14,
                                  paddingVertical: 12,
                                  backgroundColor: selected
                                      ? HOSTED_PRIMARY_GRADIENT_START
                                      : palette.white,
                                  shadowColor: selected
                                      ? HOSTED_PRIMARY_GRADIENT_START
                                      : palette.transparent,
                                  shadowOpacity: selected ? 0.34 : 0,
                                  shadowRadius: selected ? 12 : 0,
                                  shadowOffset: {
                                      width: 0,
                                      height: selected ? 6 : 0,
                                  },
                                  elevation: selected ? 4 : 0,
                                  gap: 6,
                              }}
                          >
                              <View
                                  style={{
                                      flexDirection: "row",
                                      justifyContent: "space-between",
                                      alignItems: "flex-start",
                                      gap: 8,
                                  }}
                              >
                                  <Text
                                      style={[
                                          ss.bodyFont,
                                          {
                                              color: textColor,
                                              flexShrink: 1,
                                          },
                                      ]}
                                  >
                                      {option.title}
                                  </Text>
                                  {option.badge ? (
                                      <Text
                                          style={[
                                              ss.tinyFont,
                                              { color: badgeColor },
                                          ]}
                                      >
                                          {option.badge}
                                      </Text>
                                  ) : null}
                              </View>
                              {option.features.map((feature) => (
                                  <Text
                                      key={`${option.key}-${feature}`}
                                      style={[
                                          ss.bodyFont,
                                          { fontSize: 16, color: textColor },
                                      ]}
                                  >
                                      - {feature}
                                  </Text>
                              ))}
                              <View
                                  style={{
                                      width: "100%",
                                      justifyContent: "flex-end",
                                      alignItems: "flex-end",
                                  }}
                              >
                                  <Text
                                      style={[
                                          ss.bodyFont,
                                          { color: textColor },
                                      ]}
                                  >
                                      {formatHostedPlanPrice(option)}
                                  </Text>
                              </View>
                          </Pressable>
                      );
                  })
                : null}
            {offeringsError ? <StatusText>{offeringsError}</StatusText> : null}
            {offeringsError ? (
                <ActionButton
                    label={t("RETRY_PLAN_LOAD_I18N.string")}
                    onPress={onRetry}
                    variant="secondary"
                />
            ) : null}
        </View>
    );
}

export function HostedSetupBackButton({ onPress }: { onPress: () => void }) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onPress}
            hitSlop={12}
            style={{
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 12,
            }}
        >
            <View
                style={{
                    width: 12,
                    height: 12,
                    borderLeftWidth: 2,
                    borderBottomWidth: 2,
                    borderColor: palette.purple,
                    transform: [{ rotate: "45deg" }],
                }}
            />
            <Text style={[ss.bodyFont, ss.purpleText]}>Back</Text>
        </Pressable>
    );
}

export function PrimaryActionBlock({
    onboardingAction,
    setupReady,
    authPhase,
    actionPending,
    activatePlan,
    activateOfferingsLoading,
    activateOfferingsError,
    onSignInGoogle,
    onSignInApple,
    onSignInEmailCode,
    onPurchase,
    onRestorePurchases,
    onRecoverAccess,
    recoverActionPending,
    onOpenManage,
}: {
    onboardingAction: HostedOnboardingPrimaryAction;
    setupReady: boolean;
    authPhase: string;
    actionPending: boolean;
    activatePlan: HostedPlanOption | null;
    activateOfferingsLoading: boolean;
    activateOfferingsError: string | null;
    onSignInGoogle: () => void;
    onSignInApple: () => void;
    onSignInEmailCode: (email: string, code: string) => void;
    onPurchase: () => void;
    onRestorePurchases: () => void;
    onRecoverAccess: () => void;
    recoverActionPending: boolean;
    onOpenManage: () => void;
}) {
    const { t } = useTranslation();
    const [e2eEmail, setE2eEmail] = React.useState("");
    const [e2eCode, setE2eCode] = React.useState("");
    if (onboardingAction === "sign_in") {
        return (
            <View style={[ss.column]}>
                <ActionButton
                    testID="signin-google"
                    label={t("SIGN_IN_WITH_GOOGLE_I18N.string")}
                    onPress={onSignInGoogle}
                    disabled={actionPending || !setupReady}
                    variant="primary"
                    gradientBackground={true}
                    leadingIcon={GOOGLE_SIGN_IN_ICON}
                />
                {Platform.OS === "ios" ? (
                    <ActionButton
                        testID="signin-apple"
                        label={t("SIGN_IN_WITH_APPLE_I18N.string")}
                        onPress={onSignInApple}
                        disabled={actionPending || !setupReady}
                        variant="secondary"
                        gradientBackground={true}
                        leadingIcon={APPLE_SIGN_IN_ICON}
                        leadingIconTintColor={palette.black}
                    />
                ) : null}
                {isE2E() ? (
                    <View style={[ss.column, { gap: 8 }]}>
                        <TextInput
                            testID="e2e-email-input"
                            accessibilityLabel="e2e-email-input"
                            value={e2eEmail}
                            onChangeText={setE2eEmail}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                            placeholder="qa+clerk_test@example.com"
                            placeholderTextColor={palette.midGrey}
                            style={[
                                ss.bodyFont,
                                ss.blackText,
                                {
                                    borderWidth: 1,
                                    borderColor: palette.thinPurple,
                                    borderRadius: 12,
                                    minHeight: 48,
                                    paddingHorizontal: 12,
                                    backgroundColor: palette.white,
                                },
                            ]}
                        />
                        <TextInput
                            testID="e2e-code-input"
                            accessibilityLabel="e2e-code-input"
                            value={e2eCode}
                            onChangeText={setE2eCode}
                            keyboardType="number-pad"
                            placeholder="424242"
                            placeholderTextColor={palette.midGrey}
                            style={[
                                ss.bodyFont,
                                ss.blackText,
                                {
                                    borderWidth: 1,
                                    borderColor: palette.thinPurple,
                                    borderRadius: 12,
                                    minHeight: 48,
                                    paddingHorizontal: 12,
                                    backgroundColor: palette.white,
                                },
                            ]}
                        />
                        <ActionButton
                            testID="e2e-signin-submit"
                            label="E2E sign in"
                            onPress={() => {
                                onSignInEmailCode(
                                    e2eEmail.trim(),
                                    e2eCode.trim(),
                                );
                            }}
                            disabled={
                                actionPending ||
                                !setupReady ||
                                e2eEmail.trim().length === 0 ||
                                e2eCode.trim().length === 0
                            }
                            variant="secondary"
                        />
                    </View>
                ) : null}
            </View>
        );
    }

    if (onboardingAction === "activate_or_restore") {
        return (
            <View style={[ss.column]}>
                {activateOfferingsLoading ? (
                    <StatusText>Loading plans from RevenueCat...</StatusText>
                ) : null}
                {activateOfferingsError ? (
                    <StatusText>{activateOfferingsError}</StatusText>
                ) : null}
                <ActionButton
                    testID="hosted-purchase"
                    label={t("CONTINUE_I18N.string")}
                    onPress={onPurchase}
                    disabled={
                        actionPending ||
                        authPhase !== "authenticated" ||
                        !setupReady ||
                        activateOfferingsLoading ||
                        Boolean(activateOfferingsError) ||
                        (!activatePlan && !activateOfferingsError)
                    }
                    variant="primary"
                    gradientBackground={true}
                />
                <ActionButton
                    testID="hosted-restore"
                    label={t("RESTORE_PURCHASES_I18N.string")}
                    onPress={onRestorePurchases}
                    disabled={
                        actionPending ||
                        authPhase !== "authenticated" ||
                        !setupReady
                    }
                    variant="secondary"
                />
                <HostedPaywallLegalLinks />
            </View>
        );
    }

    if (onboardingAction === "wait") {
        return null;
    }

    if (onboardingAction === "offline") {
        return null;
    }

    if (onboardingAction === "restore_or_manage") {
        return (
            <View style={[ss.column]}>
                <ActionButton
                    label={t("CONTINUE_RETRY_INFRA_CHECK_I18N.string")}
                    onPress={onRecoverAccess}
                    disabled={
                        actionPending ||
                        recoverActionPending ||
                        authPhase !== "authenticated" ||
                        !setupReady
                    }
                    variant="primary"
                />
                <ActionButton
                    label={t("MANAGE_SETUP_DETAILS_I18N.string")}
                    onPress={onOpenManage}
                    disabled={actionPending}
                    variant="secondary"
                />
                <ActionButton
                    testID="hosted-restore"
                    label={t("RESTORE_PURCHASES_I18N.string")}
                    onPress={onRestorePurchases}
                    disabled={
                        actionPending ||
                        recoverActionPending ||
                        authPhase !== "authenticated" ||
                        !setupReady
                    }
                    variant="secondary"
                />
            </View>
        );
    }

    return null;
}

function HostedPaywallLegalLinks() {
    const { t } = useTranslation();
    const termsOfUseUrl =
        Platform.OS === "ios" ? APPLE_STANDARD_EULA_URL : TERMS_OF_USE_URL;

    return (
        <View
            style={[
                ss.row,
                ss.justifyCenter,
                ss.alignCenter,
                ss.flexWrap,
                { gap: 8 },
            ]}
        >
            <Pressable
                accessibilityRole="link"
                onPress={() => {
                    void Linking.openURL(termsOfUseUrl);
                }}
            >
                <Text
                    style={[
                        ss.tinyFont,
                        ss.purpleText,
                        { textDecorationLine: "underline" },
                    ]}
                >
                    {t("TERMS_OF_USE_I18N.string")}
                </Text>
            </Pressable>
            <Text style={[ss.tinyFont, ss.lightGreyText]}>|</Text>
            <Pressable
                accessibilityRole="link"
                onPress={() => {
                    void Linking.openURL(PRIVACY_POLICY_URL);
                }}
            >
                <Text
                    style={[
                        ss.tinyFont,
                        ss.purpleText,
                        { textDecorationLine: "underline" },
                    ]}
                >
                    {t("PRIVACY_POLICY_I18N.string")}
                </Text>
            </Pressable>
        </View>
    );
}

export function StatusText(props: React.PropsWithChildren) {
    return (
        <Text
            style={[
                ss.tinyFont,
                ss.blackText,
                {
                    borderWidth: 1,
                    borderColor: palette.thinPurple,
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: palette.whiteHighlight,
                },
            ]}
        >
            {props.children}
        </Text>
    );
}

export function ActionButton({
    label,
    onPress,
    disabled,
    variant,
    gradientBackground,
    leadingIcon,
    leadingIconTintColor,
    testID,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    variant: ActionButtonVariant;
    gradientBackground?: boolean;
    leadingIcon?: number;
    leadingIconTintColor?: string;
    testID?: string;
}) {
    const [buttonWidth, setButtonWidth] = React.useState(0);
    const isPrimary = variant === "primary";
    const showGradient = Boolean(gradientBackground) && !disabled;
    const textColor = showGradient ? palette.white : palette.black;

    return (
        <Pressable
            testID={testID}
            onLayout={(event) => {
                setButtonWidth(event.nativeEvent.layout.width);
            }}
            style={{
                borderWidth: 1,
                borderColor: palette.purple,
                borderRadius: 12,
                height: 48,
                paddingHorizontal: showGradient ? 0 : 14,
                justifyContent: "center",
                alignItems: "center",
                overflow: "hidden",
                backgroundColor: disabled
                    ? palette.fadedMauve
                    : showGradient
                      ? palette.transparent
                      : isPrimary
                        ? palette.purpleTint3
                        : palette.white,
            }}
            onPress={onPress}
            disabled={disabled}
        >
            {showGradient ? (
                <View style={[ss.absoluteFill]} pointerEvents="none">
                    <Canvas style={{ flex: 1 }}>
                        <Rect
                            x={0}
                            y={0}
                            width={Math.max(1, buttonWidth)}
                            height={48}
                        >
                            <LinearGradient
                                start={vec(0, 24)}
                                end={vec(Math.max(1, buttonWidth), 24.3)}
                                colors={[
                                    HOSTED_PRIMARY_GRADIENT_START,
                                    HOSTED_PRIMARY_GRADIENT_END,
                                ]}
                            />
                        </Rect>
                    </Canvas>
                </View>
            ) : null}
            <View style={[ss.row, ss.alignCenter, ss.justifyCenter]}>
                {leadingIcon ? (
                    <View
                        style={{
                            backgroundColor: palette.white,
                            padding: 5,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: palette.purple,
                        }}
                    >
                        <ExpoImage
                            source={leadingIcon}
                            contentFit="contain"
                            style={{
                                width: 18,
                                height: 18,
                                tintColor: leadingIconTintColor,
                            }}
                        />
                    </View>
                ) : null}
                <Text
                    style={[ss.bodyFont, ss.centeredText, { color: textColor }]}
                >
                    {label}
                </Text>
            </View>
        </Pressable>
    );
}
