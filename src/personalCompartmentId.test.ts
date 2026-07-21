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
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
    SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
    SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
} from "@/src/constants";
import {
    loadAndroidPersonalCompartmentId,
    parsePersonalCompartmentId,
} from "@/src/personalCompartmentId";

describe("personalCompartmentId", () => {
    const originalPlatform = Platform.OS;

    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error - Mock method for testing, see jestSetup.js
        SecureStore.__resetStore();
        Object.defineProperty(Platform, "OS", {
            configurable: true,
            value: "android",
        });
    });

    afterAll(() => {
        Object.defineProperty(Platform, "OS", {
            configurable: true,
            value: originalPlatform,
        });
    });

    it("derives and stores a personal compartment id on fresh Android state", async () => {
        const personalCompartmentId = await loadAndroidPersonalCompartmentId();

        expect(personalCompartmentId).not.toBeNull();
        expect(parsePersonalCompartmentId(personalCompartmentId)).toBe(
            personalCompartmentId,
        );
        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
            SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
            expect.any(String),
        );
        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
            SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
            personalCompartmentId,
        );
    });
});
