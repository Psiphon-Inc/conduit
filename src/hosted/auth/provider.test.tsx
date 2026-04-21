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
    HostedAuthProvider,
    useOptionalHostedAuthService,
} from "@/src/hosted/auth/provider";

describe("hosted auth provider", () => {
    it("falls back to stub auth service when clerk is not configured", async () => {
        delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

        let authService: ReturnType<typeof useOptionalHostedAuthService> = null;
        function Consumer() {
            authService = useOptionalHostedAuthService();
            return null;
        }

        await act(async () => {
            create(
                <HostedAuthProvider>
                    <Consumer />
                </HostedAuthProvider>,
            );
        });

        function getAuthService() {
            if (!authService) {
                throw new Error("auth service missing");
            }
            return authService;
        }

        await expect(getAuthService().signIn("google")).rejects.toEqual(
            expect.objectContaining({
                code: "unavailable",
            }),
        );
    });
});
