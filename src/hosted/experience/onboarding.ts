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
import { isEntitlementAllowed } from "@/src/hosted/experience/stateMachine";
import { HostedExperienceState } from "@/src/hosted/experience/types";

export type HostedOnboardingStepStatus = "complete" | "current" | "up_next";

export type HostedOnboardingPrimaryAction =
    | "offline"
    | "sign_in"
    | "activate_or_restore"
    | "wait"
    | "share_or_manage"
    | "restore_or_manage";

export interface HostedOnboardingStep {
    key: "sign_in" | "activate" | "infrastructure";
    title: string;
    helper: string;
    status: HostedOnboardingStepStatus;
}

export interface HostedOnboardingViewModel {
    headline: string;
    detail: string;
    helper: string;
    primaryAction: HostedOnboardingPrimaryAction;
    steps: HostedOnboardingStep[];
}

type HostedOnboardingTranslator = (key: string) => string;

function translate(
    t: HostedOnboardingTranslator | undefined,
    key: string,
    fallback: string,
): string {
    return t?.(`${key}.string`) ?? fallback;
}

export function createHostedOnboardingViewModel(
    state: HostedExperienceState,
    options: {
        hasRecentSignIn?: boolean;
        isOffline?: boolean;
        t?: HostedOnboardingTranslator;
    } = {},
): HostedOnboardingViewModel {
    const signedIn = state.authPhase === "authenticated";
    const hasRecentSignIn = options.hasRecentSignIn === true;
    const isOffline = options.isOffline === true;
    const t = options.t;
    const entitlementAllowed = isEntitlementAllowed(state.entitlementSnapshot);
    const needsAttention =
        state.stationPhase === "suspended" && entitlementAllowed;
    const isWaitingForPlanSync =
        state.revenuecatPhase === "purchase_pending" ||
        state.revenuecatPhase === "restore_pending";
    const isWaitingForInitialInfrastructureStatus =
        signedIn && state.conduitsSnapshot === null;
    const needsReactivation =
        !entitlementAllowed &&
        (state.stationPhase === "active" || state.stationPhase === "suspended");
    const isPreparingInfrastructure =
        entitlementAllowed &&
        (state.stationPhase === "none" ||
            state.stationPhase === "provisioning");
    const isReady = entitlementAllowed && state.stationPhase === "active";

    const signInStatus: HostedOnboardingStepStatus = signedIn
        ? "complete"
        : "current";
    const activateStatus: HostedOnboardingStepStatus = !signedIn
        ? "up_next"
        : entitlementAllowed
          ? "complete"
          : "current";
    const infrastructureStatus: HostedOnboardingStepStatus = !signedIn
        ? "up_next"
        : isReady
          ? "complete"
          : entitlementAllowed
            ? "current"
            : "up_next";

    const steps: HostedOnboardingStep[] = [
        {
            key: "sign_in",
            title: translate(
                t,
                "HOSTED_ONBOARDING_STEP_SIGN_IN_TITLE_I18N",
                "Sign in",
            ),
            helper: translate(
                t,
                "HOSTED_ONBOARDING_STEP_SIGN_IN_HELPER_I18N",
                "Use your account so we can keep your hosted setup private and recoverable.",
            ),
            status: signInStatus,
        },
        {
            key: "activate",
            title: translate(
                t,
                "HOSTED_ONBOARDING_STEP_ACTIVATE_TITLE_I18N",
                "Activate hosted access",
            ),
            helper: translate(
                t,
                "HOSTED_ONBOARDING_STEP_ACTIVATE_HELPER_I18N",
                "Your plan keeps the service running and unlocks secure setup.",
            ),
            status: activateStatus,
        },
        {
            key: "infrastructure",
            title: translate(
                t,
                "HOSTED_ONBOARDING_STEP_INFRASTRUCTURE_TITLE_I18N",
                "Prepare your secure infrastructure",
            ),
            helper: translate(
                t,
                "HOSTED_ONBOARDING_STEP_INFRASTRUCTURE_HELPER_I18N",
                "We create and verify your hosted conduit, then you can share it.",
            ),
            status: infrastructureStatus,
        },
    ];

    if (isOffline) {
        return {
            headline: translate(
                t,
                "HOSTED_ONBOARDING_OFFLINE_HEADLINE_I18N",
                "No internet connection",
            ),
            detail: translate(
                t,
                "HOSTED_ONBOARDING_OFFLINE_DETAIL_I18N",
                "We can't reach the server right now. Check your connection and try again.",
            ),
            helper: translate(
                t,
                "HOSTED_ONBOARDING_OFFLINE_HELPER_I18N",
                "We'll reconnect as soon as your device is back online.",
            ),
            primaryAction: "offline",
            steps,
        };
    }

    if (!signedIn) {
        if (hasRecentSignIn) {
            return {
                headline: translate(
                    t,
                    "HOSTED_ONBOARDING_SIGN_IN_RETURNING_HEADLINE_I18N",
                    "Sign in to view your hosted conduit",
                ),
                detail: translate(
                    t,
                    "HOSTED_ONBOARDING_SIGN_IN_RETURNING_DETAIL_I18N",
                    "We'll reconnect you to your existing hosted setup and current account state.",
                ),
                helper: translate(
                    t,
                    "HOSTED_ONBOARDING_SIGN_IN_RETURNING_HELPER_I18N",
                    "If your session expired, sign back in to view your dashboard, manage your plan, or continue setup.",
                ),
                primaryAction: "sign_in",
                steps,
            };
        }

        return {
            headline: translate(
                t,
                "HOSTED_ONBOARDING_SIGN_IN_NEW_HEADLINE_I18N",
                "Sign in to start your hosted setup",
            ),
            detail: translate(
                t,
                "HOSTED_ONBOARDING_SIGN_IN_NEW_DETAIL_I18N",
                "Sign in to manage your hosted conduit from any device.",
            ),
            helper: translate(
                t,
                "HOSTED_ONBOARDING_SIGN_IN_NEW_HELPER_I18N",
                "Your account links your conduit so you can monitor, configure, and share it across devices.",
            ),
            primaryAction: "sign_in",
            steps,
        };
    }

    if (needsAttention) {
        return {
            headline: translate(
                t,
                "HOSTED_ONBOARDING_NEEDS_ATTENTION_HEADLINE_I18N",
                "Your hosted setup needs attention",
            ),
            detail: translate(
                t,
                "HOSTED_ONBOARDING_NEEDS_ATTENTION_DETAIL_I18N",
                "Restore access to keep your hosted conduit available.",
            ),
            helper: translate(
                t,
                "HOSTED_ONBOARDING_NEEDS_ATTENTION_HELPER_I18N",
                "Your saved setup stays linked to this account, so you can recover without starting over.",
            ),
            primaryAction: "restore_or_manage",
            steps,
        };
    }

    if (needsReactivation) {
        return {
            headline: translate(
                t,
                "HOSTED_ONBOARDING_REACTIVATE_HEADLINE_I18N",
                "Reactivate your hosted plan to continue",
            ),
            detail: translate(
                t,
                "HOSTED_ONBOARDING_REACTIVATE_DETAIL_I18N",
                "Your conduit is still linked to this account, but access is paused until your plan is active again.",
            ),
            helper: translate(
                t,
                "HOSTED_ONBOARDING_REACTIVATE_HELPER_I18N",
                "Choose a plan to resume sharing and dashboard access.",
            ),
            primaryAction: "activate_or_restore",
            steps,
        };
    }

    if (isReady) {
        return {
            headline: translate(t, "YOUR_CONDUITS_I18N", "Your Conduits"),
            detail: "",
            helper: "",
            primaryAction: "share_or_manage",
            steps,
        };
    }

    if (
        isWaitingForInitialInfrastructureStatus ||
        isWaitingForPlanSync ||
        isPreparingInfrastructure
    ) {
        return {
            headline: translate(
                t,
                "HOSTED_ONBOARDING_WAIT_HEADLINE_I18N",
                "We are preparing your secure infrastructure",
            ),
            detail: translate(
                t,
                "HOSTED_ONBOARDING_WAIT_DETAIL_I18N",
                "This can take a moment while we finish account and station checks.",
            ),
            helper: translate(
                t,
                "HOSTED_ONBOARDING_WAIT_HELPER_I18N",
                "We'll keep progress current; you can refresh at any time without losing your place.",
            ),
            primaryAction: "wait",
            steps,
        };
    }

    return {
        headline: translate(
            t,
            "HOSTED_ONBOARDING_ACTIVATE_HEADLINE_I18N",
            "Activate your hosted plan to continue",
        ),
        detail: translate(
            t,
            "HOSTED_ONBOARDING_ACTIVATE_DETAIL_I18N",
            "Activation unlocks your hosted conduit so you can support open internet access.",
        ),
        helper: translate(
            t,
            "HOSTED_ONBOARDING_ACTIVATE_HELPER_I18N",
            "Choose a plan to continue setup and unlock sharing.",
        ),
        primaryAction: "activate_or_restore",
        steps,
    };
}
