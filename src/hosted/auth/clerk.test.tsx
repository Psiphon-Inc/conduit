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
import { act, create } from "react-test-renderer";

import {
    readHostedClerkJwtTemplate,
    readHostedClerkPublishableKey,
    useHostedClerkAuthService,
} from "@/src/hosted/auth/clerk";
import { HostedAuthService } from "@/src/hosted/auth/types";

jest.mock("expo-auth-session", () => ({
    makeRedirectUri: jest.fn(() => "conduit://sso-callback"),
}));

jest.mock("expo-constants", () => ({
    expoConfig: {
        scheme: "conduit",
        version: "1.0.0",
    },
}));

const mockStartSSOFlow = jest.fn();
const mockGetToken = jest.fn();
const mockSignOut = jest.fn();

jest.mock("@clerk/clerk-expo", () => {
    const React = require("react");

    return {
        ClerkProvider: ({ children }: { children: React.ReactNode }) =>
            React.createElement(React.Fragment, null, children),
        useSSO: () => ({
            startSSOFlow: mockStartSSOFlow,
        }),
        useAuth: () => ({
            getToken: mockGetToken,
            signOut: mockSignOut,
        }),
    };
});

describe("hosted clerk auth", () => {
    beforeEach(() => {
        mockStartSSOFlow.mockReset();
        mockGetToken.mockReset();
        mockSignOut.mockReset();
        mockGetToken.mockResolvedValue("clerk.jwt.token");
        mockStartSSOFlow.mockResolvedValue({
            createdSessionId: "sess_test",
            setActive: jest.fn(async () => {}),
            authSessionResult: { type: "success" },
        });
    });

    it("reads publishable key from env", () => {
        process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = " pk_test_123 ";
        expect(readHostedClerkPublishableKey()).toBe("pk_test_123");
        delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
        expect(readHostedClerkPublishableKey()).toBe("");

        process.env.EXPO_PUBLIC_CLERK_HCB_JWT_TEMPLATE = " hcb_prod ";
        expect(readHostedClerkJwtTemplate()).toBe("hcb_prod");
        delete process.env.EXPO_PUBLIC_CLERK_HCB_JWT_TEMPLATE;
        expect(readHostedClerkJwtTemplate()).toBe("hcb");
    });

    it("mints broker token through interactive clerk sso flow", async () => {
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(getService().signIn("google")).resolves.toEqual(
            expect.objectContaining({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.jwt.token",
                platform: expect.stringMatching(/ios|android/),
                clientVersion: expect.stringMatching(/^conduit-/),
            }),
        );

        expect(mockStartSSOFlow).toHaveBeenCalledTimes(1);
        expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it("restores a broker token from the existing clerk session", async () => {
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(getService().restoreSignIn("google")).resolves.toEqual(
            expect.objectContaining({
                provider: "google",
                brokerToken: "clerk.jwt.token",
            }),
        );
        expect(mockStartSSOFlow).not.toHaveBeenCalled();
    });

    it("signs out of clerk when requested", async () => {
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(getService().signOut()).resolves.toBeUndefined();
        expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
});
