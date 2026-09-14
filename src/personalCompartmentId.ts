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
import { base64nopad } from "@scure/base";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { createOrLoadAccount } from "@/src/auth/account";
import { base64nopadToKeyPair } from "@/src/common/cryptography";
import {
    SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
    SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
} from "@/src/constants";
import {
    PersonalCompartmentId,
    PersonalCompartmentIdSchema,
    PersonalCompartmentReconciliationResult,
} from "@/src/pairing/compartmentId";

// SecureStore cannot cancel an in-flight write. Serialize initialization and
// reconciliation so an obsolete write can be restored before the next reader/writer.
let identityOperations: Promise<unknown> = Promise.resolve();
type IdentityRestore =
    | { status: "none" }
    | { status: "remove" }
    | { status: "replace"; value: string };

let pendingIdentityRestore: IdentityRestore = { status: "none" };

async function restoreObsoleteIdentityWrite(): Promise<void> {
    if (pendingIdentityRestore.status === "none") return;
    if (pendingIdentityRestore.status === "remove") {
        await SecureStore.deleteItemAsync(
            SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
        );
    } else {
        await writeAndroidPersonalCompartmentId(pendingIdentityRestore.value);
    }
    pendingIdentityRestore = { status: "none" };
}

function serializeIdentityOperation<T>(
    operation: () => Promise<T>,
): Promise<T> {
    const result = identityOperations.then(async () => {
        // A failed compensation must not expose obsolete data to later readers.
        await restoreObsoleteIdentityWrite();
        return operation();
    });
    identityOperations = result.catch(() => {});
    return result;
}

/** Loads or initializes desired Android identity, serialized with hosted reconciliation. */
export function loadAndroidPersonalCompartmentId(): Promise<PersonalCompartmentId | null> {
    return serializeIdentityOperation(
        loadAndroidPersonalCompartmentIdUnserialized,
    );
}

async function loadAndroidPersonalCompartmentIdUnserialized(): Promise<PersonalCompartmentId | null> {
    if (Platform.OS !== "android") {
        return null;
    }

    const storedPersonalCompartmentId = parsePersonalCompartmentId(
        await SecureStore.getItemAsync(
            SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
        ),
    );
    if (storedPersonalCompartmentId) {
        return storedPersonalCompartmentId;
    }

    const derivedPersonalCompartmentId = await derivePersonalCompartmentId();
    if (!derivedPersonalCompartmentId) {
        const accountPersonalCompartmentId =
            await derivePersonalCompartmentIdFromAccount();
        if (!accountPersonalCompartmentId) {
            return null;
        }

        await writeAndroidPersonalCompartmentId(accountPersonalCompartmentId);
        return accountPersonalCompartmentId;
    }

    await writeAndroidPersonalCompartmentId(derivedPersonalCompartmentId);
    return derivedPersonalCompartmentId;
}

/** Commits only for a current session; restores an already-started write if superseded. */
export function reconcileAndroidPersonalCompartmentId(
    personalCompartmentId: PersonalCompartmentId,
    isCurrent: () => boolean,
): Promise<PersonalCompartmentReconciliationResult> {
    return serializeIdentityOperation<PersonalCompartmentReconciliationResult>(
        async () => {
            if (!isCurrent()) return "stale";
            const previous = await SecureStore.getItemAsync(
                SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
            );
            if (!isCurrent()) return "stale";
            try {
                await writeAndroidPersonalCompartmentId(personalCompartmentId);
            } finally {
                if (!isCurrent()) {
                    pendingIdentityRestore =
                        previous === null
                            ? { status: "remove" }
                            : { status: "replace", value: previous };
                    await restoreObsoleteIdentityWrite();
                }
            }
            return isCurrent() ? "committed" : "stale";
        },
    ).catch(() => "unavailable");
}

async function writeAndroidPersonalCompartmentId(
    personalCompartmentId: PersonalCompartmentId,
): Promise<void> {
    await SecureStore.setItemAsync(
        SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
        personalCompartmentId,
    );
}

/** Trims and validates a compartment ID; missing or invalid values resolve to null. */
export function parsePersonalCompartmentId(
    value: string | null,
): PersonalCompartmentId | null {
    if (!value) {
        return null;
    }

    const parsed = PersonalCompartmentIdSchema.safeParse(value.trim());
    if (!parsed.success) {
        return null;
    }

    return parsed.data;
}

async function derivePersonalCompartmentId(): Promise<PersonalCompartmentId | null> {
    const storedInproxyKeyPair = await SecureStore.getItemAsync(
        SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
    );
    if (!storedInproxyKeyPair) {
        return null;
    }

    const inproxyKeyPair = base64nopadToKeyPair(storedInproxyKeyPair);
    if (inproxyKeyPair instanceof Error) {
        return null;
    }

    return parsePersonalCompartmentId(
        base64nopad.encode(inproxyKeyPair.publicKey),
    );
}

async function derivePersonalCompartmentIdFromAccount(): Promise<PersonalCompartmentId | null> {
    const account = await createOrLoadAccount();
    if (account instanceof Error) {
        return null;
    }

    return parsePersonalCompartmentId(
        base64nopad.encode(account.inproxyKey.publicKey),
    );
}
