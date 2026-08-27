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
import { Redirect } from "expo-router";

import { VisualLabScreen } from "@/src/components/visual-lab/VisualLabScreen";

function isVisualLabEnabled(): boolean {
    if (__DEV__) {
        return true;
    }
    const value = process.env.EXPO_PUBLIC_VISUAL_LAB;
    return value === "true" || value === "1";
}

export default function OrbLabRoute() {
    if (!isVisualLabEnabled()) {
        return <Redirect href="/" />;
    }
    return <VisualLabScreen />;
}
