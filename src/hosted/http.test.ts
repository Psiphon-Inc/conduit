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
    createHostedResponseError,
    fetchHostedResponse,
    normalizeHostedBaseUrl,
    parseHostedResponseBody,
    requestHostedJsonWithBearer,
} from "@/src/hosted/http";
import { recordClientEventError } from "@/src/telemetry/clientEvents";

jest.mock("@/src/telemetry/clientEvents", () => ({
    recordClientEventError: jest.fn(),
    sanitizeUrlForClientEvent: jest.fn((url: string) => url.split("?")[0]),
}));

class TestRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code?: string,
    ) {
        super(message);
        this.name = "TestRequestError";
    }
}

const createRequestError = (message: string, status: number, code?: string) =>
    new TestRequestError(message, status, code);

describe("hosted HTTP helpers", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("normalizes one trailing slash and preserves client-specific trimming", () => {
        expect(normalizeHostedBaseUrl("https://hosted.example.test//")).toBe(
            "https://hosted.example.test/",
        );
        expect(normalizeHostedBaseUrl(" https://hosted.example.test/ ")).toBe(
            " https://hosted.example.test/ ",
        );
        expect(
            normalizeHostedBaseUrl(" https://hosted.example.test/ ", {
                trimWhitespace: true,
            }),
        ).toBe("https://hosted.example.test");
    });

    it("parses JSON and preserves empty and non-JSON resource bodies", async () => {
        await expect(
            parseHostedResponseBody(makeResponse(200, '{"ok":true}')),
        ).resolves.toEqual({ ok: true });
        await expect(
            parseHostedResponseBody(makeResponse(204, "")),
        ).resolves.toBeNull();
        await expect(
            parseHostedResponseBody(makeResponse(502, "upstream unavailable")),
        ).resolves.toBe("upstream unavailable");
    });

    it("allows session requests to reject non-JSON bodies with their own error", async () => {
        const requestError = new TestRequestError("session unavailable", 502);

        await expect(
            parseHostedResponseBody(
                makeResponse(502, "<html>bad gateway</html>"),
                {
                    onInvalidJson: () => requestError,
                },
            ),
        ).rejects.toBe(requestError);
    });

    it("creates caller-owned errors from hosted API error payloads", () => {
        const error = createHostedResponseError(
            {
                error: {
                    code: "auth.unauthorized",
                    message: "Token rejected",
                },
            },
            401,
            createRequestError,
        );

        expect(error).toEqual(
            expect.objectContaining({
                name: "TestRequestError",
                message: "Token rejected",
                status: 401,
                code: "auth.unauthorized",
            }),
        );
    });

    it("adds standard bearer request options without replacing caller headers", async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(makeResponse(200, '{"ok":true}'));

        await expect(
            requestHostedJsonWithBearer(
                fetchImpl,
                "https://hosted.example.test/v1/resource",
                "access-token",
                {
                    telemetryClient: "hosted-api",
                    createRequestError,
                    init: {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                    },
                },
            ),
        ).resolves.toEqual({ ok: true });
        expect(fetchImpl).toHaveBeenCalledWith(
            "https://hosted.example.test/v1/resource",
            expect.objectContaining({
                method: "POST",
                cache: "no-store",
                headers: {
                    authorization: "Bearer access-token",
                    "content-type": "application/json",
                },
            }),
        );
    });

    it.each(["hosted-api", "hosted-session"])(
        "records fetch failures with the %s telemetry identity",
        async (telemetryClient) => {
            const fetchError = new Error("network unavailable");
            const fetchImpl = jest.fn().mockRejectedValue(fetchError);

            await expect(
                fetchHostedResponse(
                    fetchImpl,
                    "https://hosted.example.test/v1/resource?token=secret",
                    { method: "post" },
                    telemetryClient,
                ),
            ).rejects.toBe(fetchError);
            expect(recordClientEventError).toHaveBeenCalledWith(
                "hosted.api.fetch_failed",
                fetchError,
                {
                    client: telemetryClient,
                    method: "POST",
                    url: "https://hosted.example.test/v1/resource",
                },
            );
        },
    );
});

function makeResponse(status: number, body: string): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
    } as Response;
}
