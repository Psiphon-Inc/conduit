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
import {
    INPROXY_MAX_CLIENTS_MAX,
    INPROXY_MAX_CLIENTS_TOTAL_MAX,
} from "@/src/constants";
import { PersonalCompartmentIdSchema } from "@/src/hosted/contracts";

export const InproxyStatusEnumSchema = z.enum([
    "RUNNING",
    "STOPPED",
    "UNKNOWN",
]);

export const ProxyStateSchema = z.object({
    status: InproxyStatusEnumSchema,
    networkState: z.enum(["HAS_INTERNET", "NO_INTERNET"]).nullable().optional(),
});

export const ProxyErrorSchema = z.object({
    action: z.enum([
        "inProxyStartFailed",
        "inProxyRestartFailed",
        "inProxyMustUpgrade",
        "unimplemented",
    ]),
    message: z.string().optional(),
});

export const InproxyActivityDataByPeriodSchema = z.object({
    bytesUp: z.array(z.number()),
    bytesDown: z.array(z.number()),
    announcingWorkers: z.array(z.number()),
    connectingClients: z.array(z.number()),
    connectedClients: z.array(z.number()),
    numBuckets: z.number(),
});

const InproxyActivityRegionSchema = z.object({
    region: z.string(),
    connectingClients: z.number(),
    connectedClients: z.number(),
    bytesUp: z.number(),
    bytesDown: z.number(),
});

const InproxyRegionalBreakdownWindowSchema = z.object({
    personal: z.array(InproxyActivityRegionSchema),
    common: z.array(InproxyActivityRegionSchema),
});

const InproxyRegionalBreakdownByWindowSchema = z.object({
    "48h": InproxyRegionalBreakdownWindowSchema,
    "7d": InproxyRegionalBreakdownWindowSchema,
    "30d": InproxyRegionalBreakdownWindowSchema,
});

const InproxyActivityPeriodMapSchema = z.object({
    "1000ms": InproxyActivityDataByPeriodSchema,
    "3600000ms": InproxyActivityDataByPeriodSchema.optional(),
});

const InproxyActivitySegmentSchema = z.object({
    totalBytesUp: z.number(),
    totalBytesDown: z.number(),
    currentAnnouncingWorkers: z.number(),
    currentConnectingClients: z.number(),
    currentConnectedClients: z.number(),
    dataByPeriod: InproxyActivityPeriodMapSchema,
});

const InproxyActivitySegmentsSchema = z.object({
    personal: InproxyActivitySegmentSchema,
    common: InproxyActivitySegmentSchema,
    total: InproxyActivitySegmentSchema.optional(),
});

function makeZeroPeriod(numBuckets: number) {
    return {
        bytesUp: new Array(numBuckets).fill(0),
        bytesDown: new Array(numBuckets).fill(0),
        announcingWorkers: new Array(numBuckets).fill(0),
        connectingClients: new Array(numBuckets).fill(0),
        connectedClients: new Array(numBuckets).fill(0),
        numBuckets,
    };
}

function makeZeroSegment(
    period1000ms: z.infer<typeof InproxyActivityDataByPeriodSchema>,
): z.infer<typeof InproxyActivitySegmentSchema> {
    return {
        totalBytesUp: 0,
        totalBytesDown: 0,
        currentAnnouncingWorkers: 0,
        currentConnectingClients: 0,
        currentConnectedClients: 0,
        dataByPeriod: {
            "1000ms": makeZeroPeriod(period1000ms.numBuckets),
            "3600000ms": makeZeroPeriod(720),
        },
    };
}

function makeZeroRegionalBreakdownByWindow(): z.infer<
    typeof InproxyRegionalBreakdownByWindowSchema
> {
    const emptyWindow = () => ({
        personal: [] as z.infer<typeof InproxyActivityRegionSchema>[],
        common: [] as z.infer<typeof InproxyActivityRegionSchema>[],
    });
    return {
        "48h": emptyWindow(),
        "7d": emptyWindow(),
        "30d": emptyWindow(),
    };
}

export const InproxyActivityStatsSchema = z
    .object({
        elapsedTime: z.number(),
        totalBytesUp: z.number(),
        totalBytesDown: z.number(),
        currentAnnouncingWorkers: z.number(),
        currentConnectingClients: z.number(),
        currentConnectedClients: z.number(),
        dataByPeriod: InproxyActivityPeriodMapSchema,
        segments: InproxyActivitySegmentsSchema.optional(),
        personalRegionActivity: z.array(InproxyActivityRegionSchema).optional(),
        commonRegionActivity: z.array(InproxyActivityRegionSchema).optional(),
        regionalBreakdownByWindow:
            InproxyRegionalBreakdownByWindowSchema.optional(),
    })
    .transform((stats) => {
        const period1000ms = stats.dataByPeriod["1000ms"];
        const period3600000ms =
            stats.dataByPeriod["3600000ms"] ?? makeZeroPeriod(720);
        const totalSegment = stats.segments?.total ?? {
            totalBytesUp: stats.totalBytesUp,
            totalBytesDown: stats.totalBytesDown,
            currentAnnouncingWorkers: stats.currentAnnouncingWorkers,
            currentConnectingClients: stats.currentConnectingClients,
            currentConnectedClients: stats.currentConnectedClients,
            dataByPeriod: {
                "1000ms": period1000ms,
                "3600000ms": period3600000ms,
            },
        };
        const personalSegment =
            stats.segments?.personal ?? makeZeroSegment(period1000ms);
        const commonSegment =
            stats.segments?.common ?? makeZeroSegment(period1000ms);

        return {
            ...stats,
            dataByPeriod: {
                "1000ms": period1000ms,
                "3600000ms": period3600000ms,
            },
            segments: {
                personal: {
                    ...personalSegment,
                    dataByPeriod: {
                        "1000ms": personalSegment.dataByPeriod["1000ms"],
                        "3600000ms":
                            personalSegment.dataByPeriod["3600000ms"] ??
                            makeZeroPeriod(720),
                    },
                },
                common: {
                    ...commonSegment,
                    dataByPeriod: {
                        "1000ms": commonSegment.dataByPeriod["1000ms"],
                        "3600000ms":
                            commonSegment.dataByPeriod["3600000ms"] ??
                            makeZeroPeriod(720),
                    },
                },
                total: {
                    ...totalSegment,
                    dataByPeriod: {
                        "1000ms": totalSegment.dataByPeriod["1000ms"],
                        "3600000ms":
                            totalSegment.dataByPeriod["3600000ms"] ??
                            period3600000ms,
                    },
                },
            },
            personalRegionActivity: stats.personalRegionActivity ?? [],
            commonRegionActivity: stats.commonRegionActivity ?? [],
            regionalBreakdownByWindow:
                stats.regionalBreakdownByWindow ??
                makeZeroRegionalBreakdownByWindow(),
        };
    });

export const InproxyEventSchema = z.object({
    type: z.enum(["proxyState", "proxyError", "inProxyActivityStats"]),
    data: z.union([
        ProxyStateSchema,
        ProxyErrorSchema,
        InproxyActivityStatsSchema,
    ]),
});

export const IpcEventSchema = z.object({
    type: z.enum([
        "bind",
        "registerClient",
        "unregisterClient",
        "fetchConduitPrivateKey",
        "stateClient",
    ]),
    data: z.object({
        status: z.enum([
            "accepted",
            "denied",
            "failed",
            "invalid",
            "disconnected",
        ]),
        timestampMs: z.number().optional(),
        caller: z.string().optional(),
        activeClientCount: z.number().int().optional(),
        message: z.string().optional(),
    }),
});

const InproxyTimeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);

// These are the user-configurable parameters for the inproxy.
export const InproxyParametersSchema = z
    .object({
        privateKey: Base64Unpadded64Bytes,
        maxClients: z.number().int().min(1).max(INPROXY_MAX_CLIENTS_MAX),
        maxPersonalClients: z
            .number()
            .int()
            .nonnegative()
            .max(INPROXY_MAX_CLIENTS_MAX),
        personalCompartmentId: PersonalCompartmentIdSchema.optional(),
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

        if (
            params.maxClients + params.maxPersonalClients >
            INPROXY_MAX_CLIENTS_TOTAL_MAX
        ) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Combined max clients cannot exceed total cap",
            });
        }

        if (
            params.maxPersonalClients > 0 &&
            params.personalCompartmentId === undefined
        ) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    "Personal compartment ID is required when personal peers are enabled",
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
export type InproxyActivitySegment = z.infer<
    typeof InproxyActivitySegmentSchema
>;
export type InproxyActivitySegments = {
    personal: InproxyActivitySegment;
    common: InproxyActivitySegment;
    total: InproxyActivitySegment;
};
export type InproxyActivityRegion = z.infer<typeof InproxyActivityRegionSchema>;
export type InproxyRegionalBreakdownByWindow = z.infer<
    typeof InproxyRegionalBreakdownByWindowSchema
>;
export type InproxyEvent = z.infer<typeof InproxyEventSchema>;
export type IpcEvent = z.infer<typeof IpcEventSchema>;

export interface InproxyContextValue {
    inproxyParameters: InproxyParameters;
    isPersonalPairingReady: boolean;
    toggleInproxy: () => Promise<void>;
    sendFeedback: () => Promise<void>;
    selectInproxyParameters: (params: InproxyParameters) => Promise<void>;
    logErrorToDiagnostic: (error: Error) => void;
}
