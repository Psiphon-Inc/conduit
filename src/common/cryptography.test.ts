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
import { sha256 } from "@noble/hashes/sha2";
import * as bip39 from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english";

import * as cryptography from "@/src/common/cryptography";
import { byteArraysAreEqual } from "@/src/common/utils";

describe("cryptography", () => {
    describe("generateEd25519KeyPair", () => {
        it("generates an Ed25519 key pair", () => {
            const keyPair = cryptography.generateEd25519KeyPair();
            expect(keyPair).not.toBeInstanceOf(Error);
        });

        it("generates a different key pair each time", () => {
            const keyPair1 = cryptography.generateEd25519KeyPair();
            const keyPair2 = cryptography.generateEd25519KeyPair();
            if (keyPair1 instanceof Error) {
                throw keyPair1;
            }
            if (keyPair2 instanceof Error) {
                throw keyPair2;
            }
            expect(
                byteArraysAreEqual(keyPair1.publicKey, keyPair2.publicKey),
            ).toBe(false);
        });
    });
    describe("keyPairToBase64nopad and base64nopadToKeyPair", () => {
        it("keyPairToBase64nopad produces a (padded) 86 character base64 string", () => {
            const keyPair = cryptography.generateEd25519KeyPair();
            if (keyPair instanceof Error) {
                throw keyPair;
            }
            const keyPairBase64String =
                cryptography.keyPairToBase64nopad(keyPair);
            if (keyPairBase64String instanceof Error) {
                throw keyPairBase64String;
            }
            expect(keyPairBase64String.length).toBe(86);
        });

        it("keyPairToBase64nopad and base64nopadToKeyPair are inverses", () => {
            const keyPairOriginal = cryptography.generateEd25519KeyPair();
            if (keyPairOriginal instanceof Error) {
                throw keyPairOriginal;
            }
            const keyPairBase64String =
                cryptography.keyPairToBase64nopad(keyPairOriginal);
            if (keyPairBase64String instanceof Error) {
                throw keyPairBase64String;
            }
            const keyPairRecovered =
                cryptography.base64nopadToKeyPair(keyPairBase64String);
            if (keyPairRecovered instanceof Error) {
                throw keyPairRecovered;
            }
            expect(
                byteArraysAreEqual(
                    keyPairOriginal.privateKey,
                    keyPairRecovered.privateKey,
                ),
            ).toBe(true);
            expect(
                byteArraysAreEqual(
                    keyPairOriginal.publicKey,
                    keyPairRecovered.publicKey,
                ),
            ).toBe(true);
        });
    });
    describe("derive Ed25519 key pair from mnemonic seed", () => {
        const mnemonic = bip39.generateMnemonic(englishWordlist);
        it("derives the same key pair from the same seed", () => {
            const derivedKeyPair1 = cryptography.deriveEd25519KeyPair(
                mnemonic,
                "m/0'",
            );
            const derivedKeyPair2 = cryptography.deriveEd25519KeyPair(
                mnemonic,
                "m/0'",
            );
            if (
                derivedKeyPair1 instanceof Error ||
                derivedKeyPair2 instanceof Error
            ) {
                throw derivedKeyPair1;
            }
            expect(
                byteArraysAreEqual(
                    derivedKeyPair1.privateKey,
                    derivedKeyPair2.privateKey,
                ),
            ).toBe(true);
            expect(
                byteArraysAreEqual(
                    derivedKeyPair1.publicKey,
                    derivedKeyPair2.publicKey,
                ),
            ).toBe(true);
        });
        it("derives different key pairs for different paths", () => {
            const derivedKeyPair1 = cryptography.deriveEd25519KeyPair(
                mnemonic,
                "m/0'",
            );
            const derivedKeyPair2 = cryptography.deriveEd25519KeyPair(
                mnemonic,
                "m/1'",
            );
            if (
                derivedKeyPair1 instanceof Error ||
                derivedKeyPair2 instanceof Error
            ) {
                throw derivedKeyPair1;
            }
            expect(
                byteArraysAreEqual(
                    derivedKeyPair1.privateKey,
                    derivedKeyPair2.privateKey,
                ),
            ).toBe(false);
            expect(
                byteArraysAreEqual(
                    derivedKeyPair1.publicKey,
                    derivedKeyPair2.publicKey,
                ),
            ).toBe(false);
        });

        it("derived key can sign verifiable messages", () => {
            const derivedConduitKey = cryptography.deriveEd25519KeyPair(
                mnemonic,
                "m/400'/20'/150'",
            );
            if (derivedConduitKey instanceof Error) {
                throw derivedConduitKey;
            }
            const message = sha256("Hello, World!");
            const signature = ed25519.sign(
                message,
                derivedConduitKey.privateKey,
            );
            const verified = ed25519.verify(
                signature,
                message,
                derivedConduitKey.publicKey,
            );
            expect(verified).toBe(true);
        });
    });
    describe("ed25519 Sign and Verify", () => {
        it("signs and verifies a UTF-8 encoded JSON message", () => {
            const keyPair = cryptography.generateEd25519KeyPair();
            if (keyPair instanceof Error) {
                throw keyPair;
            }
            const message = { hello: "world" };
            const messageBytes = new TextEncoder().encode(
                JSON.stringify(message),
            );
            const signature = cryptography.ed25519Sign(
                messageBytes,
                keyPair.privateKey,
            );
            if (signature instanceof Error) {
                throw signature;
            }
            const verified = cryptography.ed25519Verify(
                messageBytes,
                signature,
                keyPair.publicKey,
            );
            if (verified instanceof Error) {
                throw verified;
            }
            expect(verified).toBe(true);
        });
    });
});
