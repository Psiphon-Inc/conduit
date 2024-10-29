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

import { Skia, SkPath } from "@shopify/react-native-skia";

function normalize(value: number, max: number) {
    return value / max;
}

/**
 * Create a Skia path from a list of points, normalized so that the path fits
 * within the given height.
 */
export function pathFromPoints(
    points: number[],
    height: number,
    normalizeTo: number,
): SkPath {
    const max = Math.max(...points);
    // y max slightly less than total so we can see the bottom
    const yMax = height - 3;

    const path = Skia.Path.Make();
    if (points.length === 0) {
        return path;
    }

    path.moveTo(0, yMax);
    for (let i = 0; i < points.length; i++) {
        if (max === 0) {
            path.lineTo(i, yMax);
        } else {
            // skia 0 is the top of the canvas, so we need to invert y values
            path.lineTo(i, yMax - normalize(points[i], normalizeTo) * yMax);
        }
    }
    // go to bottom and back to the start so we can fill the path if we want to
    path.lineTo(points.length, height);
    path.lineTo(0, height);
    path.close();

    return path;
}
