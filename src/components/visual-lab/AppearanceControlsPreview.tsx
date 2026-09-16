import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import {
    useAppAppearance,
    useAppearanceStyles,
} from "@/src/appearance/AppAppearance";
import { DropdownSection } from "@/src/components/DropdownSection";
import { ActionButton } from "@/src/components/HostedSetupSections";
import { HostedStatusPanel } from "@/src/components/HostedStatusPanel";

const paddedHistory = [
    { time: new Date(0), value: 0, isPadded: true },
    { time: new Date(60_000), value: 0, isPadded: true },
];
const emptySeries = { personal: paddedHistory, public: paddedHistory };

/** Deterministic appearance preview of real settings/hosted controls without backend credentials. */
export function AppearanceControlsPreview() {
    const { skin } = useAppAppearance();
    const ss = useAppearanceStyles();
    const { t } = useTranslation();
    return (
        <View
            style={{
                flex: 1,
                padding: 20,
                gap: 24,
                backgroundColor: skin.background,
            }}
        >
            <DropdownSection
                testID="preview-local-dropdown"
                style={{ margin: 0, padding: 12, borderRadius: 12 }}
            >
                <Text style={[ss.bodyFont, ss.blackText]}>
                    Local Station — expanded
                </Text>
                <Text style={[ss.tinyFont, ss.blackText]}>
                    Public peers · Personal peers · Bandwidth
                </Text>
            </DropdownSection>
            <ActionButton
                testID="preview-hosted-primary"
                label="Hosted primary action"
                variant="primary"
                gradientBackground
                onPress={() => {}}
            />
            <ActionButton
                label="Hosted secondary action"
                variant="secondary"
                onPress={() => {}}
            />
            <ActionButton
                label="Hosted disabled action"
                variant="primary"
                gradientBackground
                disabled
                onPress={() => {}}
            />
            <HostedStatusPanel
                mode="bytes"
                onModeChange={() => {}}
                timeseries={{
                    bytesTransferred: emptySeries,
                    connectedUsers: emptySeries,
                    connectingUsers: emptySeries,
                }}
                chartNotice={t(
                    "LOCAL_DASHBOARD_HISTORY_START_PROMPT_I18N.string",
                )}
                onChartNoticePress={() => {}}
                referenceTimeMs={60_000}
            />
        </View>
    );
}
