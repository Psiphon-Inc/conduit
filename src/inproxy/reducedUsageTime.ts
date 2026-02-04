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
export const TIME_STEP_MINUTES = 30;
export const TIME_STEPS = 48;
export const DEFAULT_REDUCED_START_INDEX = 14; // 07:00
export const DEFAULT_REDUCED_END_INDEX = 38; // 19:00

export function formatTimeLabel(hours: number, minutes: number) {
    "worklet";
    const hoursLabel = hours < 10 ? `0${hours}` : `${hours}`;
    const minutesLabel = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hoursLabel}:${minutesLabel}`;
}

export function formatTimeIndex(index: number) {
    "worklet";
    const totalMinutes = index * TIME_STEP_MINUTES;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const minutesLabel = minutes === 0 ? 0 : 30;
    return formatTimeLabel(hours, minutesLabel);
}

export function parseTimeIndex(value: string) {
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) {
        return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (minutes !== 0 && minutes !== 30) {
        return null;
    }
    return hours * 2 + (minutes === 30 ? 1 : 0);
}

export function convertLocalTimeToUtc(value: string) {
    "worklet";
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) {
        return value;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const now = new Date();
    const localDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hours,
        minutes,
        0,
        0,
    );
    return formatTimeLabel(localDate.getUTCHours(), localDate.getUTCMinutes());
}

export function convertUtcTimeToLocal(value: string) {
    "worklet";
    const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) {
        return value;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const now = new Date();
    const utcDate = new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            hours,
            minutes,
            0,
            0,
        ),
    );
    return formatTimeLabel(utcDate.getHours(), utcDate.getMinutes());
}
