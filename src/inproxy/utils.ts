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
import { ed25519 } from "@noble/curves/ed25519";
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
    InproxyActivityStats,
    InproxyActivityStatsSchema,
    InproxyParameters,
    InproxyParametersSchema,
} from "@/src/inproxy/types";

export function getDefaultInproxyParameters(): InproxyParameters {
    const ephemeralKey = {
        privateKey: new Uint8Array(32),
        publicKey: new Uint8Array(32),
    };

    return InproxyParametersSchema.parse({
        privateKey: keyPairToBase64nopad(ephemeralKey),
        maxClients: DEFAULT_INPROXY_MAX_CLIENTS,
        limitUpstreamBytesPerSecond: DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
        limitDownstreamBytesPerSecond: DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
    });
}

export function getZeroedInproxyActivityStats(): InproxyActivityStats {
    return InproxyActivityStatsSchema.parse({
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
                numBuckets: 288,
            },
        },
    });
}

/**
 * This is used to derive the conduit key pair from the mnemonic. The chosen
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
 * Ed25519 Inproxy key pair, recorded as proxy_id by psiphond.
 */
export function getProxyId(conduitKeyPair: Ed25519KeyPair): string {
    if (!conduitKeyPair.publicKey) {
        return "Loading...";
    }
    return base64nopad.encode(
        ed25519.utils.toMontgomery(conduitKeyPair.publicKey),
    );
}
