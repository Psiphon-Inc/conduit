import { edwardsToMontgomeryPub } from "@noble/curves/ed25519";
import { base64nopad } from "@scure/base";
import { z } from "zod";

import { Ed25519KeyPair } from "@/src/common/cryptography";
import { Base64Unpadded64Bytes } from "@/src/common/validators";

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

// These are the user-configurable parameters for the inproxy.
export const InProxyParametersSchema = z.object({
    privateKey: Base64Unpadded64Bytes,
    maxClients: z.number().int().positive(),
    limitUpstreamBytesPerSecond: z.number().int().positive(),
    limitDownstreamBytesPerSecond: z.number().int().positive(),
    // personalCompartmentIds: z.array(z.string()), // eventually...
});

export type InProxyParameters = z.infer<typeof InProxyParametersSchema>;
export type InProxyActivityStats = z.infer<typeof InProxyActivityStatsSchema>;
export type InProxyActivityByPeriod = z.infer<
    typeof InProxyActivityDataByPeriodSchema
>;

/** This is used to derive the conduit key pair from the mnemonic. The chosen
 *  path is not that important, but each device should have it's own unique
 *  conduit key pair, so we use the device nonce as the last index. The root
 *  of the path is chosen to not conflict with any standard BIP44 paths.
 *  The maximum value of the device nonce is 2^31, as we use the ' notation
 *  for accessing the "hardened keys" in the BIP32 key tree. This maximum is
 *  enforced at runtime by zod.
 */
export function formatConduitBip32Path(deviceNonce: number): string {
    z.number().min(0).max(0x80000000).parse(deviceNonce);

    return `m/400'/20'/${deviceNonce}'`;
}

/**
 * Get the base64 nopad encoding of the X25519 public key representation of the
 * Ed25519 InProxy key pair, recorded as proxy_id by psiphond.
 */
export function getProxyId(conduitKeyPair: Ed25519KeyPair): string {
    return base64nopad.encode(edwardsToMontgomeryPub(conduitKeyPair.publicKey));
}

/**
 *
 * Utility method for converting a base64nopad encoded Ed25519 public key to a
 * base64nopad X25519 public key.
 */
export function ed25519StringToX25519String(ed25519String: string): string {
    return base64nopad.encode(
        edwardsToMontgomeryPub(base64nopad.decode(ed25519String)),
    );
}
