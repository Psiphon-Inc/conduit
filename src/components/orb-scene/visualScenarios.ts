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
import {
    OrbEvolutionLevel,
    OrbSceneActivityLane,
    OrbSceneProvisioningMarker,
    OrbVisualMode,
} from "@/src/components/orb-scene/OrbScene";
import { visualProgressForLightLfo } from "@/src/components/orb-scene/visualTestControl";

/**
 * Deterministic golden-state scenarios for the orb renderers.
 *
 * Every scenario, combined with `VisualTestControl` freezing, must produce
 * an identical frame on every run. Scenario ids are stable identifiers used
 * as baseline image filenames; renaming one orphans its accepted golden.
 */

export type VisualViewportId = "mobile" | "desktop";

export interface VisualViewport {
    id: VisualViewportId;
    width: number;
    height: number;
}

export const VISUAL_VIEWPORTS: Record<VisualViewportId, VisualViewport> = {
    mobile: { id: "mobile", width: 390, height: 844 },
    desktop: { id: "desktop", width: 1280, height: 800 },
};

export type VisualLabRendererId = "skia" | "native";

export interface OrbSceneVisualScenario {
    kind: "orb-scene";
    id: string;
    description: string;
    evolutionLevel: OrbEvolutionLevel;
    themeLevel?: OrbEvolutionLevel;
    maxVisibleOrbs?: number;
    orbModes: OrbVisualMode[];
    orbSlotMap?: number[];
    localOrbIndex?: number | null;
    highlightedOrbIndex?: number | null;
    activityLanes?: OrbSceneActivityLane[];
    provisioningMarkers?: OrbSceneProvisioningMarker[];
    applyBlur?: boolean;
    /** Frozen normalized animation progress in [0, 1]. */
    progress: number;
}

export interface HostedMiniOrbVisualScenario {
    kind: "hosted-mini-orb";
    id: string;
    description: string;
    label: string;
    connectedCount: number;
    connectingCount: number;
    size: { width: number; height: number };
    /** Frozen normalized animation progress in [0, 1]. */
    progress: number;
}

export interface SkyBoxVisualScenario {
    kind: "skybox";
    id: string;
    description: string;
    state: 0 | 1 | 2 | 3;
    /** Frozen normalized animation progress in [0, 1]. */
    progress: number;
}

export type OrbVisualScenario =
    | OrbSceneVisualScenario
    | HostedMiniOrbVisualScenario
    | SkyBoxVisualScenario;

const LOCAL_LANE: OrbSceneActivityLane = {
    id: "local",
    orbIndex: 0,
    connectedCount: 1,
};

const MINI_ORB_SIZE = { width: 240, height: 280 };

/**
 * Swap scenarios freeze the arcing slot-swap animation mid-flight. The
 * frozen progress is applied directly as the swap parameter t; the two
 * orbs travel opposing sine arcs between their previous and next slots.
 */
function swapScenario(
    id: string,
    description: string,
    progress: number,
    overrides?: Partial<OrbSceneVisualScenario>,
): OrbSceneVisualScenario {
    return {
        kind: "orb-scene",
        id,
        description,
        evolutionLevel: 3,
        orbModes: ["in_use", "in_use", "in_use"],
        orbSlotMap: [1, 0, 2],
        localOrbIndex: 1,
        progress,
        ...overrides,
    };
}

/** Connection-light scenarios pin the single local light at a target LFO. */
function lightScenario(
    id: string,
    description: string,
    targetLfo: number,
): OrbSceneVisualScenario {
    return {
        kind: "orb-scene",
        id,
        description,
        evolutionLevel: 1,
        orbModes: ["in_use"],
        localOrbIndex: 0,
        activityLanes: [LOCAL_LANE],
        progress: visualProgressForLightLfo("local", 0, targetLfo),
    };
}

export const ORB_VISUAL_SCENARIOS: OrbVisualScenario[] = [
    // --- Single orb states -------------------------------------------------
    {
        kind: "orb-scene",
        id: "single-off",
        description: "Single orb, off, no subscription theme",
        evolutionLevel: 0,
        orbModes: ["off"],
        progress: 0.5,
    },
    {
        kind: "orb-scene",
        id: "single-announcing",
        description: "Single orb announcing, pulse mid-cycle",
        evolutionLevel: 1,
        orbModes: ["announcing"],
        localOrbIndex: 0,
        progress: 0.5,
    },
    {
        kind: "orb-scene",
        id: "single-active",
        description: "Single orb in use",
        evolutionLevel: 1,
        orbModes: ["in_use"],
        localOrbIndex: 0,
        progress: 0.5,
    },
    // --- Theme levels ------------------------------------------------------
    {
        kind: "orb-scene",
        id: "theme-level-0",
        description: "Single orb rendered with theme level 0",
        evolutionLevel: 1,
        themeLevel: 0,
        orbModes: ["in_use"],
        localOrbIndex: 0,
        progress: 0.5,
    },
    {
        kind: "orb-scene",
        id: "theme-level-2",
        description: "Single orb rendered with theme level 2",
        evolutionLevel: 1,
        themeLevel: 2,
        orbModes: ["in_use"],
        localOrbIndex: 0,
        progress: 0.5,
    },
    {
        kind: "orb-scene",
        id: "theme-level-3",
        description: "Single orb rendered with theme level 3",
        evolutionLevel: 1,
        themeLevel: 3,
        orbModes: ["in_use"],
        localOrbIndex: 0,
        progress: 0.5,
    },
    // --- Two-orb proximity (frozen mid-swap arcs) --------------------------
    {
        kind: "orb-scene",
        id: "two-far",
        description: "Two orbs resting in home slots, far apart",
        evolutionLevel: 2,
        maxVisibleOrbs: 2,
        orbModes: ["in_use", "in_use"],
        localOrbIndex: 1,
        progress: 0.5,
    },
    swapScenario("two-approaching", "Two orbs approaching mid-swap", 0.2, {
        evolutionLevel: 2,
        maxVisibleOrbs: 2,
        orbModes: ["in_use", "in_use"],
        orbSlotMap: [1, 0],
    }),
    swapScenario(
        "two-first-contact",
        "Two orbs at first surface contact",
        0.38,
        {
            evolutionLevel: 2,
            maxVisibleOrbs: 2,
            orbModes: ["in_use", "in_use"],
            orbSlotMap: [1, 0],
        },
    ),
    swapScenario(
        "two-strong-bridge",
        "Two orbs joined by a strong bridge",
        0.5,
        {
            evolutionLevel: 2,
            maxVisibleOrbs: 2,
            orbModes: ["in_use", "in_use"],
            orbSlotMap: [1, 0],
        },
    ),
    swapScenario("two-overlapping", "Two orbs mostly overlapping", 0.62, {
        evolutionLevel: 2,
        maxVisibleOrbs: 2,
        orbModes: ["in_use", "in_use"],
        orbSlotMap: [1, 0],
    }),
    // --- Three-orb states --------------------------------------------------
    {
        kind: "orb-scene",
        id: "three-idle",
        description: "Three orbs idle in home slots",
        evolutionLevel: 2,
        orbModes: ["off", "off", "off"],
        progress: 0.5,
    },
    swapScenario(
        "three-pairwise-bridge",
        "Three orbs with two frozen in an overlapping state",
        0.45,
    ),
    // --- Connection lights -------------------------------------------------
    lightScenario("light-far", "Connection light far from orb", -0.92),
    lightScenario(
        "light-approaching",
        "Connection light approaching orb",
        -0.72,
    ),
    lightScenario(
        "light-touching",
        "Connection light touching orb edge",
        -0.58,
    ),
    lightScenario(
        "light-absorbed",
        "Connection light absorbed at orb center",
        -0.02,
    ),
    {
        kind: "orb-scene",
        id: "lights-multiple",
        description: "Five simultaneous connection lights on the local orb",
        evolutionLevel: 1,
        orbModes: ["in_use"],
        localOrbIndex: 0,
        activityLanes: [{ id: "local", orbIndex: 0, connectedCount: 5 }],
        progress: 0.5,
    },
    {
        kind: "orb-scene",
        id: "lights-multi-lane",
        description: "Lights on all three orbs across lanes",
        evolutionLevel: 3,
        orbModes: ["in_use", "in_use", "in_use"],
        localOrbIndex: 1,
        activityLanes: [
            { id: "local", orbIndex: 1, connectedCount: 3 },
            { id: "hosted-a", orbIndex: 0, connectedCount: 2 },
            { id: "hosted-b", orbIndex: 2, connectedCount: 2 },
        ],
        progress: 0.5,
    },
    // --- Slot swap sequence ------------------------------------------------
    swapScenario("swap-000", "Slot swap at progress 0", 0),
    swapScenario("swap-025", "Slot swap at progress 0.25", 0.25),
    swapScenario("swap-050", "Slot swap at progress 0.5", 0.5),
    swapScenario("swap-075", "Slot swap at progress 0.75", 0.75),
    swapScenario("swap-100", "Slot swap at progress 1", 1),
    // --- Provisioning and blur ---------------------------------------------
    {
        kind: "orb-scene",
        id: "provisioning-marker",
        description: "Provisioning marker orbiting a hosted orb",
        evolutionLevel: 3,
        orbModes: ["in_use", "in_use", "off"],
        localOrbIndex: 1,
        provisioningMarkers: [{ id: "prov-1", orbIndex: 2 }],
        progress: 0.5,
    },
    {
        kind: "orb-scene",
        id: "scene-blur",
        description: "Active scene with background blur applied",
        evolutionLevel: 1,
        orbModes: ["in_use"],
        localOrbIndex: 0,
        applyBlur: true,
        progress: 0.5,
    },
    // --- Hosted mini orb ---------------------------------------------------
    {
        kind: "hosted-mini-orb",
        id: "mini-idle",
        description: "Hosted mini orb idle",
        label: "Conduit",
        connectedCount: 0,
        connectingCount: 0,
        size: MINI_ORB_SIZE,
        progress: 0.5,
    },
    {
        kind: "hosted-mini-orb",
        id: "mini-active",
        description: "Hosted mini orb with active connections",
        label: "Conduit",
        connectedCount: 3,
        connectingCount: 1,
        size: MINI_ORB_SIZE,
        // Mini-orb light seeds derive from `${id}-${index}`; pin the first
        // light at the orb edge so particle contact is visible in goldens.
        progress: visualProgressForLightLfo("mini-active", 0, -0.55),
    },
    // --- SkyBox background gradient states ----------------------------------
    {
        kind: "skybox",
        id: "skybox-0",
        description: "SkyBox gradient, state 0 (idle)",
        state: 0,
        progress: 0.5,
    },
    {
        kind: "skybox",
        id: "skybox-1",
        description: "SkyBox gradient, state 1 (running)",
        state: 1,
        progress: 0.5,
    },
    {
        kind: "skybox",
        id: "skybox-2",
        description: "SkyBox gradient, state 2",
        state: 2,
        progress: 0.5,
    },
    {
        kind: "skybox",
        id: "skybox-3",
        description: "SkyBox gradient, state 3",
        state: 3,
        progress: 0.5,
    },
];

export function findVisualScenario(id: string): OrbVisualScenario | undefined {
    return ORB_VISUAL_SCENARIOS.find((scenario) => scenario.id === id);
}
