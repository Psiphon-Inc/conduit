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
import type { RecentWindow, SummaryWindow } from "@/src/hosted/contracts";
import { palette } from "@/src/styles";

/**
 * Maps a RecentWindow to the corresponding SummaryWindow.
 */
export function toSummaryWindow(window: RecentWindow): SummaryWindow {
    if (window === "7d") {
        return "7d";
    }
    if (window === "30d") {
        return "30d";
    }
    return "24h";
}

/**
 * Maps a RecentWindow to the appropriate regional breakdown window
 * (maps "5m" to "48h" since 5-minute granularity is too fine for breakdown).
 */
export function toRegionalBreakdownWindow(window: RecentWindow): RecentWindow {
    if (window === "5m") {
        return "48h";
    }
    return window;
}

/**
 * Generates a style object for a selectable window button based on selected state.
 */
export function buttonStyle(selected?: boolean) {
    return {
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
        minWidth: 68,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        backgroundColor: selected
            ? palette.selectedPurple
            : "rgba(25, 18, 36, 0.08)",
    };
}
