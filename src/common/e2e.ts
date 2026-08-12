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
export function isE2E(): boolean {
    const value = process.env.EXPO_PUBLIC_E2E;
    return value === "true" || value === "1";
}

export function isPerf(): boolean {
    return process.env.EXPO_PUBLIC_PERF === "1";
}

export function isE2EMockProxy(): boolean {
    const value = process.env.EXPO_PUBLIC_E2E_MOCK_PROXY;
    return value === "true" || value === "1";
}
