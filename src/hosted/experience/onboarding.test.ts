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
    HostedOnboardingPrimaryAction,
    createHostedOnboardingViewModel,
} from "@/src/hosted/experience/onboarding";
import { createInitialHostedExperienceState } from "@/src/hosted/experience/stateMachine";
import { HostedExperienceState } from "@/src/hosted/experience/types";

describe("hosted onboarding view model", () => {
    it("maps signed out users to sign-in guidance", () => {
        expectPrimaryAction({}, "sign_in");
    });

    it("updates signed-out copy when the user has signed in before", () => {
        const viewModel = createHostedOnboardingViewModel(makeState({}), {
            hasRecentSignIn: true,
        });

        expect(viewModel.headline).toBe("Sign in to view your hosted conduit");
        expect(viewModel.detail).toContain("existing hosted setup");
    });

    it("maps offline state to the dedicated offline screen", () => {
        const viewModel = createHostedOnboardingViewModel(makeState({}), {
            isOffline: true,
        });

        expect(viewModel.primaryAction).toBe("offline");
        expect(viewModel.headline).toBe("No internet connection");
    });

    it("keeps signed-in users without a conduits snapshot in the wait flow", () => {
        expectPrimaryAction(
            {
                authPhase: "authenticated",
                entitlementSnapshot: "inactive",
                stationPhase: "none",
                conduitsSnapshot: null,
            },
            "wait",
        );
    });

    it("maps inactive + none to activate flow", () => {
        expectPrimaryAction(
            {
                authPhase: "authenticated",
                entitlementSnapshot: "inactive",
                stationPhase: "none",
                conduitsSnapshot: {
                    entitlement: { status: "inactive" },
                    conduits: [],
                },
            },
            "activate_or_restore",
        );
    });

    it("maps active + provisioning to wait flow", () => {
        expectPrimaryAction(
            {
                authPhase: "authenticated",
                entitlementSnapshot: "active",
                stationPhase: "provisioning",
            },
            "wait",
        );
    });

    it("maps active + active to share/manage flow", () => {
        expectPrimaryAction(
            {
                authPhase: "authenticated",
                entitlementSnapshot: "active",
                stationPhase: "active",
            },
            "share_or_manage",
        );
    });

    it("maps inactive + active to activate/restore flow", () => {
        expectPrimaryAction(
            {
                authPhase: "authenticated",
                entitlementSnapshot: "inactive",
                stationPhase: "active",
            },
            "activate_or_restore",
        );
    });

    it("maps expired entitlement to activate/restore flow", () => {
        expectPrimaryAction(
            {
                authPhase: "authenticated",
                entitlementSnapshot: "expired",
                stationPhase: "suspended",
            },
            "activate_or_restore",
        );
    });

    it("maps suspended station with inactive entitlement to activate/restore flow", () => {
        expectPrimaryAction(
            {
                authPhase: "authenticated",
                entitlementSnapshot: "inactive",
                stationPhase: "suspended",
            },
            "activate_or_restore",
        );
    });

    it("does not map transient station errors to restore/manage flow", () => {
        expectPrimaryAction(
            {
                authPhase: "authenticated",
                entitlementSnapshot: "active",
                stationPhase: "error",
                conduitsSnapshot: {
                    entitlement: { status: "active" },
                    conduits: [],
                },
            },
            "activate_or_restore",
        );
    });

    it("treats grace and canceled-not-expired as allowed entitlements", () => {
        expectPrimaryAction(
            {
                authPhase: "authenticated",
                entitlementSnapshot: "grace",
                stationPhase: "active",
            },
            "share_or_manage",
        );

        expectPrimaryAction(
            {
                authPhase: "authenticated",
                entitlementSnapshot: "canceled_not_expired",
                stationPhase: "provisioning",
            },
            "wait",
        );
    });
});

function expectPrimaryAction(
    partialState: Partial<HostedExperienceState>,
    expectedAction: HostedOnboardingPrimaryAction,
) {
    const state = makeState(partialState);
    const viewModel = createHostedOnboardingViewModel(state);
    expect(viewModel.primaryAction).toBe(expectedAction);
}

function makeState(
    partialState: Partial<HostedExperienceState>,
): HostedExperienceState {
    return {
        ...createInitialHostedExperienceState(),
        ...partialState,
    };
}
