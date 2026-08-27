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
import {
    connectionLightLfoAtElapsed,
    connectionLightSeed,
    createConnectionLightMotionPlan,
} from "@/src/components/canvas/connectionLightMotion";
import {
    ORB_VISUAL_SCENARIOS,
    findVisualScenario,
} from "@/src/components/orb-scene/visualScenarios";
import {
    assertVisualLfoReachable,
    connectionLightElapsedForLfo,
    visualTestLightElapsedMs,
} from "@/src/components/orb-scene/visualTestControl";

describe("visual scenario registry", () => {
    it("has unique, stable, filename-safe ids", () => {
        const ids = ORB_VISUAL_SCENARIOS.map((scenario) => scenario.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
            expect(id).toMatch(/^[a-z0-9-]+$/);
        }
    });

    it("keeps frozen progress within [0, 1]", () => {
        for (const scenario of ORB_VISUAL_SCENARIOS) {
            expect(scenario.progress).toBeGreaterThanOrEqual(0);
            expect(scenario.progress).toBeLessThanOrEqual(1);
        }
    });

    it("only references orbs that exist in the scenario layout", () => {
        for (const scenario of ORB_VISUAL_SCENARIOS) {
            if (scenario.kind !== "orb-scene") {
                continue;
            }
            const layoutOrbCount = scenario.evolutionLevel >= 2 ? 3 : 1;
            const orbCount = Math.min(
                layoutOrbCount,
                scenario.maxVisibleOrbs ?? 3,
            );
            for (const lane of scenario.activityLanes ?? []) {
                expect(lane.orbIndex).toBeGreaterThanOrEqual(0);
                expect(lane.orbIndex).toBeLessThan(orbCount);
                expect(lane.connectedCount).toBeGreaterThan(0);
            }
            for (const marker of scenario.provisioningMarkers ?? []) {
                expect(marker.orbIndex).toBeGreaterThanOrEqual(0);
                expect(marker.orbIndex).toBeLessThan(orbCount);
            }
            expect(scenario.orbModes.length).toBeLessThanOrEqual(orbCount);
            if (scenario.orbSlotMap) {
                const sortedSlots = [...scenario.orbSlotMap].sort();
                expect(sortedSlots).toEqual(
                    Array.from({ length: orbCount }, (_, index) => index),
                );
            }
            if (scenario.localOrbIndex != null && scenario.localOrbIndex >= 0) {
                expect(scenario.localOrbIndex).toBeLessThan(orbCount);
            }
        }
    });

    it("finds scenarios by id", () => {
        expect(findVisualScenario("single-active")?.kind).toBe("orb-scene");
        expect(findVisualScenario("missing")).toBeUndefined();
    });
});

describe("connection light LFO solving", () => {
    const targets = [-0.95, -0.72, -0.58, -0.3, -0.02, 0.4, 0.9];
    const laneKeys = ["local-0", "local-3", "hosted-a-1", "hosted-b-0"];

    it("round-trips elapsed time back to the requested LFO", () => {
        for (const key of laneKeys) {
            const plan = createConnectionLightMotionPlan(
                connectionLightSeed(key),
                100,
            );
            for (const target of targets) {
                const elapsed = connectionLightElapsedForLfo(plan, target);
                expect(elapsed).toBeGreaterThanOrEqual(0);
                const achieved = connectionLightLfoAtElapsed(plan, elapsed);
                expect(achieved).toBeCloseTo(target, 5);
            }
        }
    });

    it("keeps registry light targets reachable inside the scrub window", () => {
        for (const target of [-0.92, -0.72, -0.58, -0.02]) {
            const { progress, achievedLfo } = assertVisualLfoReachable(
                "local",
                0,
                target,
            );
            expect(progress).toBeGreaterThanOrEqual(0);
            expect(progress).toBeLessThanOrEqual(1);
            expect(
                connectionLightLfoAtElapsed(
                    createConnectionLightMotionPlan(
                        connectionLightSeed("local-0"),
                        100,
                    ),
                    visualTestLightElapsedMs(progress),
                ),
            ).toBeCloseTo(achievedLfo, 10);
            expect(achievedLfo).toBeCloseTo(target, 3);
        }
    });
});
