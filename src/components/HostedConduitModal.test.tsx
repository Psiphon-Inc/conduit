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
 */
import React from "react";
import { act, create } from "react-test-renderer";

import { HostedConduitModal } from "@/src/components/HostedConduitModal";
import { ConduitView } from "@/src/hosted/contracts";

const mockOpenPersonalPairingModal = jest.fn();

jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("@/src/components/ConduitActionsContext", () => ({
    useConduitActions: () => ({
        openPersonalPairingModal: mockOpenPersonalPairingModal,
        openRyveClaimModal: jest.fn(),
    }),
}));

jest.mock("@/src/hooks", () => ({
    useConduitName: () => ({ data: "Test Conduit" }),
}));

jest.mock("@/src/components/Icon", () => ({ Icon: () => null }));
jest.mock("@/src/components/Identicon", () => ({ Identicon: () => null }));

describe("HostedConduitModal", () => {
    beforeEach(() => {
        mockOpenPersonalPairingModal.mockClear();
    });

    it("offers personal pairing from a hosted personal conduit", () => {
        const onClose = jest.fn();
        let renderer!: ReturnType<typeof create>;

        act(() => {
            renderer = create(
                <HostedConduitModal
                    conduit={makeConduit("personal")}
                    connectedCount={2}
                    bytesTransferred={1024}
                    onClose={onClose}
                />,
            );
        });

        act(() => {
            renderer.root
                .findByProps({ testID: "hosted-modal-share" })
                .props.onPress();
        });

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(mockOpenPersonalPairingModal).toHaveBeenCalledTimes(1);

        act(() => renderer.unmount());
    });

    it("does not offer personal pairing from a hosted public conduit", () => {
        let renderer!: ReturnType<typeof create>;

        act(() => {
            renderer = create(
                <HostedConduitModal
                    conduit={makeConduit("public")}
                    connectedCount={2}
                    bytesTransferred={1024}
                    onClose={jest.fn()}
                />,
            );
        });

        expect(
            renderer.root.findAllByProps({ testID: "hosted-modal-share" }),
        ).toHaveLength(0);

        act(() => renderer.unmount());
    });
});

function makeConduit(
    trafficScope: NonNullable<ConduitView["traffic_scope"]>,
): ConduitView {
    return {
        conduit_id: `test-${trafficScope}`,
        proxy_id: `proxy-${trafficScope}`,
        status: "active",
        traffic_scope: trafficScope,
    };
}
