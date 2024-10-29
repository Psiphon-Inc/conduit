/*
 * Copyright (c) 2024, Psiphon Inc.
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

import { Group } from "@shopify/react-native-skia";
import { SharedValue } from "react-native-reanimated";

import { Chains } from "@/src/components/canvas/Chains";
import { FlexibleOrb } from "@/src/components/canvas/FlexibleOrb";
import { Phone } from "@/src/components/canvas/Phone";

interface OnboardingSceneProps {
    currentView: SharedValue<number>;
    sceneWidth: number;
    sceneHeight: number;
}
export function OnboardingScene({
    currentView,
    sceneWidth,
    sceneHeight,
}: OnboardingSceneProps) {
    const commonProps = { currentView, sceneWidth, sceneHeight };
    return (
        <Group>
            <FlexibleOrb {...commonProps} />
            <Group
                transform={[{ translateY: sceneHeight / 2 }, { rotate: 0.03 }]}
            >
                <Chains {...commonProps} size={sceneWidth / 3} />
            </Group>
            <Phone {...commonProps} />
        </Group>
    );
}
