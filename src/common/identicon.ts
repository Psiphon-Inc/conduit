import { sha1 } from "@noble/hashes/sha1";

import { SvgRenderer, SvgWriter, Transform } from "@/src/common/svgutils";
import {
    correctedHsl,
    hexToHueDegrees,
    hueFunction,
    lightness,
    parseHex,
    uint8ArrayToHex,
} from "@/src/common/utils";
import { palette } from "@/src/styles";

const hues = [
    hexToHueDegrees(palette.red),
    hexToHueDegrees(palette.blue),
    hexToHueDegrees(palette.purple),
    hexToHueDegrees(palette.redShade1),
    hexToHueDegrees(palette.blueShade1),
    hexToHueDegrees(palette.purpleShade1),
    hexToHueDegrees(palette.redShade2),
    hexToHueDegrees(palette.blueShade2),
    hexToHueDegrees(palette.purpleShade2),
];

class Config {
    hue = hueFunction;
    colorSaturation = 0.5;
    grayscaleSaturation = 0.5;
    backColor = "#00000000";
    iconPadding = 0.08;
    colorLightness: (n: number) => number = lightness([0.4, 0.8]);
    grayscaleLightness: (n: number) => number = lightness([0.15, 0.9]);
}

export function identicon(value: string, size: number) {
    const writer = new SvgWriter(size);
    const hashed = uint8ArrayToHex(sha1(value));
    iconGenerator(new SvgRenderer(writer), hashed);
    return writer.toString();
}

function centerShape(
    index: number,
    g: Graphics,
    cell: number,
    positionIndex: number,
) {
    index = index % 14;

    let k, m, w, h, inner, outer;

    !index
        ? ((k = cell * 0.42),
          g.addPolygon([
              0,
              0,
              cell,
              0,
              cell,
              cell - k * 2,
              cell - k,
              cell,
              0,
              cell,
          ]))
        : index == 1
          ? ((w = 0 | (cell * 0.5)),
            (h = 0 | (cell * 0.8)),
            g.addTriangle(cell - w, 0, w, h, 2))
          : index == 2
            ? ((w = 0 | (cell / 3)), g.addRectangle(w, w, cell - w, cell - w))
            : index == 3
              ? ((inner = cell * 0.1),
                // Use fixed outer border widths in small icons to ensure the border is drawn
                (outer = cell < 6 ? 1 : cell < 8 ? 2 : 0 | (cell * 0.25)),
                (inner =
                    inner > 1
                        ? 0 | inner // large icon => truncate decimals
                        : inner > 0.5
                          ? 1 // medium size icon => fixed width
                          : inner), // small icon => anti-aliased border
                g.addRectangle(
                    outer,
                    outer,
                    cell - inner - outer,
                    cell - inner - outer,
                ))
              : index == 4
                ? ((m = 0 | (cell * 0.15)),
                  (w = 0 | (cell * 0.5)),
                  g.addCircle(cell - w - m, cell - w - m, w))
                : index == 5
                  ? ((inner = cell * 0.1),
                    (outer = inner * 4),
                    // Align edge to nearest pixel in large icons
                    outer > 3 && (outer = 0 | outer),
                    g.addRectangle(0, 0, cell, cell),
                    g.addPolygon(
                        [
                            outer,
                            outer,
                            cell - inner,
                            outer,
                            outer + (cell - outer - inner) / 2,
                            cell - inner,
                        ],
                        true,
                    ))
                  : index == 6
                    ? g.addPolygon([
                          0,
                          0,
                          cell,
                          0,
                          cell,
                          cell * 0.7,
                          cell * 0.4,
                          cell * 0.4,
                          cell * 0.7,
                          cell,
                          0,
                          cell,
                      ])
                    : index == 7
                      ? g.addTriangle(cell / 2, cell / 2, cell / 2, cell / 2, 3)
                      : index == 8
                        ? (g.addRectangle(0, 0, cell, cell / 2),
                          g.addRectangle(0, cell / 2, cell / 2, cell / 2),
                          g.addTriangle(
                              cell / 2,
                              cell / 2,
                              cell / 2,
                              cell / 2,
                              1,
                          ))
                        : index == 9
                          ? ((inner = cell * 0.14),
                            // Use fixed outer border widths in small icons to ensure the border is drawn
                            (outer =
                                cell < 4
                                    ? 1
                                    : cell < 6
                                      ? 2
                                      : 0 | (cell * 0.35)),
                            (inner =
                                cell < 8
                                    ? inner // small icon => anti-aliased border
                                    : 0 | inner), // large icon => truncate decimals
                            g.addRectangle(0, 0, cell, cell),
                            g.addRectangle(
                                outer,
                                outer,
                                cell - outer - inner,
                                cell - outer - inner,
                                true,
                            ))
                          : index == 10
                            ? ((inner = cell * 0.12),
                              (outer = inner * 3),
                              g.addRectangle(0, 0, cell, cell),
                              g.addCircle(
                                  outer,
                                  outer,
                                  cell - inner - outer,
                                  true,
                              ))
                            : index == 11
                              ? g.addTriangle(
                                    cell / 2,
                                    cell / 2,
                                    cell / 2,
                                    cell / 2,
                                    3,
                                )
                              : index == 12
                                ? ((m = cell * 0.25),
                                  g.addRectangle(0, 0, cell, cell),
                                  g.addRhombus(m, m, cell - m, cell - m, true))
                                : // 13
                                  !positionIndex &&
                                  ((m = cell * 0.4),
                                  (w = cell * 1.2),
                                  g.addCircle(m, m, w));
}

function outerShape(index: number, g: Graphics, cell: number) {
    index = index % 4;

    let m;

    !index
        ? g.addTriangle(0, 0, cell, cell, 0)
        : index == 1
          ? g.addTriangle(0, cell / 2, cell, cell / 2, 0)
          : index == 2
            ? g.addRhombus(0, 0, cell, cell)
            : // 3
              ((m = cell / 6), g.addCircle(m, m, cell - 2 * m));
}

const NO_TRANSFORM = new Transform(0, 0, 0, 0);

export class Graphics {
    _renderer: any;
    currentTransform: Transform;

    constructor(renderer: any) {
        this._renderer = renderer;
        this.currentTransform = NO_TRANSFORM;
    }

    /**
     * Adds a polygon to the underlying renderer.
     */
    addPolygon(points: number[], invert: boolean = false) {
        const di = invert ? -2 : 2,
            transformedPoints = [];

        for (
            let i = invert ? points.length - 2 : 0;
            i < points.length && i >= 0;
            i += di
        ) {
            transformedPoints.push(
                this.currentTransform.transformIconPoint(
                    points[i],
                    points[i + 1],
                ),
            );
        }

        this._renderer.addPolygon(transformedPoints);
    }

    /**
     * Adds a polygon to the underlying renderer.
     */
    addCircle(x: number, y: number, size: number, invert: boolean = false) {
        const p = this.currentTransform.transformIconPoint(x, y, size, size);
        this._renderer.addCircle(p, size, invert);
    }

    /**
     * Adds a rectangle to the underlying renderer.
     */
    addRectangle(
        x: number,
        y: number,
        w: number,
        h: number,
        invert: boolean = false,
    ) {
        this.addPolygon([x, y, x + w, y, x + w, y + h, x, y + h], invert);
    }

    /**
     * Adds a right triangle to the underlying renderer.
     */
    addTriangle(
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
        invert: boolean = false,
    ) {
        const points = [x + w, y, x + w, y + h, x, y + h, x, y];
        points.splice(((r || 0) % 4) * 2, 2);
        this.addPolygon(points, invert);
    }

    /**
     * Adds a rhombus to the underlying renderer.
     */
    addRhombus(
        x: number,
        y: number,
        w: number,
        h: number,
        invert: boolean = false,
    ) {
        this.addPolygon(
            [x + w / 2, y, x + w, y + h / 2, x + w / 2, y + h, x, y + h / 2],
            invert,
        );
    }
}

export function colorTheme(hue: number, config: Config) {
    hue = config.hue(hues, hue);
    return [
        // Dark gray
        correctedHsl(
            hue,
            config.grayscaleSaturation,
            config.grayscaleLightness(0),
        ),
        // Mid color
        correctedHsl(hue, config.colorSaturation, config.colorLightness(0.5)),
        // Light gray
        correctedHsl(
            hue,
            config.grayscaleSaturation,
            config.grayscaleLightness(1),
        ),
        // Light color
        correctedHsl(hue, config.colorSaturation, config.colorLightness(1)),
        // Dark color
        correctedHsl(hue, config.colorSaturation, config.colorLightness(0)),
    ];
}

function iconGenerator(renderer: any, hash: string) {
    const parsedConfig = new Config();

    // Set background color
    if (parsedConfig.backColor) {
        renderer.setBackground(parsedConfig.backColor);
    }

    // Calculate padding and round to nearest integer
    let size = renderer.iconSize;
    const padding = (0.5 + size * parsedConfig.iconPadding) | 0;
    size -= padding * 2;

    const graphics = new Graphics(renderer);

    // Calculate cell size and ensure it is an integer
    const cell = 0 | (size / 4);

    // Since the cell size is integer based, the actual icon will be slightly smaller than specified => center icon
    const x = 0 | (padding + size / 2 - cell * 2);
    const y = 0 | (padding + size / 2 - cell * 2);

    function renderShape(
        colorIndex: number,
        shapes: any,
        index: number,
        rotationIndex: number | null,
        positions: number[][],
    ) {
        const shapeIndex = parseHex(hash, index, 1);
        let r = rotationIndex ? parseHex(hash, rotationIndex, 1) : 0;

        renderer.beginShape(availableColors[selectedColorIndexes[colorIndex]]);

        for (let i = 0; i < positions.length; i++) {
            graphics.currentTransform = new Transform(
                x + positions[i][0] * cell,
                y + positions[i][1] * cell,
                cell,
                r++ % 4,
            );
            shapes(shapeIndex, graphics, cell, i);
        }

        renderer.endShape();
    }

    // AVAILABLE COLORS
    const hue = parseHex(hash, -7) / 0xfffffff,
        // Available colors for this icon
        availableColors = colorTheme(hue, parsedConfig),
        // The index of the selected colors
        selectedColorIndexes: number[] = [];

    let index: number;

    function isDuplicate(values: number[]) {
        if (values.indexOf(index) >= 0) {
            for (let i = 0; i < values.length; i++) {
                if (selectedColorIndexes.indexOf(values[i]) >= 0) {
                    return true;
                }
            }
        }
    }

    for (let i = 0; i < 3; i++) {
        index = parseHex(hash, 8 + i, 1) % availableColors.length;
        if (
            isDuplicate([0, 4]) || // Disallow dark gray and dark color combo
            isDuplicate([2, 3])
        ) {
            // Disallow light gray and light color combo
            index = 1;
        }
        selectedColorIndexes.push(index);
    }

    // ACTUAL RENDERING
    // Sides
    renderShape(0, outerShape, 2, 3, [
        [1, 0],
        [2, 0],
        [2, 3],
        [1, 3],
        [0, 1],
        [3, 1],
        [3, 2],
        [0, 2],
    ]);
    // Corners
    renderShape(1, outerShape, 4, 5, [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
    ]);
    // Center
    renderShape(2, centerShape, 1, null, [
        [1, 1],
        [2, 1],
        [2, 2],
        [1, 2],
    ]);

    renderer.finish();
}
