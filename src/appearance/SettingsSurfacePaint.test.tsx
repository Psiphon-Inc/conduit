import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text } from "react-native";
import { type ReactTestRenderer, act, create } from "react-test-renderer";

import { AppSkinPreview } from "@/src/appearance/AppAppearance";
import type { AppSkinId } from "@/src/appearance/appSkins";
import { DropdownSection } from "@/src/components/DropdownSection";
import { ActionButton } from "@/src/components/HostedSetupSections";
import { HostedStatusPanel } from "@/src/components/HostedStatusPanel";
import i18nService from "@/src/i18n/i18n";
import { palette } from "@/src/styles";

beforeAll(() => i18nService.initI18n());

async function renderedGradients(skinId: AppSkinId) {
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
        renderer = create(
            <AppSkinPreview skinId={skinId}>
                <DropdownSection>
                    <Text>Local Station expanded settings</Text>
                </DropdownSection>
                <ActionButton
                    label="Hosted sign in or purchase"
                    variant="primary"
                    gradientBackground
                    onPress={() => {}}
                />
            </AppSkinPreview>,
        );
    });
    if (!renderer)
        throw new Error("Settings surface paint renderer did not mount");
    const gradients = renderer.root
        .findAllByType(LinearGradient)
        .map((node) => node.props.colors);
    await act(async () => renderer?.unmount());
    return gradients;
}

test("Classic Dark expanded Local Station and hosted CTA render dark gradients", async () => {
    expect(await renderedGradients("classic-dark")).toEqual([
        ["#10161c", "#23495a"],
        ["#23495a", "#2e2132"],
    ]);
});

test("Classic Light expanded Local Station and hosted CTA preserve original gradients", async () => {
    expect(await renderedGradients("current")).toEqual([
        ["rgba(255, 255, 255, 0.94)", "rgba(157, 129, 201, 0.52)"],
        ["#7E5CB8", "rgba(156, 129, 201, 0.69)"],
    ]);
});

test.each([
    ["current", ["rgba(25, 18, 36, 0.08)", palette.selectedPurple]],
    ["classic-dark", ["#10161c", "#23495a"]],
] as const)(
    "%s hosted chart mode buttons use selected and idle surface paint",
    async (skinId, expected) => {
        let renderer: ReactTestRenderer | undefined;
        await act(async () => {
            renderer = create(
                <AppSkinPreview skinId={skinId}>
                    <HostedStatusPanel mode="bytes" onModeChange={() => {}} />
                </AppSkinPreview>,
            );
        });
        if (!renderer)
            throw new Error("Hosted mode button renderer did not mount");
        expect(
            renderer.root
                .findAll(
                    (node) =>
                        typeof node.type === "string" &&
                        node.props.focusable === true,
                )
                .map(
                    (node) =>
                        StyleSheet.flatten(node.props.style).backgroundColor,
                ),
        ).toEqual(expected);
        await act(async () => renderer?.unmount());
    },
);
