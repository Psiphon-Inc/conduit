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
import { act, create } from "react-test-renderer";

import { QRDisplay } from "@/src/components/QRDisplay";

jest.mock("react-native-svg", () => {
    const React = require("react");
    const mock = (name: string) => {
        const Component = (props: Record<string, unknown>) =>
            React.createElement(name, props);
        Component.displayName = name;
        return Component;
    };
    return {
        __esModule: true,
        default: mock("Svg"),
        Rect: mock("Rect"),
    };
});

describe("QRDisplay", () => {
    let requestAnimationFrameMock: jest.SpyInstance;

    beforeEach(() => {
        requestAnimationFrameMock = jest
            .spyOn(global, "requestAnimationFrame")
            .mockImplementation(() => 17);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("renders static rounded modules without frame callbacks", () => {
        let renderer: ReturnType<typeof create>;

        act(() => {
            renderer = create(<QRDisplay data="test" />);
        });

        // The Skia predecessor pulsed corner radii from a rAF loop through
        // React state; the SVG treatment must stay fully static.
        expect(requestAnimationFrameMock).not.toHaveBeenCalled();

        const rects = renderer!.root.findAll(
            (node) => String(node.type) === "Rect",
        );
        // Background rect plus at least the finder-pattern modules.
        expect(rects.length).toBeGreaterThan(100);

        const moduleRects = rects.filter((rect) => rect.props.rx != null);
        // "test" fits QR version 1: 21x21 modules of size 200/21.
        const expectedRadius = (200 / 21) * 0.2;
        for (const rect of moduleRects) {
            expect(rect.props.rx).toBeCloseTo(expectedRadius);
        }
        expect(moduleRects.length).toBeGreaterThan(0);

        act(() => renderer!.unmount());
    });

    test("scales module size with the rendered size", () => {
        let renderer: ReturnType<typeof create>;

        act(() => {
            renderer = create(<QRDisplay data="test" size={420} />);
        });

        const moduleRects = renderer!.root.findAll(
            (node) => String(node.type) === "Rect" && node.props.rx != null,
        );
        expect(moduleRects[0].props.width).toBeCloseTo(420 / 21);

        act(() => renderer!.unmount());
    });
});
