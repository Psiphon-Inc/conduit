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

import { base64nopadToKeyPair } from "@/src/common/cryptography";
import {
    SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
    SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
} from "@/src/constants";
import {
    PersonalCompartmentId,
    PersonalCompartmentIdSchema,
} from "@/src/hosted/contracts";

export async function loadAndroidPersonalCompartmentId(): Promise<PersonalCompartmentId | null> {
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
        return null;
    }

    await persistAndroidPersonalCompartmentId(derivedPersonalCompartmentId);
    return derivedPersonalCompartmentId;
}

export async function persistAndroidPersonalCompartmentId(
    personalCompartmentId: PersonalCompartmentId,
): Promise<void> {
    await SecureStore.setItemAsync(
        SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
        personalCompartmentId,
    );
}

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
