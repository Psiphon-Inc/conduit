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
import React from "react";

import { OrbSceneNative } from "@/src/components/orb-scene/OrbSceneNative";
import { OrbEvolutionLevel } from "@/src/components/orb-scene/orbSceneTheme";
import { VisualTestControl } from "@/src/components/orb-scene/visualTestControl";

export type { OrbEvolutionLevel } from "@/src/components/orb-scene/orbSceneTheme";
export type OrbVisualMode = "off" | "announcing" | "in_use";

export interface OrbSceneActivityLane {
    id: string;
    orbIndex: number;
    connectedCount: number;
    exitXRatio?: number;
    exitYRatio?: number;
}

export interface OrbSceneHostedOrbPressEvent {
    orbIndex: number;
    centerX: number;
    centerY: number;
    radius: number;
}

export interface OrbSceneProvisioningMarker {
    id: string;
    orbIndex: number;
}

export interface OrbSceneProps {
    width: number;
    height: number;
    orbRadiusScale?: number;
    maxVisibleOrbs?: number;
    evolutionLevel: OrbEvolutionLevel;
    themeLevel?: OrbEvolutionLevel;
    headerTitle?: string;
    pressHint?: string | null;
    onPress?: () => void;
    onHostedOrbPress?: (event: OrbSceneHostedOrbPressEvent) => void;
    onLongPress?: () => void;
    pressDisabled?: boolean;
    applyBlur?: boolean;
    accessibilityLabel?: string;
    testID?: string;
    activityLanes?: OrbSceneActivityLane[];
    provisioningMarkers?: OrbSceneProvisioningMarker[];
    orbModes?: OrbVisualMode[];
    localOrbIndex?: number | null;
    highlightedOrbIndex?: number | null;
    statusOpacity?: number;
    statusTopRatio?: number;
    orbSlotMap?: number[];
    /** Deterministic freeze control for visual golden-state capture. */
    visualTest?: VisualTestControl;
}

/**
 * The main orb scene. The Skia reference renderer this scene was migrated
 * from was removed after the native renderer passed golden and performance
 * validation (docs/plans/react-native-skia-migration.md, phase 10); the
 * archived Skia goldens live in visual/baselines/skia.
 */
export function OrbScene(props: OrbSceneProps) {
    return <OrbSceneNative {...props} />;
}
