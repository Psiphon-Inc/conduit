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
import * as Haptics from "expo-haptics";
import React from "react";
import { Platform } from "react-native";

import { useModal } from "@/src/components/ModalStore";
import { PersonalPairingShareModal } from "@/src/components/PersonalPairingShareModal";
import { RyveClaimModalContent } from "@/src/components/RyveCallToAction";
import {
    RyveClaimMaterial,
    resolvePreferredRyveName,
} from "@/src/components/ryveClaim";
import { useAndroidPersonalCompartmentId, useConduitName } from "@/src/hooks";
import { useHostedExperienceState } from "@/src/hosted/experience/hooks";
import { isEntitlementAllowed } from "@/src/hosted/experience/stateMachine";
import { resolveHostedPersonalPairingState } from "@/src/hosted/personalPairing";

export interface ConduitActionsContextValue {
    /** Open the Ryve claim modal for a given claim material */
    openRyveClaimModal: (
        claim: RyveClaimMaterial,
        preferredName?: string,
    ) => void;
    /** Open the personal pairing share modal */
    openPersonalPairingModal: () => void;
    /** The personal compartment ID (null if not yet available) */
    personalCompartmentId: string | null;
    /** True when hosted personal pairing is still being provisioned */
    isPersonalPairingPreparing: boolean;
    /** The hosted Ryve claim material for the first conduit that has one */
    hostedRyveClaim: RyveClaimMaterial | undefined;
}

const ConduitActionsContext =
    React.createContext<ConduitActionsContextValue | null>(null);

export function useConduitActions(): ConduitActionsContextValue {
    const value = React.useContext(ConduitActionsContext);
    if (!value) {
        throw new Error(
            "useConduitActions must be used within a <ConduitActionsProvider />",
        );
    }
    return value;
}

export function ConduitActionsProvider({ children }: React.PropsWithChildren) {
    const { openModal } = useModal();
    const { data: androidPersonalCompartmentId } =
        useAndroidPersonalCompartmentId();
    const { data: conduitName } = useConduitName();
    const state = useHostedExperienceState();
    const conduits = state.conduitsSnapshot?.conduits ?? [];
    const hasHostedSession =
        state.authPhase === "authenticated" && state.session != null;

    const hostedPersonalPairing = React.useMemo(
        () =>
            resolveHostedPersonalPairingState({
                hasHostedSession,
                entitlementAllowed: isEntitlementAllowed(
                    state.entitlementSnapshot,
                ),
                stationPhase: state.stationPhase,
                conduits,
            }),
        [
            conduits,
            hasHostedSession,
            state.entitlementSnapshot,
            state.stationPhase,
        ],
    );
    const personalCompartmentId =
        Platform.OS === "ios"
            ? hostedPersonalPairing.ready
                ? hostedPersonalPairing.hostedPersonalCompartmentId
                : null
            : (hostedPersonalPairing.hostedPersonalCompartmentId ??
              androidPersonalCompartmentId ??
              null);
    const isPersonalPairingPreparing =
        Platform.OS === "ios" && hostedPersonalPairing.preparing;
    const personalPairingWrapperBaseUrl =
        state.session?.personalPairingWrapperBaseUrl ?? null;

    const hostedRyveClaim = React.useMemo(
        () => conduits.find((c) => c.ryve_claim)?.ryve_claim,
        [conduits],
    );

    const openRyveClaimModal = React.useCallback(
        (claim: RyveClaimMaterial, preferredName?: string) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const resolved = resolvePreferredRyveName(
                preferredName,
                conduitName,
            );
            openModal(
                <RyveClaimModalContent
                    claim={claim}
                    preferredName={resolved}
                />,
            );
        },
        [conduitName, openModal],
    );

    const openPersonalPairingModal = React.useCallback(() => {
        if (!personalCompartmentId) {
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        openModal(
            <PersonalPairingShareModal
                personalCompartmentId={personalCompartmentId}
                wrapperBaseUrl={personalPairingWrapperBaseUrl}
            />,
        );
    }, [openModal, personalCompartmentId, personalPairingWrapperBaseUrl]);

    const value = React.useMemo<ConduitActionsContextValue>(
        () => ({
            openRyveClaimModal,
            openPersonalPairingModal,
            personalCompartmentId,
            isPersonalPairingPreparing,
            hostedRyveClaim,
        }),
        [
            openRyveClaimModal,
            openPersonalPairingModal,
            personalCompartmentId,
            isPersonalPairingPreparing,
            hostedRyveClaim,
        ],
    );

    return (
        <ConduitActionsContext.Provider value={value}>
            {children}
        </ConduitActionsContext.Provider>
    );
}
