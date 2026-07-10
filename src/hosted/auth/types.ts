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
import { z } from "zod";

import {
    HostedBrokerTokenTypeSchema,
    OAuthPlatformSchema,
    OAuthProvider,
    OAuthProviderSchema,
} from "@/src/hosted/contracts";

export const HostedAuthAdapterResultSchema = z.object({
    tokenType: HostedBrokerTokenTypeSchema,
    brokerToken: z.string().min(1),
    platform: OAuthPlatformSchema,
    clientVersion: z.string().min(1),
});
type HostedAuthAdapterResult = z.infer<typeof HostedAuthAdapterResultSchema>;

const HostedAuthSignInResultSchema = HostedAuthAdapterResultSchema.extend({
    provider: OAuthProviderSchema,
});
export type HostedAuthSignInResult = z.infer<
    typeof HostedAuthSignInResultSchema
>;

export interface HostedAuthAdapter {
    signIn(): Promise<HostedAuthAdapterResult>;
}

export interface HostedAuthAdapterMap {
    google: HostedAuthAdapter;
    apple: HostedAuthAdapter;
}

export interface HostedAuthService {
    signIn(provider: OAuthProvider): Promise<HostedAuthSignInResult>;
    startEmailCodeSignIn?(email: string): Promise<void>;
    completeEmailCodeSignIn?(code: string): Promise<HostedAuthSignInResult>;
    restoreSignIn(
        provider: OAuthProvider,
    ): Promise<HostedAuthSignInResult | null>;
    signOut(): Promise<void>;
}

const HostedAuthServiceErrorCodeSchema = z.enum([
    "cancelled",
    "unavailable",
    "invalid_response",
    "unknown",
]);
type HostedAuthServiceErrorCode = z.infer<
    typeof HostedAuthServiceErrorCodeSchema
>;

export class HostedAuthServiceError extends Error {
    readonly code: HostedAuthServiceErrorCode;
    readonly userMessage: string;
    readonly cause?: unknown;

    constructor(input: {
        code: HostedAuthServiceErrorCode;
        message: string;
        userMessage: string;
        cause?: unknown;
    }) {
        super(input.message);
        this.name = "HostedAuthServiceError";
        this.code = input.code;
        this.userMessage = input.userMessage;
        this.cause = input.cause;
    }
}
