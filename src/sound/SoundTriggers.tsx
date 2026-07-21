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

import {
    useHostedExperienceInitialSessionResolved,
    useHostedExperienceState,
} from "@/src/hosted/experience/hooks";
import { HostedStationPhase } from "@/src/hosted/experience/types";
import { useHostedHomeWidgetData } from "@/src/hosted/homeStats";
import {
    useInproxyCurrentPersonalConnectedClients,
    useInproxyStatus,
} from "@/src/inproxy/hooks";
import { playSound } from "@/src/sound";
import {
    detectHostedPhaseSoundEffect,
    isFirstConnectTransition,
} from "@/src/sound/transitions";

/**
 * Headless component, mounted once in the app layout, that watches
 * react-level state transitions and plays the corresponding sound effects:
 * - first personal pairing client connect (local and hosted): successConfirm,
 *   at most once per station session;
 * - hosted station activation (provisioning/none -> active): stationGoingLive;
 * - hosted station suspension (active -> suspended): warningAlert.
 */
export function SoundTriggers(): null {
    // --- Local station: first personal pairing client connect -------------
    const { data: inproxyStatus } = useInproxyStatus();
    const { data: localPersonalClients } =
        useInproxyCurrentPersonalConnectedClients();
    const localPreviousCountRef = React.useRef<number | null>(null);
    const localPlayedThisSessionRef = React.useRef(false);

    React.useEffect(() => {
        if (inproxyStatus !== "RUNNING") {
            // Reset the once-per-session flag when the local station stops.
            localPlayedThisSessionRef.current = false;
            localPreviousCountRef.current = null;
            return;
        }
        if (localPersonalClients === undefined) {
            return;
        }
        const previousCount = localPreviousCountRef.current;
        localPreviousCountRef.current = localPersonalClients;
        if (
            !localPlayedThisSessionRef.current &&
            isFirstConnectTransition(previousCount, localPersonalClients)
        ) {
            localPlayedThisSessionRef.current = true;
            playSound("successConfirm");
        }
    }, [inproxyStatus, localPersonalClients]);

    // --- Hosted station: activation/suspension phase transitions ----------
    const hostedState = useHostedExperienceState();
    const initialSessionResolved = useHostedExperienceInitialSessionResolved();
    const hostedPhase = hostedState.stationPhase;
    // Only observe phases backed by a real conduits snapshot; before the
    // snapshot arrives, the derived phase is an undetermined "none".
    const hostedPhaseObservable =
        initialSessionResolved && hostedState.conduitsSnapshot != null;
    const hostedPreviousPhaseRef = React.useRef<HostedStationPhase | null>(
        null,
    );

    React.useEffect(() => {
        if (!hostedPhaseObservable) {
            return;
        }
        const previousPhase = hostedPreviousPhaseRef.current;
        hostedPreviousPhaseRef.current = hostedPhase;
        const effect = detectHostedPhaseSoundEffect(previousPhase, hostedPhase);
        if (effect) {
            playSound(effect);
        }
    }, [hostedPhaseObservable, hostedPhase]);

    // --- Hosted station: first personal pairing client connect ------------
    const hostedStatsEnabled =
        initialSessionResolved &&
        hostedState.authPhase === "authenticated" &&
        hostedPhase === "active";
    const { recent, isLoading: hostedStatsLoading } =
        useHostedHomeWidgetData(hostedStatsEnabled);
    const hostedPersonalActiveUsers = recent?.personalActiveUsers;
    const hostedPreviousCountRef = React.useRef<number | null>(null);
    const hostedPlayedThisSessionRef = React.useRef(false);

    React.useEffect(() => {
        if (hostedPhase !== "active") {
            // Reset the once-per-session flag when the hosted station leaves
            // the active phase.
            hostedPlayedThisSessionRef.current = false;
            hostedPreviousCountRef.current = null;
            return;
        }
        if (hostedStatsLoading || hostedPersonalActiveUsers === undefined) {
            return;
        }
        const previousCount = hostedPreviousCountRef.current;
        hostedPreviousCountRef.current = hostedPersonalActiveUsers;
        if (
            !hostedPlayedThisSessionRef.current &&
            isFirstConnectTransition(previousCount, hostedPersonalActiveUsers)
        ) {
            hostedPlayedThisSessionRef.current = true;
            playSound("successConfirm");
        }
    }, [hostedPhase, hostedPersonalActiveUsers, hostedStatsLoading]);

    return null;
}
