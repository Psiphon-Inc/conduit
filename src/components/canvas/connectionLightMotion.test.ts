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
    CONNECTION_LIGHT_MOTION_BUFFER_STRIDE,
    connectionLightGradientRadii,
    connectionLightLfoAtElapsed,
    connectionLightMotionBufferOffset,
    connectionLightProxyEnvelope,
    connectionLightSeed,
    connectionLightTrajectoryAtLfo,
    createConnectionLightMotionPlan,
    evaluateConnectionLightMotionBuffer,
} from "@/src/components/canvas/connectionLightMotion";

describe("connection light motion", () => {
    const plan = createConnectionLightMotionPlan(
        connectionLightSeed("hosted-0"),
        100,
        1,
        0.4,
    );

    it("builds a stable seeded plan", () => {
        expect(connectionLightSeed("hosted-0")).toBe(3953101193);
        expect(plan.spawnX).toBeCloseTo(104.2876335876, 8);
        expect(plan.spawnY).toBeCloseTo(213.0152270911, 8);
        expect(plan.periodMs).toBeCloseTo(6106.3799478579, 8);
        expect(plan.initialPhase).toBeCloseTo(-0.1393919056, 8);
        expect(plan.firstSweepMs).toBeCloseTo(3478.7799426397, 8);
    });

    it("matches first-sweep and repeated LFO key points", () => {
        expect(connectionLightLfoAtElapsed(plan, 0)).toBe(plan.initialPhase);
        expect(connectionLightLfoAtElapsed(plan, plan.firstSweepMs / 4)).toBe(
            plan.initialPhase + (1 - plan.initialPhase) * 0.125,
        );
        expect(connectionLightLfoAtElapsed(plan, plan.firstSweepMs / 2)).toBe(
            (plan.initialPhase + 1) / 2,
        );
        expect(connectionLightLfoAtElapsed(plan, plan.firstSweepMs)).toBe(1);
        expect(
            connectionLightLfoAtElapsed(
                plan,
                plan.firstSweepMs + plan.periodMs / 2,
            ),
        ).toBe(0);
        expect(
            connectionLightLfoAtElapsed(
                plan,
                plan.firstSweepMs + plan.periodMs,
            ),
        ).toBe(-1);
        expect(
            connectionLightLfoAtElapsed(
                plan,
                plan.firstSweepMs + plan.periodMs * 2,
            ),
        ).toBe(1);
    });

    it("passes through every trajectory knot", () => {
        const spawn = { x: 30, y: 40 };
        const points = [
            spawn,
            { x: 6, y: 8 },
            { x: 0, y: 0 },
            { x: 0, y: -50 },
            { x: 0, y: -100 },
        ];
        [-1, -0.6, 0, 0.6, 1].forEach((lfo, index) => {
            expect(
                connectionLightTrajectoryAtLfo(
                    lfo,
                    spawn,
                    10,
                    points[2],
                    points[3],
                    points[4],
                ),
            ).toEqual(points[index]);
        });
    });

    it("keeps the proxy contribution local to the orb edge", () => {
        expect(connectionLightProxyEnvelope(0)).toBe(0);
        expect(connectionLightProxyEnvelope(0.25)).toBe(0);
        expect(connectionLightProxyEnvelope(-0.375)).toBe(0.5);
        expect(connectionLightProxyEnvelope(0.5)).toBe(1);
        expect(connectionLightProxyEnvelope(0.675)).toBeCloseTo(0.5);
        expect(connectionLightProxyEnvelope(0.85)).toBeCloseTo(0);
        expect(connectionLightProxyEnvelope(1)).toBe(0);
    });

    it("uses deterministic contiguous lfo, x, y motion slots", () => {
        const specs = [
            {
                motionPlan: plan,
                orbRadius: 100,
                midPoint: { x: 0, y: 0 },
                secondLastPoint: { x: 0, y: -50 },
                endPoint: { x: 0, y: -100 },
            },
            {
                motionPlan: createConnectionLightMotionPlan(123, 40, 0.8, 1),
                orbRadius: 40,
                midPoint: { x: 5, y: 6 },
                secondLastPoint: { x: 7, y: -20 },
                endPoint: { x: 9, y: -40 },
            },
        ];
        const elapsedMs = 1234;
        const buffer = evaluateConnectionLightMotionBuffer(specs, elapsedMs);

        expect(buffer).toHaveLength(
            specs.length * CONNECTION_LIGHT_MOTION_BUFFER_STRIDE,
        );
        specs.forEach((spec, index) => {
            const lfo = connectionLightLfoAtElapsed(spec.motionPlan, elapsedMs);
            const trajectory = connectionLightTrajectoryAtLfo(
                lfo,
                {
                    x: spec.motionPlan.spawnX,
                    y: spec.motionPlan.spawnY,
                },
                spec.orbRadius,
                spec.midPoint,
                spec.secondLastPoint,
                spec.endPoint,
            );
            const offset = connectionLightMotionBufferOffset(index);
            expect(buffer[offset]).toBe(lfo);
            expect(buffer[offset + 1]).toBe(trajectory.x);
            expect(buffer[offset + 2]).toBe(trajectory.y);
        });
        expect(evaluateConnectionLightMotionBuffer(specs, elapsedMs)).toEqual(
            buffer,
        );
    });

    it("rebuilds empty and dynamic motion layouts from index zero", () => {
        const spec = {
            motionPlan: createConnectionLightMotionPlan(456, 60),
            orbRadius: 60,
            midPoint: { x: 0, y: 0 },
            secondLastPoint: { x: 0, y: -30 },
            endPoint: { x: 0, y: -60 },
        };

        expect(evaluateConnectionLightMotionBuffer([], 500)).toEqual([]);
        expect(connectionLightMotionBufferOffset(0)).toBe(0);
        expect(connectionLightMotionBufferOffset(2)).toBe(6);
        expect(evaluateConnectionLightMotionBuffer([spec], 500)).toHaveLength(
            CONNECTION_LIGHT_MOTION_BUFFER_STRIDE,
        );
        expect(
            evaluateConnectionLightMotionBuffer([spec, spec], 500).slice(
                connectionLightMotionBufferOffset(1),
            ),
        ).toEqual(evaluateConnectionLightMotionBuffer([spec], 500));
    });

    it("preserves the visible core and adds three blur sigmas", () => {
        const radii = connectionLightGradientRadii(100);

        expect(radii.coreRadius).toBe(10);
        expect(radii.outerRadius).toBe(16);
        expect(radii.outerRadius - radii.coreRadius).toBe(6);
        expect(radii.corePosition).toBe(10 / 16);
    });
});
