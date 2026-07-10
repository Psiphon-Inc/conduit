import { Image as ExpoImage } from "expo-image";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useConduitActions } from "@/src/components/ConduitActionsContext";
import { EditableConduitAlias } from "@/src/components/EditableConduitAlias";
import { GitHash } from "@/src/components/GitHash";
import { Icon } from "@/src/components/Icon";
import { useModal } from "@/src/components/ModalStore";
import {
    AddToHomeScreenSettingsIcon,
    WebAddToHomeScreenModal,
    useIsIOSWebDevice,
    useIsWebAppStandalone,
} from "@/src/components/WebAddToHomeScreenPrompt.web";
import {
    LEARN_MORE_URL,
    PRIVACY_POLICY_URL,
    TERMS_OF_USE_URL,
} from "@/src/constants";
import { useConduitName } from "@/src/hooks";
import { useHostedExperienceState } from "@/src/hosted/experience/hooks";
import { isEntitlementAllowed } from "@/src/hosted/experience/stateMachine";
import { palette, sharedStyles as ss } from "@/src/styles";

export function ConduitSettings({ inline = false }: { inline?: boolean }) {
    const router = useRouter();
    const { t } = useTranslation();
    const { openModal } = useModal();
    const { data: conduitName } = useConduitName();
    const hostedState = useHostedExperienceState();
    const isIOSWebDevice = useIsIOSWebDevice();
    const isStandalone = useIsWebAppStandalone();
    const {
        openPersonalPairingModal,
        openRyveClaimModal,
        isPersonalPairingPreparing,
        hostedRyveClaim,
    } = useConduitActions();
    const showPersonalPairingSettingsAction = isEntitlementAllowed(
        hostedState.entitlementSnapshot,
    );
    const showAddToHomeScreenAction = isIOSWebDevice && !isStandalone;

    function renderSettingsAction({
        icon,
        label,
        subtitle,
        onPress,
    }: {
        icon: React.ReactNode;
        label: string;
        subtitle?: string;
        onPress: () => void;
    }) {
        return (
            <Pressable
                onPress={onPress}
                style={{
                    minHeight: 60,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(0, 0, 0, 0.12)",
                    paddingVertical: 8,
                }}
            >
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        flex: 1,
                    }}
                >
                    {icon}
                    <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[ss.bodyFont, ss.blackText]}>{label}</Text>
                        {subtitle ? (
                            <Text
                                style={[
                                    ss.tinyFont,
                                    ss.blackText,
                                    { opacity: 0.6 },
                                ]}
                            >
                                {subtitle}
                            </Text>
                        ) : null}
                    </View>
                </View>
                <Icon name="chevron-right" color={palette.purple} size={16} />
            </Pressable>
        );
    }

    return (
        <ScrollView
            contentContainerStyle={{
                flexGrow: 1,
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: inline ? 24 : 12,
                gap: 18,
            }}
        >
            <View style={{ gap: 10 }}>
                <Text style={[ss.bodyFont, ss.blackText]}>Hosted Conduit</Text>
                <EditableConduitAlias />
            </View>

            <View>
                {showAddToHomeScreenAction
                    ? renderSettingsAction({
                          icon: <AddToHomeScreenSettingsIcon />,
                          label: t("ADD_CONDUIT_TO_HOME_SCREEN_I18N.string"),
                          subtitle: t(
                              "ADD_TO_HOME_SCREEN_SETTINGS_DESCRIPTION_I18N.string",
                          ),
                          onPress: () => openModal(<WebAddToHomeScreenModal />),
                      })
                    : null}

                {showPersonalPairingSettingsAction
                    ? renderSettingsAction({
                          icon: (
                              <ExpoImage
                                  source={require("@/assets/images/icons/p2p_24px.svg")}
                                  tintColor={palette.black}
                                  style={{ width: 20, height: 20 }}
                                  contentFit="contain"
                              />
                          ),
                          label: t("SETTINGS_PERSONAL_PAIRING_I18N.string"),
                          subtitle: isPersonalPairingPreparing
                              ? t("PREPARING_PERSONAL_PAIRING_I18N.string")
                              : t(
                                    "SETTINGS_PERSONAL_PAIRING_DESCRIPTION_I18N.string",
                                ),
                          onPress: () => openPersonalPairingModal(),
                      })
                    : null}

                {hostedRyveClaim
                    ? renderSettingsAction({
                          icon: (
                              <ExpoImage
                                  source={require("@/assets/images/icons/ryve.svg")}
                                  tintColor={palette.black}
                                  style={{ width: 20, height: 20 }}
                                  contentFit="contain"
                              />
                          ),
                          label: t("REWARDS_I18N.string"),
                          subtitle: t("CLAIM_REWARDS_IN_RYVE_I18N.string"),
                          onPress: () =>
                              openRyveClaimModal(hostedRyveClaim, conduitName),
                      })
                    : null}

                {renderSettingsAction({
                    icon: (
                        <ExpoImage
                            source={require("@/assets/images/icons/account.svg")}
                            tintColor={palette.black}
                            style={{ width: 20, height: 20 }}
                            contentFit="contain"
                        />
                    ),
                    label: t("ACCOUNT_I18N.string"),
                    subtitle: t("ACCOUNT_SETTINGS_DESCRIPTION_I18N.string"),
                    onPress: () => router.push("/(app)/account"),
                })}

                {renderSettingsAction({
                    icon: (
                        <Icon name="question" color={palette.black} size={20} />
                    ),
                    label: t("MORE_INFO_I18N.string"),
                    onPress: () => void Linking.openURL(LEARN_MORE_URL),
                })}

                {renderSettingsAction({
                    icon: (
                        <Icon name="shield" color={palette.black} size={20} />
                    ),
                    label: t("PRIVACY_POLICY_I18N.string"),
                    onPress: () => void Linking.openURL(PRIVACY_POLICY_URL),
                })}

                {renderSettingsAction({
                    icon: (
                        <Icon name="notepad" color={palette.black} size={20} />
                    ),
                    label: t("TERMS_OF_USE_I18N.string"),
                    onPress: () => void Linking.openURL(TERMS_OF_USE_URL),
                })}
            </View>

            <View style={{ gap: 8 }}>
                <GitHash />
            </View>
        </ScrollView>
    );
}
