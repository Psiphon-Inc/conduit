import { z } from "zod";

import { Base64Unpadded64Bytes } from "@/src/common/validators";

export const InProxyStatusEnumSchema = z.enum([
    "RUNNING",
    "STOPPED",
    "UNKNOWN",
]);

export const InProxyStateSchema = z.object({
    status: InProxyStatusEnumSchema,
    networkState: z.enum(["HAS_INTERNET", "NO_INTERNET"]),
});

export const InProxyErrorSchema = z.object({
    data: z.enum([
        "proxyStartFailed",
        "proxyRestartFailed",
        "inProxyMustUpgrade",
    ]),
});

export const InProxyActivityDataByPeriodSchema = z.object({
    bytesUp: z.array(z.number()).length(288),
    bytesDown: z.array(z.number()).length(288),
    connectingClients: z.array(z.number()).length(288),
    connectedClients: z.array(z.number()).length(288),
});

export const InProxyActivityStatsSchema = z.object({
    elapsedTime: z.number(),
    totalBytesUp: z.number(),
    totalBytesDown: z.number(),
    currentConnectingClients: z.number(),
    currentConnectedClients: z.number(),
    dataByPeriod: z.object({
        "1000ms": InProxyActivityDataByPeriodSchema,
    }),
});

export const InProxyEventSchema = z.object({
    type: z.enum(["proxyState", "proxyError", "inProxyActivityStats"]),
    data: z.union([
        InProxyStateSchema,
        InProxyErrorSchema,
        InProxyActivityStatsSchema,
    ]),
});

// These are the user-configurable parameters for the inproxy.
export const InProxyParametersSchema = z.object({
    privateKey: Base64Unpadded64Bytes,
    maxClients: z.number().int().positive(),
    limitUpstreamBytesPerSecond: z.number().int().positive(),
    limitDownstreamBytesPerSecond: z.number().int().positive(),
});

export type InProxyParameters = z.infer<typeof InProxyParametersSchema>;
export type InProxyStatusEnum = z.infer<typeof InProxyStatusEnumSchema>;
export type InProxyState = z.infer<typeof InProxyStateSchema>;
export type InProxyError = z.infer<typeof InProxyErrorSchema>;
export type InProxyActivityStats = z.infer<typeof InProxyActivityStatsSchema>;
export type InProxyActivityByPeriod = z.infer<
    typeof InProxyActivityDataByPeriodSchema
>;
export type InProxyEvent = z.infer<typeof InProxyEventSchema>;
