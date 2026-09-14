import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { type ReactTestRenderer, act, create } from "react-test-renderer";

import { AppSkinPreview } from "@/src/appearance/AppAppearance";
import { SkinRadioOption } from "@/src/appearance/SkinRadioOption";
import { APP_SKINS, type AppSkinId } from "@/src/appearance/appSkins";
import { DropdownSection } from "@/src/components/DropdownSection";
import { ActionButton } from "@/src/components/HostedSetupSections";
import { HostedStatusPanel } from "@/src/components/HostedStatusPanel";
import { TimeseriesPlot } from "@/src/components/TimeseriesPlot";
import i18nService from "@/src/i18n/i18n";
import { palette } from "@/src/styles";

beforeAll(() => i18nService.initI18n());

test.each(Object.values(APP_SKINS))(
    "$id loading chart retains its themed indicator instead of an activation CTA",
    async (skin) => {
        let renderer: ReactTestRenderer | undefined;
        await act(async () => {
            renderer = create(
                <AppSkinPreview skinId={skin.id}>
                    <HostedStatusPanel
                        mode="bytes"
                        onModeChange={() => {}}
                        isLoading
                        chartNotice="Start Local Conduit to load history."
                        onChartNoticePress={() => {}}
                    />
                </AppSkinPreview>,
            );
        });
        if (!renderer) throw new Error("Loading dashboard chart did not mount");
        try {
            expect(
                renderer.root.findAllByProps({
                    testID: "dashboard-plot-notice",
                }),
            ).toHaveLength(0);
            expect(
                renderer.root.findByType(ActivityIndicator).props.color,
            ).toBe(skin.mutedText);
        } finally {
            await act(async () => renderer?.unmount());
        }
    },
);

test.each([
    ["current", "rgba(255, 255, 255, 0.78)", palette.midGrey],
    ["classic-dark", "#23495a", "#c4d7df"],
] as const)(
    "%s local-off chart notice has a readable foreground/surface pair in actionable and disabled states",
    async (skinId, surface, foreground) => {
        for (const actionable of [true, false]) {
            let renderer: ReactTestRenderer | undefined;
            let presses = 0;
            const notice = "Start Local Conduit to load history.";
            await act(async () => {
                renderer = create(
                    <AppSkinPreview skinId={skinId}>
                        <TimeseriesPlot
                            width={350}
                            height={235}
                            data={[
                                { time: new Date(0), value: 0, isPadded: true },
                                {
                                    time: new Date(60_000),
                                    value: 0,
                                    isPadded: true,
                                },
                            ]}
                            plotNotice={notice}
                            onPlotNoticePress={
                                actionable
                                    ? () => {
                                          presses++;
                                      }
                                    : undefined
                            }
                        />
                    </AppSkinPreview>,
                );
            });
            if (!renderer)
                throw new Error("Local-off chart notice did not mount");
            try {
                const button = renderer.root.findByProps({
                    testID: "dashboard-plot-notice",
                });
                expect(
                    StyleSheet.flatten(button.props.style).backgroundColor,
                ).toBe(surface);
                const label = button
                    .findAllByType(Text)
                    .find((node) => node.props.children === notice);
                if (!label)
                    throw new Error(
                        "Local-off chart notice label did not render",
                    );
                expect(StyleSheet.flatten(label.props.style).color).toBe(
                    foreground,
                );
                expect(button.props.disabled).toBe(!actionable);
                if (actionable) {
                    await act(async () => button.props.onPress());
                    expect(presses).toBe(1);
                }
            } finally {
                await act(async () => renderer?.unmount());
            }
        }
    },
);

test.each(Object.values(APP_SKINS))(
    "native options retain their own gradient and text under active $id",
    async (activeSkin) => {
        let renderer: ReactTestRenderer | undefined;
        await act(async () => {
            renderer = create(
                <AppSkinPreview skinId={activeSkin.id}>
                    {Object.values(APP_SKINS).map((option) => (
                        <SkinRadioOption
                            key={option.id}
                            id={option.id}
                            label={option.id}
                            onSelect={() => {}}
                        />
                    ))}
                </AppSkinPreview>,
            );
        });
        if (!renderer)
            throw new Error("Native skin options renderer did not mount");
        for (const option of Object.values(APP_SKINS)) {
            const row = renderer.root.findByProps({
                testID: `skin-${option.id}`,
            });
            expect(row.findByType(LinearGradient).props.colors).toEqual(
                option.screenGradient,
            );
            const label = row
                .findAllByType(Text)
                .find((node) => node.props.children === option.id);
            if (!label)
                throw new Error("Native skin option label did not render");
            expect(StyleSheet.flatten(label.props.style).color).toBe(
                option.text,
            );
            expect(row.props.accessibilityState.checked).toBe(
                option.id === activeSkin.id,
            );
        }
        await act(async () => renderer?.unmount());
    },
);

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
