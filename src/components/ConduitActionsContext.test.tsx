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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { ReactTestRenderer, act, create } from "react-test-renderer";

import {
    ConduitActionsContextValue,
    ConduitActionsProvider,
    useConduitActions,
} from "@/src/components/ConduitActionsContext";
import { QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID } from "@/src/constants";
import { useHostedExperienceState } from "@/src/hosted/experience/hooks";

jest.mock("expo-haptics", () => ({
    ImpactFeedbackStyle: { Medium: "medium" },
    impactAsync: jest.fn(),
}));

jest.mock("@/src/components/ModalStore", () => ({
    useModal: () => ({ openModal: jest.fn() }),
}));

jest.mock("@/src/components/PersonalPairingShareModal", () => ({
    PersonalPairingShareModal: () => null,
}));

jest.mock("@/src/components/RyveCallToAction", () => ({
    RyveClaimModalContent: () => null,
}));

jest.mock("@/src/components/ryveClaim", () => ({
    resolvePreferredRyveName: () => "",
}));

jest.mock("@/src/hosted/experience/hooks", () => ({
    useHostedExperienceState: jest.fn(),
}));

const mockedUseHostedExperienceState =
    useHostedExperienceState as jest.MockedFunction<
        typeof useHostedExperienceState
    >;

describe("ConduitActionsProvider", () => {
    afterEach(() => {
        jest.clearAllMocks();
        mountedRenderers.splice(0).forEach((renderer) => {
            act(() => {
                renderer.unmount();
            });
        });
    });

    it("does not use the local Android personal compartment ID on iOS", () => {
        mockedUseHostedExperienceState.mockReturnValue({
            authPhase: "authenticated",
            session: { personalPairingWrapperBaseUrl: null },
            stationPhase: "active",
            entitlementSnapshot: "active",
            conduitsSnapshot: {
                entitlement: { status: "active" },
                conduits: [
                    {
                        conduit_id: "cond_1",
                        proxy_id: "st_1",
                        status: "active",
                    },
                ],
            },
        } as never);

        const queryClient = createTestQueryClient();
        queryClient.setQueryData(
            [QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID],
            "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
        );

        const contextValue = renderProvider(queryClient);

        expect(contextValue.personalCompartmentId).toBeNull();
        expect(contextValue.isPersonalPairingPreparing).toBe(true);
    });

    it("uses the hosted snapshot personal compartment ID on iOS once it is ready", () => {
        mockedUseHostedExperienceState.mockReturnValue({
            authPhase: "authenticated",
            session: { personalPairingWrapperBaseUrl: null },
            stationPhase: "active",
            entitlementSnapshot: "active",
            conduitsSnapshot: {
                entitlement: { status: "active" },
                conduits: [
                    {
                        conduit_id: "cond_1",
                        proxy_id: "st_1",
                        status: "active",
                        traffic_scope: "personal",
                        personal_compartment_id:
                            "N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk",
                    },
                ],
            },
        } as never);

        const queryClient = createTestQueryClient();
        queryClient.setQueryData(
            [QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID],
            "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
        );

        const contextValue = renderProvider(queryClient);

        expect(contextValue.personalCompartmentId).toBe(
            "N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk",
        );
        expect(contextValue.isPersonalPairingPreparing).toBe(false);
    });
});

function renderProvider(queryClient: QueryClient): ConduitActionsContextValue {
    let contextValue: ConduitActionsContextValue | null = null;
    let renderer!: ReactTestRenderer;

    function Consumer() {
        contextValue = useConduitActions();
        return null;
    }

    act(() => {
        renderer = create(
            <QueryClientProvider client={queryClient}>
                <ConduitActionsProvider>
                    <Consumer />
                </ConduitActionsProvider>
            </QueryClientProvider>,
        );
    });
    mountedRenderers.push(renderer);

    if (!contextValue) {
        throw new Error("context unavailable");
    }

    return contextValue;
}

const mountedRenderers: ReactTestRenderer[] = [];

function createTestQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { gcTime: Infinity },
            mutations: { gcTime: Infinity },
        },
    });
}
