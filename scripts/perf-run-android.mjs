#!/usr/bin/env node
// Run the physical-device Android performance protocol against a perf APK.
// Maestro owns fresh-state setup and onboarding. The measured open/back action
// uses adb input so a second Maestro physical-driver bootstrap cannot interrupt
// ADB or extend the capture window.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PACKAGE = process.env.PERF_PACKAGE ?? "ca.psiphon.conduit.perf";
const SERIAL =
    process.env.PERF_DEVICE ?? process.env.ANDROID_SERIAL ?? "33251FDH2005K2";
const runs = Number(
    process.argv.find((arg) => arg.startsWith("--runs="))?.split("=")[1] ?? 3,
);
const apk = process.argv.find((arg) => arg.startsWith("--apk="))?.slice(6);
const label =
    process.argv.find((arg) => arg.startsWith("--label="))?.slice(8) ?? "run";
const workload =
    process.argv.find((arg) => arg.startsWith("--workload="))?.slice(11) ??
    "baseline-seven-light";
const orbTapX = process.env.PERF_ORB_TAP_X ?? "540";
const orbTapY = process.env.PERF_ORB_TAP_Y ?? "703";
const modalCloseX = process.env.PERF_MODAL_CLOSE_X ?? "906";
const modalCloseY = process.env.PERF_MODAL_CLOSE_Y ?? "900";

if (!apk || !Number.isInteger(runs) || runs < 1) {
    console.error(
        "Usage: node scripts/perf-run-android.mjs --apk=/path/app.apk " +
            "--label=skia|native [--runs=3]",
    );
    process.exit(2);
}
const apkPath = resolve(apk);
const apkBytes = statSync(apkPath).size;
const apkSha256 = createHash("sha256")
    .update(readFileSync(apkPath))
    .digest("hex");

function adb(...args) {
    return execFileSync("adb", ["-s", SERIAL, ...args], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
}

function shell(...args) {
    return adb("shell", ...args);
}

function maestro(flow, debugOutput) {
    execFileSync(
        "maestro",
        [
            "--device",
            SERIAL,
            "test",
            "--debug-output",
            debugOutput,
            "--flatten-debug-output",
            resolve(flow),
        ],
        { stdio: "inherit" },
    );
}

function resetCounters() {
    shell("dumpsys", "gfxinfo", PACKAGE, "reset");
    shell("logcat", "-G", "16M");
    shell("logcat", "-c");
}

function parseGfxinfo(gfxinfo) {
    const value = (field) =>
        gfxinfo
            .match(new RegExp(`^\\s*${field}:\\s*([^\\n]+)`, "m"))?.[1]
            ?.trim() ?? null;
    const histogram =
        gfxinfo
            .match(/^HISTOGRAM:\s*(.+)$/m)?.[1]
            ?.trim()
            .split(/\s+/)
            .flatMap((bucket) => {
                const match = /^(\d+)ms=(\d+)$/.exec(bucket);
                return match
                    ? [{ ms: Number(match[1]), frames: Number(match[2]) }]
                    : [];
            }) ?? [];
    const framesOver = (thresholdMs) =>
        histogram
            .filter((bucket) => bucket.ms > thresholdMs)
            .reduce((total, bucket) => total + bucket.frames, 0);
    const jankyFrames = value("Janky frames");

    const totalFrames = Number(value("Total frames rendered") ?? 0);
    const over20 = framesOver(20);
    const over33 = framesOver(33);

    return {
        totalFrames,
        jankyFrames,
        jankyPercent: Number(jankyFrames?.match(/\(([\d.]+)%\)/)?.[1] ?? 0),
        p50: value("50th percentile"),
        p90: value("90th percentile"),
        p95: value("95th percentile"),
        p99: value("99th percentile"),
        missedVsync: value("Number Missed Vsync"),
        slowUiThread: value("Number Slow UI thread"),
        frameDeadlineMissed: value("Number Frame deadline missed"),
        over20,
        over33,
        over20Per1000: totalFrames ? (over20 / totalFrames) * 1000 : 0,
        over33Per1000: totalFrames ? (over33 / totalFrames) * 1000 : 0,
    };
}

function parseMeminfo(meminfo) {
    const integer = (pattern) => {
        const match = meminfo.match(pattern);
        return match ? Number(match[1]) : null;
    };
    const graphics = meminfo.match(/^\s*Graphics:\s*(\d+)\s+(\d+)/m);

    return {
        totalPssKb: integer(/TOTAL PSS:\s*(\d+)/),
        totalRssKb: integer(/TOTAL RSS:\s*(\d+)/),
        graphicsPssKb: graphics ? Number(graphics[1]) : null,
        graphicsRssKb: graphics ? Number(graphics[2]) : null,
        nativeHeapPssKb: integer(/^\s*Native Heap\s+(\d+)/m),
        bitmapKb: integer(/^\s*Bitmap \(malloced\):\s*\d+\s+(\d+)/m),
        views: integer(/^\s*Views:\s*(\d+)/m),
    };
}

function parsePerf(logcat) {
    return logcat
        .split("\n")
        .filter((line) => line.includes("[PERF]"))
        .flatMap((line) => {
            const start = line.indexOf("{", line.indexOf("[PERF]"));
            const end = line.lastIndexOf("}");
            if (start < 0 || end <= start) return [];
            try {
                return [JSON.parse(line.slice(start, end + 1))];
            } catch {
                return [];
            }
        });
}

function perfAggregate(summaries) {
    const windows = summaries.filter((summary) =>
        summary.label?.startsWith("window:"),
    );
    return windows.reduce(
        (result, summary) => {
            result.windows += 1;
            result.frames += summary.ui?.frames ?? 0;
            result.over20 += summary.ui?.over20 ?? 0;
            result.over33 += summary.ui?.over33 ?? 0;
            return result;
        },
        { windows: 0, frames: 0, over20: 0, over33: 0 },
    );
}

function assertPhysicalDeviceReady() {
    const attached = execFileSync("adb", ["devices"], { encoding: "utf8" })
        .split("\n")
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .filter((parts) => parts[0] && parts[1] === "device")
        .map((parts) => parts[0]);
    if (attached.length !== 1 || attached[0] !== SERIAL) {
        throw new Error(
            `Expected only ${SERIAL}; adb reports: ${attached.join(", ") || "none"}`,
        );
    }
}

function prepareDeviceForAutomation() {
    shell("input", "keyevent", "224");
    shell("wm", "dismiss-keyguard");
    shell("cmd", "statusbar", "collapse");
    shell("svc", "power", "stayon", "true");
    const windowState = shell("dumpsys", "window");
    if (
        windowState.includes("mDreamingLockscreen=true") ||
        windowState.includes("mShowingLockscreen=true")
    ) {
        throw new Error(
            "The device is still locked. Unlock it once, leave it plugged " +
                "in, and rerun; the runner will keep the screen awake.",
        );
    }
}

function deviceMetadata() {
    const setting = (namespace, key) =>
        shell("settings", "get", namespace, key).trim();
    const thermalStatus = shell("dumpsys", "thermalservice").match(
        /Thermal Status:\s*(\d+)/,
    )?.[1];
    return {
        serial: SERIAL,
        model: shell("getprop", "ro.product.model").trim(),
        androidVersion: shell("getprop", "ro.build.version.release").trim(),
        sdk: shell("getprop", "ro.build.version.sdk").trim(),
        buildFingerprint: shell("getprop", "ro.build.fingerprint").trim(),
        brightnessMode: setting("system", "screen_brightness_mode"),
        brightness: setting("system", "screen_brightness"),
        batterySaver: setting("global", "low_power"),
        thermalStatus: thermalStatus ? Number(thermalStatus) : null,
        windowAnimationScale: setting("global", "window_animation_scale"),
        transitionAnimationScale: setting(
            "global",
            "transition_animation_scale",
        ),
        animatorDurationScale: setting("global", "animator_duration_scale"),
    };
}

async function installFresh() {
    try {
        adb("uninstall", PACKAGE);
    } catch {
        // Package may not be installed on the first run.
    }
    adb("install", apkPath);
}

async function runOnce(index) {
    console.log(`\n== ${label} run ${index}/${runs} ==`);
    await installFresh();
    const dir = `artifacts/perf-android/${label}`;
    mkdirSync(dir, { recursive: true });

    maestro(
        "maestro/flows/performance/mock-prepare.yaml",
        resolve(dir, `run-${index}-prepare-maestro`),
    );
    // Settle after onboarding and mock startup. Baseline and stress builds use
    // deterministic workloads; this interval is intentionally outside capture.
    await sleep(30_000);

    resetCounters();
    const startedAt = new Date().toISOString();
    await sleep(20_000);
    const preInteractionLogcat = shell("logcat", "-d", "-s", "ReactNativeJS:V");
    shell("logcat", "-c");
    shell("input", "tap", orbTapX, orbTapY);
    await sleep(1_000);
    shell("input", "tap", modalCloseX, modalCloseY);
    await sleep(20_000);

    const gfxinfo = shell("dumpsys", "gfxinfo", PACKAGE);
    const meminfo = shell("dumpsys", "meminfo", PACKAGE);
    const postInteractionLogcat = shell(
        "logcat",
        "-d",
        "-s",
        "ReactNativeJS:V",
    );
    const logcat = `${preInteractionLogcat}\n${postInteractionLogcat}`;
    const result = {
        label,
        workload,
        run: index,
        package: PACKAGE,
        apk: apkPath,
        apkBytes,
        apkSha256,
        startedAt,
        capturedAt: new Date().toISOString(),
        interaction: {
            orbTap: { x: Number(orbTapX), y: Number(orbTapY) },
            modalCloseTap: {
                x: Number(modalCloseX),
                y: Number(modalCloseY),
            },
        },
        device: deviceMetadata(),
        gfxinfo: parseGfxinfo(gfxinfo),
        memory: parseMeminfo(meminfo),
        perf: perfAggregate(parsePerf(logcat)),
    };
    writeFileSync(`${dir}/run-${index}.gfxinfo.txt`, gfxinfo);
    writeFileSync(`${dir}/run-${index}.meminfo.txt`, meminfo);
    writeFileSync(`${dir}/run-${index}.logcat.txt`, logcat);
    writeFileSync(
        `${dir}/run-${index}.json`,
        `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result, null, 2));
    return result;
}

function numberFrom(value) {
    if (typeof value === "number") return value;
    return Number.parseFloat(String(value ?? "0")) || 0;
}

function median(values) {
    const sorted = values.map(numberFrom).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

assertPhysicalDeviceReady();
prepareDeviceForAutomation();
const results = [];
for (let index = 1; index <= runs; index += 1) {
    results.push(await runOnce(index));
}

const summary = {
    label,
    workload,
    runs,
    apk: apkPath,
    apkBytes,
    apkSha256,
    device: results[0]?.device,
    median: {
        gfxinfo: Object.fromEntries(
            [
                "totalFrames",
                "jankyPercent",
                "p50",
                "p90",
                "p95",
                "p99",
                "missedVsync",
                "slowUiThread",
                "frameDeadlineMissed",
                "over20",
                "over33",
                "over20Per1000",
                "over33Per1000",
            ].map((key) => [
                key,
                median(results.map((result) => result.gfxinfo[key])),
            ]),
        ),
        memory: Object.fromEntries(
            [
                "totalPssKb",
                "totalRssKb",
                "graphicsPssKb",
                "graphicsRssKb",
                "nativeHeapPssKb",
                "bitmapKb",
                "views",
            ].map((key) => [
                key,
                median(results.map((result) => result.memory[key])),
            ]),
        ),
        perf: Object.fromEntries(
            ["windows", "frames", "over20", "over33"].map((key) => [
                key,
                median(results.map((result) => result.perf[key])),
            ]),
        ),
    },
};
const summaryDir = `artifacts/perf-android/${label}`;
writeFileSync(
    `${summaryDir}/summary.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(`\n== ${label} median ==`);
console.log(JSON.stringify(summary, null, 2));
