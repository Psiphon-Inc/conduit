import { ed25519 } from "@noble/curves/ed25519";
import { base64nopad } from "@scure/base";
import { mnemonicToSeedSync } from "@scure/bip39";
import slip10 from "micro-key-producer/src/slip10";
import { z } from "zod";

import { wrapError } from "@/src/common/errors";
import { Uint8Array32 } from "@/src/common/validators";

export const Ed25519KeyPairSchema = z.object({
    privateKey: Uint8Array32,
    publicKey: Uint8Array32,
});

export type Ed25519KeyPair = z.infer<typeof Ed25519KeyPairSchema>;

/**
 * This function is here for testing purposes, the keys the app uses are derived
 * from a mnemonic, not randomly generated.
 */
export function generateEd25519KeyPair(): Ed25519KeyPair | Error {
    try {
        const privateKey = ed25519.utils.randomPrivateKey();
        const publicKey = ed25519.getPublicKey(privateKey);
        return Ed25519KeyPairSchema.parse({ privateKey, publicKey });
    } catch (error: unknown) {
        return wrapError(error, "Error generating Ed25519 key pair");
    }
}

/**
 * Converts an Ed25519 key pair to a base64 string with the private key first
 * and the public key second, so that the string is compatible with go's Ed25519
 * private key format: https://pkg.go.dev/crypto/ed25519#pkg-overview
 */
export function keyPairToBase64nopad(keyPair: Ed25519KeyPair): string | Error {
    try {
        const keyPairUint8Array = new Uint8Array(64);
        keyPairUint8Array.set(keyPair.privateKey, 0);
        keyPairUint8Array.set(keyPair.publicKey, 32);
        return base64nopad.encode(keyPairUint8Array);
    } catch (error: unknown) {
        return wrapError(error, "Error converting Ed25519 key pair to base64");
    }
}

/**
 * Converts a base64 string to an Ed25519 key pair. The string should be in the
 * format generated by keyPairToBase64 (private key first, public key second).
 */
export function base64nopadToKeyPair(
    base64String: string,
): Ed25519KeyPair | Error {
    try {
        const keyPairUint8Array = base64nopad.decode(base64String);
        return Ed25519KeyPairSchema.parse({
            privateKey: keyPairUint8Array.slice(0, 32),
            publicKey: keyPairUint8Array.slice(32),
        });
    } catch (error: unknown) {
        return wrapError(error, "Error converting base64 to Ed25519 key pair");
    }
}

/**
 * Derives an Heirarchical Deterministic (HD) key pair from a BIP-39 mnemonic.
 * Uses ed25519-keygen, which has an implementation of SLIP-0010 for generating
 * Ed25519 keys from a root key. This is an Ed25519 variant of BIP-32, which is
 * already in use in this project for deriving the HDAccount from a mnemonic.
 * https://github.com/satoshilabs/slips/blob/master/slip-0010.md
 * https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki
 */
export function deriveEd25519KeyPair(
    mnemonic: string,
    path: string | undefined = undefined,
): Ed25519KeyPair | Error {
    try {
        const seed = mnemonicToSeedSync(mnemonic);
        const hdKey = slip10.fromMasterSeed(seed);
        if (!path) {
            // If no path is provided, return the root key pair
            return Ed25519KeyPairSchema.parse({
                privateKey: hdKey.privateKey,
                publicKey: hdKey.publicKeyRaw,
            });
        }
        const key = hdKey.derive(path);
        return Ed25519KeyPairSchema.parse({
            privateKey: key.privateKey,
            publicKey: key.publicKeyRaw,
        });
    } catch (error: unknown) {
        return wrapError(error, "Error deriving HD key pair");
    }
}

/**
 * Signs a message with an Ed25519 private key.
 */
export function ed25519Sign(
    message: Uint8Array,
    privateKey: Uint8Array,
): Uint8Array | Error {
    try {
        return ed25519.sign(message, privateKey);
    } catch (error: unknown) {
        return wrapError(error, "Error signing message with Ed25519 key");
    }
}

/**
 * Verifies a message signature was made with an Ed25519 public key.
 */
export function ed25519Verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
): boolean | Error {
    try {
        return ed25519.verify(signature, message, publicKey);
    } catch (error: unknown) {
        return wrapError(error, "Error verifying Ed25519 signature");
    }
}