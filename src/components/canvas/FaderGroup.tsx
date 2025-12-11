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
import { ColorMatrix, Group, Paint } from "@shopify/react-native-skia";
import { SharedValue, useDerivedValue } from "react-native-reanimated";

/*
 * FaderGroup wraps Canvas elements in a Group that will fade in or out
 * depending on the SharedValue passed in.
 */
export function FaderGroup({
    opacity,
    children,
}: {
    opacity: SharedValue<number>;
    children: React.JSX.Element;
}) {
    const opacityMatrix = useDerivedValue(() => {
        const a = opacity.value;
        // prettier-ignore
        return [
         // R, G, B, A, Bias
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, a, 0,
        ];
    });

    return (
        <Group
            layer={
                <Paint>
                    <ColorMatrix matrix={opacityMatrix} />
                </Paint>
            }
        >
            {children}
        </Group>
    );
}
