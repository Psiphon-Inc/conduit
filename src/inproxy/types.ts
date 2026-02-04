/*
 * Copyright (c) 2024, Psiphon Inc.
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

import { Base64Unpadded64Bytes } from "@/src/common/validators";

export const InproxyStatusEnumSchema = z.enum([
    "RUNNING",
    "STOPPED",
    "UNKNOWN",
]);

export const ProxyStateSchema = z.object({
    status: InproxyStatusEnumSchema,
    networkState: z.enum(["HAS_INTERNET", "NO_INTERNET"]).nullable(),
});

export const ProxyErrorSchema = z.object({
    action: z.enum([
        "inProxyStartFailed",
        "inProxyRestartFailed",
        "inProxyMustUpgrade",
    ]),
});

export const InproxyActivityDataByPeriodSchema = z.object({
    bytesUp: z.array(z.number()),
    bytesDown: z.array(z.number()),
    announcingWorkers: z.array(z.number()),
    connectingClients: z.array(z.number()),
    connectedClients: z.array(z.number()),
    numBuckets: z.number(),
});

export const InproxyActivityStatsSchema = z.object({
    elapsedTime: z.number(),
    totalBytesUp: z.number(),
    totalBytesDown: z.number(),
    currentAnnouncingWorkers: z.number(),
    currentConnectingClients: z.number(),
    currentConnectedClients: z.number(),
    dataByPeriod: z.object({
        "1000ms": InproxyActivityDataByPeriodSchema,
    }),
});

export const InproxyEventSchema = z.object({
    type: z.enum(["proxyState", "proxyError", "inProxyActivityStats"]),
    data: z.union([
        ProxyStateSchema,
        ProxyErrorSchema,
        InproxyActivityStatsSchema,
    ]),
});

const InproxyTimeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);

// These are the user-configurable parameters for the inproxy.
export const InproxyParametersSchema = z
    .object({
        privateKey: Base64Unpadded64Bytes,
        maxClients: z.number().int().positive(),
        limitUpstreamBytesPerSecond: z.number().int().positive(),
        limitDownstreamBytesPerSecond: z.number().int().positive(),
        reducedStartTime: InproxyTimeSchema.optional(),
        reducedEndTime: InproxyTimeSchema.optional(),
        reducedMaxClients: z.number().int().positive().optional(),
        reducedLimitUpstreamBytesPerSecond: z
            .number()
            .int()
            .positive()
            .optional(),
        reducedLimitDownstreamBytesPerSecond: z
            .number()
            .int()
            .positive()
            .optional(),
    })
    .superRefine((params, context) => {
        const reducedFields = [
            params.reducedStartTime,
            params.reducedEndTime,
            params.reducedMaxClients,
            params.reducedLimitUpstreamBytesPerSecond,
            params.reducedLimitDownstreamBytesPerSecond,
        ];
        const hasAnyReduced = reducedFields.some(
            (value) => value !== undefined,
        );
        const hasAllReduced = reducedFields.every(
            (value) => value !== undefined,
        );

        if (hasAnyReduced && !hasAllReduced) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Reduced settings require all fields to be set",
            });
        }

        if (
            params.reducedMaxClients !== undefined &&
            params.reducedMaxClients > params.maxClients
        ) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Reduced max clients cannot exceed max clients",
            });
        }
    });

export type InproxyParameters = z.infer<typeof InproxyParametersSchema>;
export type InproxyStatusEnum = z.infer<typeof InproxyStatusEnumSchema>;
export type ProxyState = z.infer<typeof ProxyStateSchema>;
export type ProxyError = z.infer<typeof ProxyErrorSchema>;
export type InproxyActivityStats = z.infer<typeof InproxyActivityStatsSchema>;
export type InproxyActivityByPeriod = z.infer<
    typeof InproxyActivityDataByPeriodSchema
>;
export type InproxyEvent = z.infer<typeof InproxyEventSchema>;

export interface InproxyContextValue {
    inproxyParameters: InproxyParameters;
    toggleInproxy: () => Promise<void>;
    sendFeedback: () => Promise<void>;
    selectInproxyParameters: (params: InproxyParameters) => Promise<void>;
    logErrorToDiagnostic: (error: Error) => void;
}
