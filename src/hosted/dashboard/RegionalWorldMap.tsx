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
import { View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

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

interface RegionalMapBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

const MAP_VIEWBOX_WIDTH = 2000;
const MAP_VIEWBOX_HEIGHT = 857;
const REGIONAL_GLYPH_WIDTH = 52;
const REGIONAL_GLYPH_HEIGHT = 38;
const REGIONAL_GLYPH_PADDING = 5;
const worldMapPaths = require("@/assets/worldmapPaths.json") as Record<
    string,
    WorldMapPathValue
>;
// Precomputed by scripts/generate-worldmap-bounds.mjs (verified fresh by
// `npm run check`); replaces runtime Skia computeTightBounds() calls.
const worldMapBounds = require("@/assets/worldmapBounds.json") as Record<
    string,
    RegionalMapBounds
>;
const countryCodesToNames =
    require("@/assets/countryCodesToNames.json") as Record<string, string>;
const worldMapLookup = buildWorldMapLookup();
const IDLE_REGION_RGB = hexToRgb(palette.deepMauve);
const ACTIVE_REGION_RGB = hexToRgb(palette.peach);

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
    const boundsLookup = new Map<string, RegionalMapBounds>();
    const allPaths: string[] = [];

    for (const [key, value] of Object.entries(worldMapPaths)) {
        const countryPaths = toWorldMapPaths(value);
        if (countryPaths.length === 0) {
            continue;
        }
        allPaths.push(...countryPaths);
        const normalizedKey = normalizeRegionalMapKey(key);
        lookup.set(normalizedKey, countryPaths);
        const bounds = worldMapBounds[key];
        if (bounds) {
            boundsLookup.set(normalizedKey, bounds);
        }
    }

    return { allPaths, lookup, boundsLookup };
}

function resolveRegionalPathStrings(region: string): string[] {
    return (
        toRegionalMapLookupKeys(region, countryCodesToNames)
            .map((candidate) => worldMapLookup.lookup.get(candidate))
            .find((candidate) => candidate !== undefined) ?? []
    );
}

function resolveRegionalBounds(region: string): RegionalMapBounds | null {
    return (
        toRegionalMapLookupKeys(region, countryCodesToNames)
            .map((candidate) => worldMapLookup.boundsLookup.get(candidate))
            .find((candidate) => candidate !== undefined) ?? null
    );
}

function getManualRegionalMarker(region: string): RegionalMapMarker | null {
    const candidate = toRegionalMapLookupKeys(region, countryCodesToNames).find(
        (key) => MANUAL_REGIONAL_MARKERS[key] !== undefined,
    );

    return candidate ? MANUAL_REGIONAL_MARKERS[candidate] : null;
}

interface RegionalMapGlyphData {
    bounds: RegionalMapBounds;
    paths: string[];
}

function getRegionalGlyphTransform(bounds: RegionalMapBounds): string {
    const availableWidth = REGIONAL_GLYPH_WIDTH - REGIONAL_GLYPH_PADDING * 2;
    const availableHeight = REGIONAL_GLYPH_HEIGHT - REGIONAL_GLYPH_PADDING * 2;
    const scale = Math.min(
        availableWidth / Math.max(bounds.width, 1),
        availableHeight / Math.max(bounds.height, 1),
    );
    const translateX =
        (REGIONAL_GLYPH_WIDTH - bounds.width * scale) / 2 - bounds.x * scale;
    const translateY =
        (REGIONAL_GLYPH_HEIGHT - bounds.height * scale) / 2 - bounds.y * scale;

    return `matrix(${scale} 0 0 ${scale} ${translateX} ${translateY})`;
}

function getRegionalGlyphData(region: string): RegionalMapGlyphData | null {
    const paths = resolveRegionalPathStrings(region);
    const bounds = resolveRegionalBounds(region);
    if (paths.length === 0 || !bounds) {
        return null;
    }
    return { bounds, paths };
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
    }, [rows]);

    return (
        <View
            style={{
                width: "100%",
                aspectRatio: MAP_VIEWBOX_WIDTH / MAP_VIEWBOX_HEIGHT,
                borderRadius: 18,
                overflow: "hidden",
                backgroundColor: "rgba(25, 18, 36, 0.06)",
            }}
        >
            <Svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`}
            >
                {worldMapLookup.allPaths.map((path, index) => (
                    <Path
                        key={`base-${index}`}
                        d={path}
                        fill={REGIONAL_IDLE_COLOR}
                    />
                ))}
                {highlightedPaths.flatMap(({ color, key, paths }) =>
                    paths.map((path, index) => (
                        <Path
                            key={`highlight-${key}-${index}`}
                            d={path}
                            fill={color}
                        />
                    )),
                )}
            </Svg>
        </View>
    );
}

const REGIONAL_GLYPH_FRAME_STYLE = {
    width: REGIONAL_GLYPH_WIDTH,
    height: REGIONAL_GLYPH_HEIGHT,
    flexShrink: 0,
    borderRadius: 10,
    overflow: "hidden" as const,
    backgroundColor: "rgba(78, 54, 119, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(78, 54, 119, 0.12)",
};

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
            <View style={REGIONAL_GLYPH_FRAME_STYLE}>
                {marker ? (
                    <Svg
                        width={REGIONAL_GLYPH_WIDTH}
                        height={REGIONAL_GLYPH_HEIGHT}
                    >
                        <Circle
                            cx={REGIONAL_GLYPH_WIDTH / 2}
                            cy={REGIONAL_GLYPH_HEIGHT / 2}
                            r={9}
                            fill="rgba(25, 18, 36, 0.18)"
                        />
                        <Circle
                            cx={REGIONAL_GLYPH_WIDTH / 2}
                            cy={REGIONAL_GLYPH_HEIGHT / 2}
                            r={6}
                            fill={heatColor}
                        />
                    </Svg>
                ) : null}
            </View>
        );
    }

    const transform = getRegionalGlyphTransform(glyph.bounds);

    return (
        <View style={REGIONAL_GLYPH_FRAME_STYLE}>
            <Svg
                width={REGIONAL_GLYPH_WIDTH}
                height={REGIONAL_GLYPH_HEIGHT}
                viewBox={`0 0 ${REGIONAL_GLYPH_WIDTH} ${REGIONAL_GLYPH_HEIGHT}`}
            >
                <G transform={transform}>
                    {glyph.paths.map((path, index) => (
                        <Path
                            key={`glyph-base-${region}-${index}`}
                            d={path}
                            fill={REGIONAL_IDLE_COLOR}
                        />
                    ))}
                    {glyph.paths.map((path, index) => (
                        <Path
                            key={`glyph-highlight-${region}-${index}`}
                            d={path}
                            fill={heatColor}
                        />
                    ))}
                </G>
            </Svg>
        </View>
    );
}
