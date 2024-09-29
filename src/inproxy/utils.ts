import { edwardsToMontgomeryPub } from "@noble/curves/ed25519";
import { base64nopad } from "@scure/base";
import { z } from "zod";

import {
    Ed25519KeyPair,
    keyPairToBase64nopad,
} from "@/src/common/cryptography";
import {
    DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
    DEFAULT_INPROXY_MAX_CLIENTS,
} from "@/src/constants";
import {
    InProxyActivityStats,
    InProxyActivityStatsSchema,
    InProxyParameters,
    InProxyParametersSchema,
} from "@/src/inproxy/types";

export function getDefaultInProxyParameters(): InProxyParameters {
    const ephemeralKey = {
        privateKey: new Uint8Array(32),
        publicKey: new Uint8Array(32),
    };

    return InProxyParametersSchema.parse({
        privateKey: keyPairToBase64nopad(ephemeralKey),
        maxClients: DEFAULT_INPROXY_MAX_CLIENTS,
        limitUpstreamBytesPerSecond: DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
        limitDownstreamBytesPerSecond: DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
    });
}

export function getZeroedInProxyActivityStats(): InProxyActivityStats {
    return InProxyActivityStatsSchema.parse({
        elapsedTime: 0,
        totalBytesUp: 0,
        totalBytesDown: 0,
        currentConnectingClients: 0,
        currentConnectedClients: 0,
        dataByPeriod: {
            "1000ms": {
                bytesUp: new Array(288).fill(0),
                bytesDown: new Array(288).fill(0),
                connectedClients: new Array(288).fill(0),
                connectingClients: new Array(288).fill(0),
            },
        },
    });
}

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
