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
import { base64url } from "@scure/base";
import * as Linking from "expo-linking";

import {
    buildRyveClaimDeepLink,
    canOpenRyveClaimDeepLink,
    getRyveInstallUrl,
    resolvePreferredRyveName,
} from "@/src/components/ryveClaim";
import { RYVE_APP_LISTING_GOOGLE, RYVE_LEARN_MORE_URL } from "@/src/constants";

jest.mock("expo-linking", () => ({
    canOpenURL: jest.fn(),
}));

describe("RyveCallToAction", () => {
    it("resolves the Ryve install URL by platform", () => {
        expect(getRyveInstallUrl("android")).toBe(RYVE_APP_LISTING_GOOGLE);
        expect(getRyveInstallUrl("ios")).toBe(RYVE_LEARN_MORE_URL);
    });

    it("returns false when the claim deep link check throws", async () => {
        const canOpenURL = jest.mocked(Linking.canOpenURL);
        canOpenURL.mockRejectedValueOnce(new Error("missing scheme"));

        await expect(
            canOpenRyveClaimDeepLink(
                "network.ryve.app://(app)/conduits?claim=x",
            ),
        ).resolves.toBe(false);
    });

    it("prefers the local alias when building the claim deep link", () => {
        const deepLink = buildRyveClaimDeepLink(
            {
                version: 1,
                key: "a".repeat(86),
                default_name: "Common hosted conduit",
            },
            "My local alias",
        );

        const encoded = deepLink.split("claim=")[1];
        const payload = JSON.parse(
            new TextDecoder().decode(base64url.decode(encoded)),
        ) as {
            data: { key: string; name?: string };
            version: number;
        };

        expect(payload.version).toBe(1);
        expect(payload.data.name).toBe("My local alias");
    });

    it("matches the Go CLI claim encoding shape", () => {
        const deepLink = buildRyveClaimDeepLink(
            {
                version: 1,
                key: "a".repeat(86),
            },
            "Tasker's Hetty 2.0",
        );

        expect(deepLink).toBe(
            "network.ryve.app://(app)/conduits?claim=eyJkYXRhIjp7ImtleSI6ImFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhIiwibmFtZSI6IlRhc2tlcidzIEhldHR5IDIuMCJ9LCJ2ZXJzaW9uIjoxfQ==",
        );
    });

    it("ignores blank preferred aliases and falls back to the next name", () => {
        expect(
            resolvePreferredRyveName("   ", "Tasker's Hetty 2.0", undefined),
        ).toBe("Tasker's Hetty 2.0");
    });
});
