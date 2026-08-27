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
import { useFrameCallback, useSharedValue } from "react-native-reanimated";

// Opt-in performance probe, ported from the Ryve client. While enabled it
// samples real UI-thread frame intervals via a Reanimated frame callback and
// collects named marks, then prints one machine-readable summary line to the
// JS console:
//   [PERF] {"label":"orb-scene:three-lights","ui":{...},"marks":[...]}
// Summaries land in Metro output and in `adb logcat` (tag ReactNativeJS), so
// they can be pulled from the command line on demand — see
// scripts/perf-android.mjs (`npm run perf:session`) for native sessions and
// visual/perf.mjs (`npm run visual:perf`) for web scenario sweeps. The probe
// is omitted unless EXPO_PUBLIC_PERF=1 is set at bundle time, and the frame
// sampler only runs while recording.
//
// Recordings come from three places:
// - usePerfProbe(enabled, label): tied to a feature's lifecycle.
// - perfStart(label)/perfStop(): ad-hoc, also exposed on the console as
//   global.perfStart()/global.perfStop(); hosted by <PerfRecorderHost />.
// - EXPO_PUBLIC_PERF=1: the host emits
//   rolling window summaries continuously, for externally driven sessions
//   (e.g. Maestro flows) where nothing in-app brackets the interaction.
//
// The Skia migration uses these summaries as its performance acceptance
// baseline (docs/plans/react-native-skia-migration.md, phase 0 and 9).

const TAG = "[PERF]";
const AUTORECORD_WINDOW_MS = 5000;
const MARK_RETENTION_MS = 60_000;

// EXPO_PUBLIC_* values are inlined by Expo's Babel transform. Keeping the
// flag as a literal static reference makes normal builds omit the host's
// recording work while allowing production-like perf bundles to opt in.
export const PERF_ENABLED = process.env.EXPO_PUBLIC_PERF === "1";
const PERF_AUTORECORD =
    PERF_ENABLED && process.env.EXPO_PUBLIC_PERF_AUTORECORD !== "0";

interface UIFrameStats {
    frames: number;
    sumMs: number;
    worstMs: number;
    over20: number;
    over33: number;
}

const EMPTY_STATS: UIFrameStats = {
    frames: 0,
    sumMs: 0,
    worstMs: 0,
    over20: 0,
    over33: 0,
};

// Append-only with age-based pruning (never cleared wholesale), so
// overlapping recordings can't wipe each other's marks.
let marks: { name: string; at: number }[] = [];

/** Record a named moment; it shows up in any recording that spans it. */
export function perfMark(name: string): void {
    if (!PERF_ENABLED) {
        return;
    }
    const now = performance.now();
    marks.push({ name, at: now });
    while (marks.length > 0 && now - marks[0].at > MARK_RETENTION_MS) {
        marks.shift();
    }
}

function emitSummary(
    label: string,
    startedAt: number,
    stats: UIFrameStats,
): void {
    console.log(
        TAG,
        JSON.stringify({
            label,
            durationMs: Math.round(performance.now() - startedAt),
            ui: {
                frames: stats.frames,
                avgMs:
                    stats.frames > 0
                        ? Number((stats.sumMs / stats.frames).toFixed(2))
                        : 0,
                worstMs: Number(stats.worstMs.toFixed(1)),
                over20: stats.over20,
                over33: stats.over33,
            },
            marks: marks
                .filter((mark) => mark.at >= startedAt)
                .map((mark) => ({
                    name: mark.name,
                    ms: Math.round(mark.at - startedAt),
                })),
        }),
    );
}

/**
 * Records UI-thread frame health while `enabled` is true and logs a [PERF]
 * summary (frame counts, dropped-frame buckets, worst frame, marks timeline)
 * when recording stops — including label changes and unmounts, so
 * back-to-back recordings each get their own summary.
 */
export function usePerfProbe(enabled: boolean, label: string): void {
    const stats = useSharedValue<UIFrameStats>(EMPTY_STATS);

    const sampler = useFrameCallback((frame) => {
        const dt = frame.timeSincePreviousFrame;
        if (dt === null) {
            return;
        }
        const s = stats.value;
        stats.value = {
            frames: s.frames + 1,
            sumMs: s.sumMs + dt,
            worstMs: Math.max(s.worstMs, dt),
            over20: s.over20 + (dt > 20 ? 1 : 0),
            over33: s.over33 + (dt > 33 ? 1 : 0),
        };
    }, false);

    React.useEffect(() => {
        if (!PERF_ENABLED || !enabled) {
            return;
        }
        stats.value = EMPTY_STATS;
        const startedAt = performance.now();
        sampler.setActive(true);
        return () => {
            sampler.setActive(false);
            // Snapshot immediately: the next recording resets the shared
            // value, so waiting to flush would race it. Costs at most the
            // final frame sample.
            emitSummary(label, startedAt, stats.value);
        };
    }, [enabled, label, sampler, stats]);
}

interface RecorderState {
    enabled: boolean;
    label: string;
}

let recorderState: RecorderState = { enabled: false, label: "" };
const recorderListeners = new Set<(state: RecorderState) => void>();

function setRecorderState(next: RecorderState): void {
    recorderState = next;
    for (const listener of recorderListeners) {
        listener(next);
    }
}

/** Start an ad-hoc recording (console: `perfStart("label")`). */
export function perfStart(label: string = "manual"): void {
    if (!PERF_ENABLED) {
        return;
    }
    setRecorderState({ enabled: true, label });
}

/** Stop the ad-hoc recording and emit its summary (console: `perfStop()`). */
export function perfStop(): void {
    if (!PERF_ENABLED) {
        return;
    }
    setRecorderState({ ...recorderState, enabled: false });
}

if (PERF_ENABLED) {
    const devGlobal = globalThis as Record<string, unknown>;
    devGlobal.perfStart = perfStart;
    devGlobal.perfStop = perfStop;
}

/**
 * Mount once near the app root (perf builds only). Hosts the frame sampler for
 * perfStart()/perfStop() recordings, and with EXPO_PUBLIC_PERF=1 by default
 * (or EXPO_PUBLIC_PERF_AUTORECORD=1 explicitly)
 * emits rolling window summaries so externally driven interactions (Maestro
 * runs, manual exploration) are measured without any in-app bracketing.
 */
export function PerfRecorderHost(): null {
    const [state, setState] = React.useState(recorderState);
    React.useEffect(() => {
        recorderListeners.add(setState);
        // Boot beacon: proves the running bundle contains the probe (the
        // most common reason for missing summaries is a stale bundle).
        console.log(
            TAG,
            JSON.stringify({
                label: "probe-online",
                autorecord: PERF_AUTORECORD,
            }),
        );
        return () => {
            recorderListeners.delete(setState);
        };
    }, []);

    React.useEffect(() => {
        if (!PERF_AUTORECORD) {
            return;
        }
        let window = 0;
        perfStart(`window:${window}`);
        const interval = setInterval(() => {
            window += 1;
            // Label change emits the previous window and starts the next.
            perfStart(`window:${window}`);
        }, AUTORECORD_WINDOW_MS);
        return () => {
            clearInterval(interval);
            perfStop();
        };
    }, []);

    usePerfProbe(state.enabled, state.label);
    return null;
}
