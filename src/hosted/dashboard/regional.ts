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
import type { DashboardLiveRegionMetric } from "@/src/hosted/dashboard";

export interface RegionalImpactRow {
    region: string;
    connectedUsers: number;
    bytesTransferred: number;
}

const REGIONAL_MAP_NAME_OVERRIDES: Record<string, string> = {
    IRAN: "Iran, Islamic Republic Of",
    IRANISLAMICREPUBLICOF: "Iran",
    LAOS: "Lao People's Democratic Republic",
    LAOPEOPLESDEMOCRATICREPUBLIC: "Laos",
    LIBYANARABJAMAHIRIYA: "Libya",
    MOLDOVA: "Moldova, Republic of",
    MOLDOVAREPUBLICOF: "Moldova",
    RUSSIA: "Russian Federation",
    RUSSIANFEDERATION: "Russia",
    SYRIA: "Syrian Arab Republic",
    SYRIANARABREPUBLIC: "Syria",
    TANZANIA: "Tanzania, United Republic of",
    TANZANIAUNITEDREPUBLICOF: "Tanzania",
    UNITEDSTATES: "United States of America",
    UNITEDSTATESOFAMERICA: "United States",
    VENEZUELA: "Venezuela (Bolivarian Republic of)",
    VIETNAM: "Viet Nam",
};

/**
 * Merges personal and public regional activity metrics into a combined
 * list sorted by bytes transferred (descending).
 */
export function mergeRegionalActivity(
    personal: DashboardLiveRegionMetric[],
    publicMetrics: DashboardLiveRegionMetric[],
): RegionalImpactRow[] {
    const byRegion = new Map<string, RegionalImpactRow>();

    const addMetrics = (metric: DashboardLiveRegionMetric) => {
        const existing = byRegion.get(metric.region) ?? {
            region: metric.region,
            connectedUsers: 0,
            bytesTransferred: 0,
        };
        existing.connectedUsers += metric.connectedUsers;
        existing.bytesTransferred +=
            metric.bytesUpTotal + metric.bytesDownTotal;
        byRegion.set(metric.region, existing);
    };

    for (const metric of personal) {
        addMetrics(metric);
    }
    for (const metric of publicMetrics) {
        addMetrics(metric);
    }

    return [...byRegion.values()].sort(
        (left, right) => right.bytesTransferred - left.bytesTransferred,
    );
}

const MIN_REGIONAL_ACTIVITY_INTENSITY = 0.18;

export function toRegionalImpactIntensity(
    bytesTransferred: number,
    minPositiveBytesTransferred: number,
    maxBytesTransferred: number,
): number {
    if (
        bytesTransferred <= 0 ||
        minPositiveBytesTransferred <= 0 ||
        maxBytesTransferred <= 0
    ) {
        return 0;
    }

    if (maxBytesTransferred <= minPositiveBytesTransferred) {
        return 1;
    }

    const clampedValue = Math.min(
        Math.max(bytesTransferred, minPositiveBytesTransferred),
        maxBytesTransferred,
    );
    const minLog = Math.log1p(minPositiveBytesTransferred);
    const maxLog = Math.log1p(maxBytesTransferred);
    const valueLog = Math.log1p(clampedValue);
    const scaled = (valueLog - minLog) / (maxLog - minLog);

    return (
        MIN_REGIONAL_ACTIVITY_INTENSITY +
        Math.max(0, Math.min(1, scaled)) * (1 - MIN_REGIONAL_ACTIVITY_INTENSITY)
    );
}

export function toRegionalImpactOpacity(
    bytesTransferred: number,
    minPositiveBytesTransferred: number,
    maxBytesTransferred: number,
): number {
    return toRegionalImpactIntensity(
        bytesTransferred,
        minPositiveBytesTransferred,
        maxBytesTransferred,
    );
}

export function normalizeRegionalMapKey(value: string): string {
    return value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, "");
}

export function toRegionalMapLookupKeys(
    region: string,
    countryCodesToNames: Record<string, string>,
): string[] {
    const upperRegion = region.trim().toUpperCase();
    const countryName =
        countryCodesToNames[upperRegion] ?? toRegionLabel(upperRegion);
    const overrideName =
        REGIONAL_MAP_NAME_OVERRIDES[normalizeRegionalMapKey(countryName)];
    const candidates = [upperRegion, countryName, overrideName];

    return [
        ...new Set(
            candidates
                .map((value) => normalizeRegionalMapKey(value ?? ""))
                .filter(Boolean),
        ),
    ];
}

/**
 * Static fallback map for common country codes, used when
 * Intl.DisplayNames is unavailable (e.g. older Hermes builds).
 */
const REGION_NAME_FALLBACK: Record<string, string> = {
    AF: "Afghanistan",
    AL: "Albania",
    DZ: "Algeria",
    AR: "Argentina",
    AM: "Armenia",
    AU: "Australia",
    AT: "Austria",
    AZ: "Azerbaijan",
    BD: "Bangladesh",
    BY: "Belarus",
    BE: "Belgium",
    BR: "Brazil",
    BG: "Bulgaria",
    CA: "Canada",
    CL: "Chile",
    CN: "China",
    CO: "Colombia",
    CR: "Costa Rica",
    HR: "Croatia",
    CU: "Cuba",
    CZ: "Czechia",
    DK: "Denmark",
    DO: "Dominican Republic",
    EC: "Ecuador",
    EG: "Egypt",
    SV: "El Salvador",
    EE: "Estonia",
    ET: "Ethiopia",
    FI: "Finland",
    FR: "France",
    GE: "Georgia",
    DE: "Germany",
    GH: "Ghana",
    GR: "Greece",
    GT: "Guatemala",
    HN: "Honduras",
    HK: "Hong Kong",
    HU: "Hungary",
    IN: "India",
    ID: "Indonesia",
    IR: "Iran",
    IQ: "Iraq",
    IE: "Ireland",
    IL: "Israel",
    IT: "Italy",
    JP: "Japan",
    JO: "Jordan",
    KZ: "Kazakhstan",
    KE: "Kenya",
    KR: "South Korea",
    KW: "Kuwait",
    KG: "Kyrgyzstan",
    LV: "Latvia",
    LB: "Lebanon",
    LY: "Libya",
    LT: "Lithuania",
    MY: "Malaysia",
    MX: "Mexico",
    MD: "Moldova",
    MA: "Morocco",
    MM: "Myanmar",
    NP: "Nepal",
    NL: "Netherlands",
    NZ: "New Zealand",
    NG: "Nigeria",
    NO: "Norway",
    OM: "Oman",
    PK: "Pakistan",
    PA: "Panama",
    PE: "Peru",
    PH: "Philippines",
    PL: "Poland",
    PT: "Portugal",
    QA: "Qatar",
    RO: "Romania",
    RU: "Russia",
    SA: "Saudi Arabia",
    SN: "Senegal",
    RS: "Serbia",
    SG: "Singapore",
    SK: "Slovakia",
    SI: "Slovenia",
    ZA: "South Africa",
    ES: "Spain",
    LK: "Sri Lanka",
    SD: "Sudan",
    SE: "Sweden",
    CH: "Switzerland",
    SY: "Syria",
    TW: "Taiwan",
    TJ: "Tajikistan",
    TZ: "Tanzania",
    TH: "Thailand",
    TN: "Tunisia",
    TR: "Turkey",
    TM: "Turkmenistan",
    UA: "Ukraine",
    AE: "UAE",
    GB: "United Kingdom",
    US: "United States",
    UY: "Uruguay",
    UZ: "Uzbekistan",
    VE: "Venezuela",
    VN: "Vietnam",
    YE: "Yemen",
    ZM: "Zambia",
    ZW: "Zimbabwe",
};

/**
 * Converts a 2-letter country code to a full country name using
 * Intl.DisplayNames, falling back to a static map and then the
 * uppercase code.
 */
export function toRegionLabel(region: string): string {
    const upper = region.trim().toUpperCase();
    if (upper.length !== 2) {
        return region;
    }
    try {
        if (typeof Intl !== "undefined" && "DisplayNames" in Intl) {
            const displayNames = new Intl.DisplayNames(["en"], {
                type: "region",
            });
            const name = displayNames.of(upper);
            if (name && name !== upper) {
                return name;
            }
        }
    } catch {
        // ignore and fall through
    }
    return REGION_NAME_FALLBACK[upper] ?? upper;
}
