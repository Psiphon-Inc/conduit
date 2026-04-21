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
    Canvas,
    Circle,
    Group,
    Path,
    Skia,
    fitbox,
    rect,
} from "@shopify/react-native-skia";
import React from "react";
import { LayoutChangeEvent, View } from "react-native";

import {
    RegionalImpactRow,
    normalizeRegionalMapKey,
    toRegionalImpactIntensity,
    toRegionalMapLookupKeys,
} from "@/src/hosted/dashboard/regional";
import { palette } from "@/src/styles";

type WorldMapPathValue =
    | string
    | string[]
    | {
          d?: string | string[];
          path?: string | string[];
      };

const MAP_VIEWBOX_WIDTH = 2000;
const MAP_VIEWBOX_HEIGHT = 857;
const worldMapPaths = require("@/assets/worldmapPaths.json") as Record<
    string,
    WorldMapPathValue
>;
const countryCodesToNames =
    require("@/assets/countryCodesToNames.json") as Record<string, string>;
const worldMapLookup = buildWorldMapLookup();
const regionalGlyphCache = new Map<string, RegionalMapGlyphData | null>();
const IDLE_REGION_RGB = hexToRgb(palette.deepMauve);
const ACTIVE_REGION_RGB = hexToRgb(palette.peach);

interface RegionalMapGlyphData {
    bounds: {
        height: number;
        width: number;
        x: number;
        y: number;
    };
    paths: NonNullable<ReturnType<typeof Skia.Path.MakeFromSVGString>>[];
}

interface RegionalMapMarker {
    radius: number;
    x: number;
    y: number;
}

const SMALL_REGION_MARKER_THRESHOLD = 18;
const SMALL_REGION_MARKER_RADIUS = 16;
const MANUAL_REGIONAL_MARKERS: Record<string, RegionalMapMarker> = {
    HONGKONG: { x: 1606, y: 404, radius: 16 },
    SINGAPORE: { x: 1568, y: 499, radius: 16 },
};

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex: string) {
    const normalized = hex.replace(/^#/, "");
    const value = Number.parseInt(normalized, 16);

    return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255,
    };
}

function interpolateChannel(start: number, end: number, amount: number) {
    return Math.round(start + (end - start) * amount);
}

function toRegionalHeatColor(intensity: number): string {
    const amount = clamp01(intensity);
    const colorAmount = Math.pow(amount, 1.18);
    const alpha = amount <= 0 ? 0.12 : 0.16 + Math.pow(amount, 1.35) * 0.84;

    return `rgba(${interpolateChannel(IDLE_REGION_RGB.r, ACTIVE_REGION_RGB.r, colorAmount)}, ${interpolateChannel(IDLE_REGION_RGB.g, ACTIVE_REGION_RGB.g, colorAmount)}, ${interpolateChannel(IDLE_REGION_RGB.b, ACTIVE_REGION_RGB.b, colorAmount)}, ${alpha})`;
}

const REGIONAL_IDLE_COLOR = toRegionalHeatColor(0);

function toWorldMapPaths(value: WorldMapPathValue): string[] {
    if (typeof value === "string") {
        return [value];
    }

    if (Array.isArray(value)) {
        return value.filter((path) => typeof path === "string");
    }

    const paths = value.path ?? value.d;
    if (typeof paths === "string") {
        return [paths];
    }

    if (Array.isArray(paths)) {
        return paths.filter((path) => typeof path === "string");
    }

    return [];
}

function buildWorldMapLookup() {
    const lookup = new Map<string, string[]>();
    const allPaths: string[] = [];

    for (const [key, value] of Object.entries(worldMapPaths)) {
        const countryPaths = toWorldMapPaths(value);
        if (countryPaths.length === 0) {
            continue;
        }
        allPaths.push(...countryPaths);
        lookup.set(normalizeRegionalMapKey(key), countryPaths);
    }

    return { allPaths, lookup };
}

function resolveRegionalPathStrings(region: string): string[] {
    return (
        toRegionalMapLookupKeys(region, countryCodesToNames)
            .map((candidate) => worldMapLookup.lookup.get(candidate))
            .find((candidate) => candidate !== undefined) ?? []
    );
}

function getManualRegionalMarker(region: string): RegionalMapMarker | null {
    const candidate = toRegionalMapLookupKeys(region, countryCodesToNames).find(
        (key) => MANUAL_REGIONAL_MARKERS[key] !== undefined,
    );

    return candidate ? MANUAL_REGIONAL_MARKERS[candidate] : null;
}

function getRegionalGlyphData(region: string): RegionalMapGlyphData | null {
    const cached = regionalGlyphCache.get(region);
    if (cached !== undefined) {
        return cached;
    }

    const paths = resolveRegionalPathStrings(region)
        .map((path) => Skia.Path.MakeFromSVGString(path))
        .filter(
            (
                path,
            ): path is NonNullable<
                ReturnType<typeof Skia.Path.MakeFromSVGString>
            > => path !== null,
        );

    if (paths.length === 0) {
        regionalGlyphCache.set(region, null);
        return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const path of paths) {
        const bounds = path.computeTightBounds();
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    const glyphData = {
        bounds: {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
        },
        paths,
    };
    regionalGlyphCache.set(region, glyphData);
    return glyphData;
}

function getRegionalMarker(region: string): RegionalMapMarker | null {
    const manualMarker = getManualRegionalMarker(region);
    if (manualMarker) {
        return manualMarker;
    }

    const glyph = getRegionalGlyphData(region);
    if (!glyph) {
        return null;
    }

    if (
        glyph.bounds.width > SMALL_REGION_MARKER_THRESHOLD ||
        glyph.bounds.height > SMALL_REGION_MARKER_THRESHOLD
    ) {
        return null;
    }

    return {
        x: glyph.bounds.x + glyph.bounds.width / 2,
        y: glyph.bounds.y + glyph.bounds.height / 2,
        radius: SMALL_REGION_MARKER_RADIUS,
    };
}

export function supportsRegionalMapRegion(region: string): boolean {
    return (
        resolveRegionalPathStrings(region).length > 0 ||
        getManualRegionalMarker(region) !== null
    );
}

export function RegionalWorldMap({ rows }: { rows: RegionalImpactRow[] }) {
    const [canvasSize, setCanvasSize] = React.useState({
        width: 0,
        height: 0,
    });
    const src = React.useMemo(
        () => rect(0, 0, MAP_VIEWBOX_WIDTH, MAP_VIEWBOX_HEIGHT),
        [],
    );
    const dst = React.useMemo(
        () => rect(0, 0, canvasSize.width, canvasSize.height),
        [canvasSize.height, canvasSize.width],
    );
    const resizeTransform = React.useMemo(
        () => fitbox("contain", src, dst),
        [dst, src],
    );
    const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
        const { height, width } = event.nativeEvent.layout;

        setCanvasSize((current) => {
            if (current.width === width && current.height === height) {
                return current;
            }

            return { width, height };
        });
    }, []);

    const mapPaths = React.useMemo(() => {
        return worldMapLookup;
    }, []);

    const highlightedPaths = React.useMemo(() => {
        const maxBytesTransferred = rows.reduce(
            (currentMax, row) => Math.max(currentMax, row.bytesTransferred),
            0,
        );
        const minPositiveBytesTransferred = rows.reduce(
            (currentMin, row) =>
                row.bytesTransferred > 0
                    ? Math.min(currentMin, row.bytesTransferred)
                    : currentMin,
            Number.POSITIVE_INFINITY,
        );
        const boundedMinPositiveBytesTransferred = Number.isFinite(
            minPositiveBytesTransferred,
        )
            ? minPositiveBytesTransferred
            : 0;

        return rows
            .map((row) => {
                const paths = resolveRegionalPathStrings(row.region);

                if (paths.length === 0) {
                    return null;
                }

                const intensity = toRegionalImpactIntensity(
                    row.bytesTransferred,
                    boundedMinPositiveBytesTransferred,
                    maxBytesTransferred,
                );

                return {
                    color: toRegionalHeatColor(intensity),
                    intensity,
                    key: row.region,
                    paths,
                };
            })
            .filter(
                (
                    value,
                ): value is {
                    color: string;
                    intensity: number;
                    key: string;
                    paths: string[];
                } => value !== null,
            )
            .sort((left, right) => left.intensity - right.intensity);
    }, [mapPaths.lookup, rows]);

    return (
        <View
            onLayout={handleLayout}
            style={{
                width: "100%",
                aspectRatio: MAP_VIEWBOX_WIDTH / MAP_VIEWBOX_HEIGHT,
                borderRadius: 18,
                overflow: "hidden",
                backgroundColor: "rgba(25, 18, 36, 0.06)",
            }}
        >
            <Canvas style={{ flex: 1 }}>
                {canvasSize.width > 0 && canvasSize.height > 0 ? (
                    <Group transform={resizeTransform}>
                        {mapPaths.allPaths.map((path, index) => (
                            <Path
                                key={`base-${index}`}
                                path={path}
                                style="fill"
                                color={REGIONAL_IDLE_COLOR}
                            />
                        ))}
                        {highlightedPaths.flatMap(({ color, key, paths }) =>
                            paths.map((path, index) => (
                                <Path
                                    key={`highlight-${key}-${index}`}
                                    path={path}
                                    style="fill"
                                    color={color}
                                />
                            )),
                        )}
                    </Group>
                ) : null}
            </Canvas>
        </View>
    );
}

export function RegionalMapGlyph({
    bytesTransferred,
    minPositiveBytesTransferred,
    maxBytesTransferred,
    region,
}: {
    bytesTransferred: number;
    minPositiveBytesTransferred: number;
    maxBytesTransferred: number;
    region: string;
}) {
    const glyph = React.useMemo(() => getRegionalGlyphData(region), [region]);
    const marker = React.useMemo(() => getRegionalMarker(region), [region]);
    const heatColor = React.useMemo(
        () =>
            toRegionalHeatColor(
                toRegionalImpactIntensity(
                    bytesTransferred,
                    minPositiveBytesTransferred,
                    maxBytesTransferred,
                ),
            ),
        [bytesTransferred, minPositiveBytesTransferred, maxBytesTransferred],
    );

    if (!glyph) {
        return (
            <View
                style={{
                    width: 52,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: "rgba(78, 54, 119, 0.08)",
                    borderWidth: 1,
                    borderColor: "rgba(78, 54, 119, 0.12)",
                }}
            >
                {marker ? (
                    <Canvas style={{ flex: 1 }}>
                        <Circle
                            cx={26}
                            cy={19}
                            r={9}
                            color="rgba(25, 18, 36, 0.18)"
                        />
                        <Circle cx={26} cy={19} r={6} color={heatColor} />
                    </Canvas>
                ) : null}
            </View>
        );
    }

    const padding = 12;
    const src = rect(
        glyph.bounds.x - padding,
        glyph.bounds.y - padding,
        glyph.bounds.width + padding * 2,
        glyph.bounds.height + padding * 2,
    );
    const dst = rect(0, 0, 52, 38);

    return (
        <View
            style={{
                width: 52,
                height: 38,
                borderRadius: 10,
                overflow: "hidden",
                backgroundColor: "rgba(78, 54, 119, 0.08)",
                borderWidth: 1,
                borderColor: "rgba(78, 54, 119, 0.12)",
            }}
        >
            <Canvas style={{ flex: 1 }}>
                <Group transform={fitbox("contain", src, dst)}>
                    {glyph.paths.map((path, index) => (
                        <Path
                            key={`glyph-base-${region}-${index}`}
                            path={path}
                            style="fill"
                            color={REGIONAL_IDLE_COLOR}
                        />
                    ))}
                    {glyph.paths.map((path, index) => (
                        <Path
                            key={`glyph-highlight-${region}-${index}`}
                            path={path}
                            style="fill"
                            color={heatColor}
                        />
                    ))}
                </Group>
            </Canvas>
        </View>
    );
}
