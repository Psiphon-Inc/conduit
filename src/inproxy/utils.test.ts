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
    DEFAULT_INPROXY_MAX_PERSONAL_CLIENTS,
    INPROXY_MAX_CLIENTS_MAX,
    INPROXY_MAX_CLIENTS_TOTAL_MAX,
    INPROXY_MIN_PERSONAL_CLIENTS,
} from "@/src/constants";
import { resolveMaxPersonalClients } from "@/src/inproxy/utils";

describe("resolveMaxPersonalClients", () => {
    it("uses the default when nothing is stored", () => {
        expect(resolveMaxPersonalClients(null, 2)).toBe(
            DEFAULT_INPROXY_MAX_PERSONAL_CLIENTS,
        );
    });

    it("keeps a stored value within range", () => {
        expect(resolveMaxPersonalClients("3", 2)).toBe(3);
    });

    it("raises a persisted zero to the minimum", () => {
        expect(resolveMaxPersonalClients("0", 2)).toBe(
            INPROXY_MIN_PERSONAL_CLIENTS,
        );
    });

    it("falls back to the default for unparseable storage", () => {
        expect(resolveMaxPersonalClients("banana", 2)).toBe(
            DEFAULT_INPROXY_MAX_PERSONAL_CLIENTS,
        );
    });

    it("caps at the per-type maximum", () => {
        expect(resolveMaxPersonalClients("99", 2)).toBe(
            INPROXY_MAX_CLIENTS_MAX,
        );
    });

    it("leaves room under the combined total when public peers are maxed", () => {
        const result = resolveMaxPersonalClients("25", INPROXY_MAX_CLIENTS_MAX);
        expect(result).toBe(
            INPROXY_MAX_CLIENTS_TOTAL_MAX - INPROXY_MAX_CLIENTS_MAX,
        );
        expect(result).toBeGreaterThanOrEqual(INPROXY_MIN_PERSONAL_CLIENTS);
    });
});
