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

import { OAuthProvider } from "@/src/hosted/contracts";
import {
    HostedExperienceActions,
    useHostedExperienceContext,
} from "@/src/hosted/experience/context";
import { HostedExperienceState } from "@/src/hosted/experience/types";

export function useHostedExperienceState(): HostedExperienceState {
    return useHostedExperienceContext().state;
}

export function useHostedExperienceActions(): HostedExperienceActions {
    const {
        signIn,
        signOut,
        pollConduitsOnce,
        restorePurchases,
        purchasePackage,
        refreshSessionIfNeeded,
        updateAccountAlias,
    } = useHostedExperienceContext();

    return React.useMemo(
        () => ({
            signIn,
            signOut,
            pollConduitsOnce,
            restorePurchases,
            purchasePackage,
            refreshSessionIfNeeded,
            updateAccountAlias,
        }),
        [
            pollConduitsOnce,
            purchasePackage,
            refreshSessionIfNeeded,
            restorePurchases,
            signIn,
            signOut,
            updateAccountAlias,
        ],
    );
}

export function useHostedExperienceInitialSessionResolved(): boolean {
    return useHostedExperienceContext().initialSessionResolved;
}

export function useHostedExperienceSnapshotBootstrapPending(): boolean {
    return useHostedExperienceContext().hostedSnapshotBootstrapPending;
}

export function useHostedExperienceLastAuthProvider(): OAuthProvider | null {
    return useHostedExperienceContext().lastAuthProvider;
}
