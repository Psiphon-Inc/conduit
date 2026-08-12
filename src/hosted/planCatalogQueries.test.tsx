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
    QueryClient,
    QueryClientProvider,
    useQuery,
} from "@tanstack/react-query";
import { ReactTestRenderer, act, create } from "react-test-renderer";

import {
    HostedApiClientRequestError,
    createHostedApiClient,
} from "@/src/hosted/apiClient";
import { buildHostedPlanCatalogQuery } from "@/src/hosted/deviceInfo";
import { useHostedPlanOptionsQuery } from "@/src/hosted/planCatalogQueries";

jest.mock("@tanstack/react-query", () => {
    const actual = jest.requireActual("@tanstack/react-query");
    return {
        ...actual,
        useQuery: jest.fn(actual.useQuery),
    };
});

jest.mock("@/src/hosted/apiClient", () => {
    const actual = jest.requireActual("@/src/hosted/apiClient");
    return {
        ...actual,
        createHostedApiClient: jest.fn(),
    };
});

jest.mock("@/src/hosted/deviceInfo", () => ({
    buildHostedPlanCatalogQuery: jest.fn(() => ({
        platform: "ios",
        locale: "en-US",
        appVersion: "2.2.0",
        country: "CA",
    })),
}));

jest.mock("@/src/telemetry/clientEvents", () => ({
    recordClientEvent: jest.fn(),
    recordClientEventProblem: jest.fn(),
}));

const mockedCreateHostedApiClient =
    createHostedApiClient as jest.MockedFunction<typeof createHostedApiClient>;

describe("useHostedPlanOptionsQuery", () => {
    afterEach(() => {
        mountedRenderers.splice(0).forEach((renderer) => {
            act(() => renderer.unmount());
        });
        mountedQueryClients.splice(0).forEach((queryClient) => {
            queryClient.clear();
        });
        jest.clearAllMocks();
    });

    it("loads offerings and catalog, refreshing auth once after a 401", async () => {
        const catalog = {
            catalogVersion: "catalog-1",
            generatedAt: "2026-01-01T00:00:00.000Z",
            currencyDisplayMode: "revenuecat_price_string" as const,
            fallbackPolicy: {
                unmappedRevenueCatPackage: "error" as const,
            },
            plans: [
                {
                    id: "monthly",
                    status: "active" as const,
                    sortOrder: 1,
                    mapping: {
                        revenueCat: { packageIds: ["monthly-package"] },
                    },
                    display: {
                        title: "Monthly",
                        subtitle: null,
                        badge: null,
                        featureBullets: ["Hosted conduit"],
                        marketingCopy: null,
                    },
                    billing: { cadence: "monthly" as const },
                },
            ],
        };
        const getPlanCatalog = jest
            .fn()
            .mockRejectedValueOnce(
                new HostedApiClientRequestError("expired", 401),
            )
            .mockResolvedValueOnce(catalog);
        mockedCreateHostedApiClient.mockReturnValue({
            getPlanCatalog,
        } as unknown as ReturnType<typeof createHostedApiClient>);
        const getOfferings = jest.fn().mockResolvedValue({
            current: {
                identifier: "default",
                availablePackages: [
                    {
                        identifier: "monthly-package",
                        product: {
                            identifier: "monthly-product",
                            title: "Monthly product",
                            priceString: "$5.00",
                        },
                        target: {},
                    },
                ],
            },
        });
        const refreshSessionIfNeeded = jest
            .fn()
            .mockResolvedValue({ accessToken: "stale-token" });
        const refreshSession = jest
            .fn()
            .mockResolvedValue({ accessToken: "fresh-token" });
        const queryClient = makeQueryClient();
        const result = renderHook(queryClient, () =>
            useHostedPlanOptionsQuery({
                baseUrl: "https://hosted.example.test",
                accountId: "account-1",
                enabled: true,
                getOfferings,
                refreshSessionIfNeeded,
                refreshSession,
            }),
        );

        await waitFor(() => expect(result.current?.isSuccess).toBe(true));

        expect(getOfferings).toHaveBeenCalledTimes(1);
        expect(refreshSessionIfNeeded).toHaveBeenCalledTimes(1);
        expect(refreshSession).toHaveBeenCalledTimes(1);
        expect(getPlanCatalog).toHaveBeenNthCalledWith(
            1,
            "stale-token",
            buildHostedPlanCatalogQuery(),
        );
        expect(getPlanCatalog).toHaveBeenNthCalledWith(
            2,
            "fresh-token",
            buildHostedPlanCatalogQuery(),
        );
        expect(result.current?.data).toMatchObject({
            blockingError: null,
            offeringIdentifier: "default",
            options: [
                {
                    key: "monthly-package",
                    matchedPlanId: "monthly",
                    priceText: "$5.00",
                },
            ],
        });

        const options = (useQuery as unknown as jest.Mock).mock.calls.at(-1)[0];
        expect(options.queryKey).toEqual([
            "hosted",
            "activate-offerings",
            "account-1",
            buildHostedPlanCatalogQuery(),
        ]);
        expect(options.staleTime).toBe(60_000);
        expect(options.gcTime).toBe(600_000);
        expect(options.retry).toBe(3);
        expect(options.retryDelay).toBe(5_000);
        expect(options.refetchOnMount).toBe(false);
        expect(options.refetchOnWindowFocus).toBe(false);
        expect(options.refetchOnReconnect).toBe(true);
    });
});

function makeQueryClient(): QueryClient {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: Infinity },
        },
    });
    mountedQueryClients.push(queryClient);
    return queryClient;
}

function renderHook<T>(
    queryClient: QueryClient,
    useHook: () => T,
): { current: T | null } {
    const result: { current: T | null } = { current: null };
    function Probe() {
        result.current = useHook();
        return null;
    }
    act(() => {
        mountedRenderers.push(
            create(
                <QueryClientProvider client={queryClient}>
                    <Probe />
                </QueryClientProvider>,
            ),
        );
    });
    return result;
}

const mountedRenderers: ReactTestRenderer[] = [];
const mountedQueryClients: QueryClient[] = [];

async function waitFor(assertion: () => void): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 12; attempt += 1) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await act(async () => {
                await Promise.resolve();
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
        }
    }
    throw lastError;
}
