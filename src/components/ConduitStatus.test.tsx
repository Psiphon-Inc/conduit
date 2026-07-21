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
import { Text } from "react-native";
import { act, create } from "react-test-renderer";

import {
    ConduitStatus,
    ConduitStatusProps,
} from "@/src/components/ConduitStatus";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const catalog = require("@/src/i18n/locales/en/translation.json");
            const entry = catalog[key.replace(/\.string$/, "")];
            const template: string = entry?.string ?? key;
            return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) =>
                options && name in options ? String(options[name]) : match,
            );
        },
    }),
}));

describe("ConduitStatus", () => {
    it("hides Personal Pairing when neither local nor hosted is active", () => {
        const labels = renderTextValues({
            showLocal: true,
            localIsOnline: false,
            showHosted: false,
            personalPairingConnected: 3,
        });

        expect(labels).not.toContain("Personal Pairing");
    });

    it("shows Personal Pairing when hosted is active and local is offline", () => {
        const labels = renderTextValues({
            showLocal: true,
            localIsOnline: false,
            showHosted: true,
            personalPairingConnected: 2,
        });

        expect(labels).toContain("Personal Pairing");
    });
});

function renderTextValues(props: Partial<ConduitStatusProps>): string[] {
    let renderer!: ReturnType<typeof create>;

    act(() => {
        renderer = create(<ConduitStatus {...defaultProps} {...props} />);
    });

    const values = renderer.root.findAllByType(Text).flatMap((node) => {
        const children = node.props.children;
        return Array.isArray(children) ? children : [children];
    });

    act(() => {
        renderer.unmount();
    });

    return values.filter((value): value is string => typeof value === "string");
}

const defaultProps: ConduitStatusProps = {
    alias: "Test Conduit",
    showLocal: true,
    localPublicConnected: 0,
    localMetricsPending: false,
    localIsOnline: true,
    showHosted: false,
    hostedMetricsPending: false,
    hostedPublicConnected: 0,
    personalPairingMetricsPending: false,
    personalPairingConnected: 0,
};
