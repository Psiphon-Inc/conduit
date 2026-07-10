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

type HostedOnboardingStepStatus = "complete" | "current" | "up_next";

export type HostedOnboardingPrimaryAction =
    | "offline"
    | "sign_in"
    | "activate_or_restore"
    | "wait"
    | "share_or_manage"
    | "restore_or_manage";

interface HostedOnboardingStep {
    key: "sign_in" | "activate" | "infrastructure";
    title: string;
    helper: string;
    status: HostedOnboardingStepStatus;
}

interface HostedOnboardingViewModel {
    headline: string;
    detail: string;
    helper: string;
    primaryAction: HostedOnboardingPrimaryAction;
    steps: HostedOnboardingStep[];
}

type HostedOnboardingTranslator = (key: string) => string;

export function createHostedOnboardingViewModel(
    state: HostedExperienceState,
    options: {
        hasRecentSignIn?: boolean;
        isOffline?: boolean;
        t: HostedOnboardingTranslator;
    },
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
            title: t("HOSTED_ONBOARDING_STEP_SIGN_IN_TITLE_I18N.string"),
            helper: t("HOSTED_ONBOARDING_STEP_SIGN_IN_HELPER_I18N.string"),
            status: signInStatus,
        },
        {
            key: "activate",
            title: t("HOSTED_ONBOARDING_STEP_ACTIVATE_TITLE_I18N.string"),
            helper: t("HOSTED_ONBOARDING_STEP_ACTIVATE_HELPER_I18N.string"),
            status: activateStatus,
        },
        {
            key: "infrastructure",
            title: t("HOSTED_ONBOARDING_STEP_INFRASTRUCTURE_TITLE_I18N.string"),
            helper: t(
                "HOSTED_ONBOARDING_STEP_INFRASTRUCTURE_HELPER_I18N.string",
            ),
            status: infrastructureStatus,
        },
    ];

    if (isOffline) {
        return {
            headline: t("HOSTED_ONBOARDING_OFFLINE_HEADLINE_I18N.string"),
            detail: t("HOSTED_ONBOARDING_OFFLINE_DETAIL_I18N.string"),
            helper: t("HOSTED_ONBOARDING_OFFLINE_HELPER_I18N.string"),
            primaryAction: "offline",
            steps,
        };
    }

    if (!signedIn) {
        if (hasRecentSignIn) {
            return {
                headline: t(
                    "HOSTED_ONBOARDING_SIGN_IN_RETURNING_HEADLINE_I18N.string",
                ),
                detail: t(
                    "HOSTED_ONBOARDING_SIGN_IN_RETURNING_DETAIL_I18N.string",
                ),
                helper: t(
                    "HOSTED_ONBOARDING_SIGN_IN_RETURNING_HELPER_I18N.string",
                ),
                primaryAction: "sign_in",
                steps,
            };
        }

        return {
            headline: t("HOSTED_ONBOARDING_SIGN_IN_NEW_HEADLINE_I18N.string"),
            detail: t("HOSTED_ONBOARDING_SIGN_IN_NEW_DETAIL_I18N.string"),
            helper: t("HOSTED_ONBOARDING_SIGN_IN_NEW_HELPER_I18N.string"),
            primaryAction: "sign_in",
            steps,
        };
    }

    if (needsAttention) {
        return {
            headline: t(
                "HOSTED_ONBOARDING_NEEDS_ATTENTION_HEADLINE_I18N.string",
            ),
            detail: t("HOSTED_ONBOARDING_NEEDS_ATTENTION_DETAIL_I18N.string"),
            helper: t("HOSTED_ONBOARDING_NEEDS_ATTENTION_HELPER_I18N.string"),
            primaryAction: "restore_or_manage",
            steps,
        };
    }

    if (needsReactivation) {
        return {
            headline: t("HOSTED_ONBOARDING_REACTIVATE_HEADLINE_I18N.string"),
            detail: t("HOSTED_ONBOARDING_REACTIVATE_DETAIL_I18N.string"),
            helper: t("HOSTED_ONBOARDING_REACTIVATE_HELPER_I18N.string"),
            primaryAction: "activate_or_restore",
            steps,
        };
    }

    if (isReady) {
        return {
            headline: t("YOUR_CONDUITS_I18N.string"),
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
            headline: t("HOSTED_ONBOARDING_WAIT_HEADLINE_I18N.string"),
            detail: t("HOSTED_ONBOARDING_WAIT_DETAIL_I18N.string"),
            helper: t("HOSTED_ONBOARDING_WAIT_HELPER_I18N.string"),
            primaryAction: "wait",
            steps,
        };
    }

    return {
        headline: t("HOSTED_ONBOARDING_ACTIVATE_HEADLINE_I18N.string"),
        detail: t("HOSTED_ONBOARDING_ACTIVATE_DETAIL_I18N.string"),
        helper: t("HOSTED_ONBOARDING_ACTIVATE_HELPER_I18N.string"),
        primaryAction: "activate_or_restore",
        steps,
    };
}
