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
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { isE2E } from "@/src/common/e2e";
import { ASYNCSTORAGE_SOUND_ENABLED_KEY } from "@/src/constants";
import {
    hydrateSoundPreference,
    playSound,
    resetSoundStateForTesting,
    setSoundEnabled,
} from "@/src/sound";
import { playEffect } from "@/src/sound/player";
import {
    detectHostedPhaseSoundEffect,
    isFirstConnectTransition,
} from "@/src/sound/transitions";

jest.mock("@/src/sound/player", () => ({
    playEffect: jest.fn(),
}));

jest.mock("@/src/common/e2e", () => ({
    isE2E: jest.fn(() => false),
    isE2EMockProxy: jest.fn(() => false),
}));

const mockedPlayEffect = playEffect as jest.MockedFunction<typeof playEffect>;
const mockedIsE2E = isE2E as jest.MockedFunction<typeof isE2E>;

let nowMs = 1_000_000;
let dateNowSpy: jest.SpyInstance<number, []>;

beforeEach(async () => {
    jest.clearAllMocks();
    resetSoundStateForTesting();
    mockedIsE2E.mockReturnValue(false);
    await AsyncStorage.clear();
    nowMs = 1_000_000;
    dateNowSpy = jest.spyOn(Date, "now").mockImplementation(() => nowMs);
});

afterEach(() => {
    dateNowSpy.mockRestore();
});

describe("playSound", () => {
    it("plays sound by default (sound enabled defaults to true)", () => {
        playSound("successConfirm");
        expect(mockedPlayEffect).toHaveBeenCalledTimes(1);
        expect(mockedPlayEffect).toHaveBeenCalledWith("successConfirm");
    });

    it("fires the per-effect default haptic", () => {
        playSound("stationGoingLive");
        expect(Haptics.impactAsync).toHaveBeenCalledWith(
            Haptics.ImpactFeedbackStyle.Heavy,
        );

        nowMs += 1_000;
        playSound("warningAlert");
        expect(Haptics.notificationAsync).toHaveBeenCalledWith(
            Haptics.NotificationFeedbackType.Error,
        );

        nowMs += 1_000;
        playSound("copyToClipboard");
        expect(Haptics.impactAsync).toHaveBeenCalledWith(
            Haptics.ImpactFeedbackStyle.Light,
        );
    });

    it("skips the haptic when options.haptic === false but still plays sound", () => {
        playSound("successConfirm", { haptic: false });
        expect(Haptics.notificationAsync).not.toHaveBeenCalled();
        expect(Haptics.impactAsync).not.toHaveBeenCalled();
        expect(mockedPlayEffect).toHaveBeenCalledTimes(1);
    });

    it("does not play sound when disabled, but the haptic still fires", async () => {
        await setSoundEnabled(false);
        playSound("successConfirm");
        expect(mockedPlayEffect).not.toHaveBeenCalled();
        expect(Haptics.notificationAsync).toHaveBeenCalledWith(
            Haptics.NotificationFeedbackType.Success,
        );
    });

    it("is a full no-op under E2E (no sound, no haptic)", () => {
        mockedIsE2E.mockReturnValue(true);
        playSound("successConfirm");
        expect(mockedPlayEffect).not.toHaveBeenCalled();
        expect(Haptics.notificationAsync).not.toHaveBeenCalled();
        expect(Haptics.impactAsync).not.toHaveBeenCalled();
    });

    it("debounces repeated plays of the same effect within 300ms", () => {
        playSound("copyToClipboard");
        nowMs += 200;
        playSound("copyToClipboard");
        expect(mockedPlayEffect).toHaveBeenCalledTimes(1);

        nowMs += 200; // 400ms after the first play
        playSound("copyToClipboard");
        expect(mockedPlayEffect).toHaveBeenCalledTimes(2);
    });

    it("does not debounce across different effects", () => {
        playSound("copyToClipboard");
        nowMs += 100;
        playSound("successConfirm");
        expect(mockedPlayEffect).toHaveBeenCalledTimes(2);
    });

    it("suppresses stationGoingOffline within 2000ms of warningAlert", () => {
        playSound("warningAlert");
        expect(mockedPlayEffect).toHaveBeenCalledTimes(1);

        nowMs += 1_000;
        playSound("stationGoingOffline");
        expect(mockedPlayEffect).toHaveBeenCalledTimes(1);

        nowMs += 1_500; // 2500ms after warningAlert
        playSound("stationGoingOffline");
        expect(mockedPlayEffect).toHaveBeenCalledTimes(2);
        expect(mockedPlayEffect).toHaveBeenLastCalledWith(
            "stationGoingOffline",
        );
    });

    it("plays stationGoingOffline normally when no recent warningAlert", () => {
        playSound("stationGoingOffline");
        expect(mockedPlayEffect).toHaveBeenCalledTimes(1);
    });
});

describe("sound preference persistence", () => {
    it("persists via setSoundEnabled and hydrates on a fresh session", async () => {
        await setSoundEnabled(false);
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
            ASYNCSTORAGE_SOUND_ENABLED_KEY,
            "false",
        );

        // Simulate a fresh app session: in-memory cache resets to the
        // default (true), then hydration restores the persisted value.
        resetSoundStateForTesting();
        await hydrateSoundPreference();
        playSound("successConfirm");
        expect(mockedPlayEffect).not.toHaveBeenCalled();

        await setSoundEnabled(true);
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
            ASYNCSTORAGE_SOUND_ENABLED_KEY,
            "true",
        );
        nowMs += 1_000;
        playSound("successConfirm");
        expect(mockedPlayEffect).toHaveBeenCalledTimes(1);
    });

    it("keeps the default (enabled) when nothing is stored", async () => {
        await hydrateSoundPreference();
        playSound("successConfirm");
        expect(mockedPlayEffect).toHaveBeenCalledTimes(1);
    });
});

describe("transition detectors", () => {
    it("detects hosted activation transitions within the session only", () => {
        // Initial load: no previous phase observed, never plays.
        expect(detectHostedPhaseSoundEffect(null, "active")).toBeNull();
        expect(detectHostedPhaseSoundEffect(null, "suspended")).toBeNull();

        expect(detectHostedPhaseSoundEffect("provisioning", "active")).toBe(
            "stationGoingLive",
        );
        expect(detectHostedPhaseSoundEffect("none", "active")).toBe(
            "stationGoingLive",
        );
        expect(detectHostedPhaseSoundEffect("active", "suspended")).toBe(
            "warningAlert",
        );

        // Non-triggering transitions.
        expect(detectHostedPhaseSoundEffect("active", "active")).toBeNull();
        expect(detectHostedPhaseSoundEffect("suspended", "active")).toBeNull();
        expect(detectHostedPhaseSoundEffect("active", "none")).toBeNull();
        expect(
            detectHostedPhaseSoundEffect("provisioning", "suspended"),
        ).toBeNull();
        expect(detectHostedPhaseSoundEffect("none", "provisioning")).toBeNull();
    });

    it("detects first-connect 0 -> >0 transitions", () => {
        expect(isFirstConnectTransition(0, 1)).toBe(true);
        expect(isFirstConnectTransition(0, 3)).toBe(true);
        // No previously observed count: a nonzero initial reading is not a
        // transition.
        expect(isFirstConnectTransition(null, 2)).toBe(false);
        expect(isFirstConnectTransition(0, 0)).toBe(false);
        expect(isFirstConnectTransition(1, 2)).toBe(false);
        expect(isFirstConnectTransition(2, 0)).toBe(false);
    });
});
