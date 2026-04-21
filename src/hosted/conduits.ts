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
import { base64urlnopad } from "@scure/base";
import { z } from "zod";

import {
    ConduitStatus,
    ConduitsSnapshot,
    ConduitsSnapshotSchema,
    PersonalCompartmentIdSchema,
} from "@/src/hosted/contracts";

const PairingTokenPayloadV1Schema = z.object({
    v: z.literal("1"),
    data: z.object({
        id: PersonalCompartmentIdSchema,
        name: z.string().min(1),
    }),
});

export interface PairingShareOutput {
    rawToken: string;
    deepLink: string;
    wrapperUrl: string | null;
}

export function getConduitsPhase(input: unknown): ConduitStatus {
    const snapshot = ConduitsSnapshotSchema.parse(input);
    const statuses = snapshot.conduits.map((conduit) => conduit.status);

    if (statuses.includes("active")) {
        return "active";
    }
    if (statuses.includes("provisioning")) {
        return "provisioning";
    }
    if (statuses.includes("suspended")) {
        return "suspended";
    }
    return "none";
}

export function normalizeConduitsSnapshot(input: unknown): ConduitsSnapshot {
    return ConduitsSnapshotSchema.parse(input);
}

export function buildPairingShareOutput(
    personalCompartmentId: string,
    stationAliasOrDisplayName: string,
    wrapperBaseUrl?: string | null,
): PairingShareOutput {
    const tokenPayload = PairingTokenPayloadV1Schema.parse({
        v: "1",
        data: {
            id: personalCompartmentId.trim(),
            name: stationAliasOrDisplayName,
        },
    });

    const rawToken = base64urlnopad.encode(
        new TextEncoder().encode(JSON.stringify(tokenPayload)),
    );

    return {
        rawToken,
        deepLink: `psiphon://pair/${rawToken}`,
        wrapperUrl: wrapperBaseUrl
            ? `${normalizeBaseUrl(wrapperBaseUrl)}/pair/${rawToken}`
            : null,
    };
}

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}
