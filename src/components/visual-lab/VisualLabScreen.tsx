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
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";

import { InproxyStatusColorCanvas } from "@/src/components/SkyBox";
import {
    OrbEvolutionLevel,
    OrbScene,
} from "@/src/components/orb-scene/OrbScene";
import { HostedMiniOrbNative } from "@/src/components/orb-scene/native/HostedMiniOrbNative";
import {
    ORB_VISUAL_SCENARIOS,
    OrbVisualScenario,
    VISUAL_VIEWPORTS,
    VisualViewportId,
    findVisualScenario,
} from "@/src/components/orb-scene/visualScenarios";
import { clampVisualProgress } from "@/src/components/orb-scene/visualTestControl";
import { palette } from "@/src/styles";

/**
 * Development-only web visual lab for comparing orb renderers against
 * deterministic golden-state scenarios.
 *
 * All state is encoded in the URL so any view is reproducible:
 *
 *   /orb-lab?scenario=two-first-contact&progress=0.45
 *   /orb-lab?scenario=swap-050&viewport=desktop&chrome=0
 *
 * Params:
 *   scenario  scenario id from the registry (default: first scenario)
 *   progress  0..1 frozen scrub override (default: scenario.progress)
 *   play      1 to run live animation instead of freezing
 *   viewport  mobile | desktop | fit (default: mobile)
 *   bg        black | white | mauve (default: black)
 *   theme     0..3 theme level override for orb scenes
 *   chrome    0 hides controls for screenshot capture (default: 1)
 *
 * Screenshot automation waits for `[data-visualready="true"]`, which is set
 * only after fonts resolve and the frozen scene has settled for two frames,
 * then captures the `[data-visualstage="native"]` element.
 */

const BACKGROUNDS: Record<string, string> = {
    black: palette.black,
    white: "#FFFFFF",
    mauve: "#755484",
};

declare global {
    interface Window {
        __ORB_VISUAL_SCENARIOS__?: OrbVisualScenario[];
    }
}

// Screenshot automation reads the registry from the page so the scenario
// list has a single source of truth.
if (typeof window !== "undefined") {
    window.__ORB_VISUAL_SCENARIOS__ = ORB_VISUAL_SCENARIOS;
}

function firstString(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}

function ScenarioMount({
    scenario,
    width,
    height,
    frozen,
    progress,
    themeOverride,
}: {
    scenario: OrbVisualScenario;
    width: number;
    height: number;
    frozen: boolean;
    progress: number;
    themeOverride?: OrbEvolutionLevel;
}) {
    const visualTest = {
        frozen,
        progress,
        reducedMotion: false,
    };
    if (scenario.kind === "skybox") {
        return (
            <View style={{ width, height }}>
                <InproxyStatusColorCanvas
                    width={width}
                    height={height}
                    gradientState={scenario.state}
                />
            </View>
        );
    }
    if (scenario.kind === "hosted-mini-orb") {
        const MiniOrb = HostedMiniOrbNative;
        return (
            <View
                style={{
                    width,
                    height,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <MiniOrb
                    label={scenario.label}
                    connectedCount={scenario.connectedCount}
                    connectingCount={scenario.connectingCount}
                    width={scenario.size.width}
                    height={scenario.size.height}
                    visualTest={visualTest}
                    lightSeedKey={scenario.id}
                />
            </View>
        );
    }
    return (
        <OrbScene
            width={width}
            height={height}
            evolutionLevel={scenario.evolutionLevel}
            themeLevel={themeOverride ?? scenario.themeLevel}
            maxVisibleOrbs={scenario.maxVisibleOrbs}
            orbModes={scenario.orbModes}
            orbSlotMap={scenario.orbSlotMap}
            localOrbIndex={scenario.localOrbIndex}
            highlightedOrbIndex={scenario.highlightedOrbIndex}
            activityLanes={scenario.activityLanes}
            provisioningMarkers={scenario.provisioningMarkers}
            applyBlur={scenario.applyBlur}
            pressDisabled={true}
            visualTest={visualTest}
        />
    );
}

function RendererStage({
    rendererId,
    scenario,
    width,
    height,
    background,
    frozen,
    progress,
    themeOverride,
    style,
}: {
    rendererId: "skia" | "native";
    scenario: OrbVisualScenario;
    width: number;
    height: number;
    background: string;
    frozen: boolean;
    progress: number;
    themeOverride?: OrbEvolutionLevel;
    style?: React.CSSProperties;
}) {
    return (
        <div
            data-visualstage={rendererId}
            style={{
                width,
                height,
                background,
                position: "relative",
                overflow: "hidden",
                flexShrink: 0,
                ...style,
            }}
        >
            <ScenarioMount
                scenario={scenario}
                width={width}
                height={height}
                frozen={frozen}
                progress={progress}
                themeOverride={themeOverride}
            />
        </div>
    );
}

function useWindowSize(): { width: number; height: number } {
    const [size, setSize] = React.useState(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
    }));
    React.useEffect(() => {
        const onResize = () =>
            setSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return size;
}

/** Marks readiness for screenshot automation once the frame has settled. */
function useVisualReady(settleKey: string, playing: boolean): boolean {
    const [ready, setReady] = React.useState(false);
    React.useEffect(() => {
        let cancelled = false;
        setReady(false);
        if (playing) {
            return;
        }
        (async () => {
            try {
                await document.fonts?.ready;
            } catch {
                // Font readiness is best-effort; the settle frames below
                // still gate the capture.
            }
            // Give the frozen shared values and the Skia surface time to
            // flush, then confirm two consecutive clean frames.
            await new Promise((resolve) => setTimeout(resolve, 250));
            await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            if (!cancelled) {
                setReady(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [settleKey, playing]);
    return ready;
}

const CONTROL_STYLE: React.CSSProperties = {
    fontFamily: "system-ui, sans-serif",
    fontSize: 13,
};

export function VisualLabScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        scenario?: string;
        progress?: string;
        play?: string;
        viewport?: string;
        bg?: string;
        theme?: string;
        chrome?: string;
    }>();
    const windowSize = useWindowSize();

    const scenarioId =
        firstString(params.scenario) ?? ORB_VISUAL_SCENARIOS[0].id;
    const scenario = findVisualScenario(scenarioId);
    const playing = firstString(params.play) === "1";
    const chromeVisible = firstString(params.chrome) !== "0";
    const backgroundId = firstString(params.bg) ?? "black";
    const background = BACKGROUNDS[backgroundId] ?? BACKGROUNDS.black;
    const viewportParam = firstString(params.viewport) ?? "mobile";
    const themeParam = firstString(params.theme);
    const themeOverride =
        themeParam != null && /^[0-3]$/.test(themeParam)
            ? (Number(themeParam) as OrbEvolutionLevel)
            : undefined;

    const progressParam = firstString(params.progress);
    const progress = clampVisualProgress(
        progressParam != null && progressParam !== ""
            ? Number(progressParam)
            : (scenario?.progress ?? 0),
    );

    const stageSize =
        viewportParam === "fit"
            ? windowSize
            : VISUAL_VIEWPORTS[
                  (viewportParam in VISUAL_VIEWPORTS
                      ? viewportParam
                      : "mobile") as VisualViewportId
              ];

    const settleKey = JSON.stringify([
        scenarioId,
        progress,
        viewportParam,
        backgroundId,
        themeOverride,
        stageSize.width,
        stageSize.height,
    ]);
    const ready = useVisualReady(settleKey, playing);

    const setParam = React.useCallback(
        (key: string, value: string | undefined) => {
            router.setParams({ [key]: value ?? "" });
        },
        [router],
    );

    if (!scenario) {
        return (
            <div style={{ ...CONTROL_STYLE, padding: 24, color: "#fff" }}>
                Unknown scenario &quot;{scenarioId}&quot;.{" "}
                <button onClick={() => setParam("scenario", undefined)}>
                    Reset
                </button>
            </div>
        );
    }

    const stageProps = {
        scenario,
        width: stageSize.width,
        height: stageSize.height,
        background,
        frozen: !playing,
        progress,
        themeOverride,
    };

    const stage = <RendererStage rendererId="native" {...stageProps} />;

    return (
        <div
            data-visualready={ready ? "true" : "false"}
            style={{
                minHeight: "100vh",
                background: chromeVisible ? "#111" : background,
                display: "flex",
                flexDirection: "column",
                alignItems: chromeVisible ? "center" : "flex-start",
            }}
        >
            {chromeVisible ? (
                <div
                    style={{
                        ...CONTROL_STYLE,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 12,
                        alignItems: "center",
                        padding: 12,
                        color: "#eee",
                        width: "100%",
                        boxSizing: "border-box",
                    }}
                >
                    <label>
                        Scenario{" "}
                        <select
                            value={scenarioId}
                            onChange={(event) =>
                                setParam("scenario", event.target.value)
                            }
                        >
                            {ORB_VISUAL_SCENARIOS.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                    {entry.id}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Viewport{" "}
                        <select
                            value={viewportParam}
                            onChange={(event) =>
                                setParam("viewport", event.target.value)
                            }
                        >
                            <option value="mobile">mobile 390x844</option>
                            <option value="desktop">desktop 1280x800</option>
                            <option value="fit">fit window</option>
                        </select>
                    </label>
                    <label>
                        Background{" "}
                        <select
                            value={backgroundId}
                            onChange={(event) =>
                                setParam("bg", event.target.value)
                            }
                        >
                            {Object.keys(BACKGROUNDS).map((id) => (
                                <option key={id} value={id}>
                                    {id}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Theme{" "}
                        <select
                            value={themeParam ?? ""}
                            onChange={(event) =>
                                setParam(
                                    "theme",
                                    event.target.value || undefined,
                                )
                            }
                        >
                            <option value="">scenario</option>
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                        </select>
                    </label>
                    <label>
                        Progress{" "}
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.005}
                            value={progress}
                            disabled={playing}
                            onChange={(event) =>
                                setParam("progress", event.target.value)
                            }
                        />{" "}
                        {progress.toFixed(3)}
                    </label>
                    <button
                        onClick={() => setParam("play", playing ? "0" : "1")}
                    >
                        {playing ? "Pause" : "Play"}
                    </button>
                    <span style={{ opacity: 0.6 }}>
                        {scenario.description}
                        {ready ? " · ready" : " · settling…"}
                    </span>
                </div>
            ) : null}
            {stage}
        </div>
    );
}
