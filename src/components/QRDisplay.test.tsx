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
import React from "react";
import { act, create } from "react-test-renderer";

import { isE2E } from "@/src/common/e2e";
import { QRDisplay } from "@/src/components/QRDisplay";
import { useReducedMotionPreference } from "@/src/hooks";

jest.mock("@shopify/react-native-skia", () => ({
    Canvas: "Canvas",
    Rect: "Rect",
    RoundedRect: "RoundedRect",
}));
jest.mock("@/src/common/e2e", () => ({ isE2E: jest.fn() }));
jest.mock("@/src/hooks", () => ({
    useReducedMotionPreference: jest.fn(),
}));

describe("QRDisplay motion", () => {
    let reducedMotion = false;
    let e2e = false;
    let requestAnimationFrameMock: jest.SpyInstance;
    let cancelAnimationFrameMock: jest.SpyInstance;

    beforeEach(() => {
        reducedMotion = false;
        e2e = false;
        (useReducedMotionPreference as jest.Mock).mockImplementation(
            () => reducedMotion,
        );
        (isE2E as jest.Mock).mockImplementation(() => e2e);
        requestAnimationFrameMock = jest
            .spyOn(global, "requestAnimationFrame")
            .mockImplementation(() => 17);
        cancelAnimationFrameMock = jest.spyOn(global, "cancelAnimationFrame");
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test.each([
        { reduced: true, e2eBuild: false },
        { reduced: false, e2eBuild: true },
    ])(
        "uses a stable radius when reduced=$reduced and e2e=$e2eBuild",
        ({ reduced, e2eBuild }) => {
            reducedMotion = reduced;
            e2e = e2eBuild;
            let renderer: ReturnType<typeof create>;

            act(() => {
                renderer = create(<QRDisplay data="test" />);
            });

            expect(requestAnimationFrameMock).not.toHaveBeenCalled();
            expect(
                renderer!.root.findAll(
                    (node) => String(node.type) === "RoundedRect",
                )[0].props.r,
            ).toBeCloseTo((200 / 21) * 0.2);
            act(() => renderer!.unmount());
        },
    );

    test("starts and stops RAF when the preference changes", () => {
        let renderer: ReturnType<typeof create>;
        act(() => {
            renderer = create(<QRDisplay data="test" />);
        });
        expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

        reducedMotion = true;
        act(() => renderer!.update(<QRDisplay data="test" />));
        expect(cancelAnimationFrameMock).toHaveBeenCalledWith(17);
        expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

        reducedMotion = false;
        act(() => renderer!.update(<QRDisplay data="test" />));
        expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2);

        act(() => renderer!.unmount());
    });
});
