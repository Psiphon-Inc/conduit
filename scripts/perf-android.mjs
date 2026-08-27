// Pulls performance readings from a connected Android device/emulator:
// the in-app [PERF] probe summaries (see src/common/perfProbe.ts) plus the
// platform RenderThread frame statistics. Ported from the Ryve client.
//
// Usage:
//   npm run perf:session            one-shot measurement session: clears
//                                   counters, waits for the instrumented
//                                   interaction to be performed on-device,
//                                   then prints both readings
//   npm run perf:android            print current readings
//   npm run perf:android -- --reset clear frame stats + logcat only
//
// Env: PERF_DEVICE (adb serial), PERF_PACKAGE (app id),
//      PERF_TIMEOUT_S (session wait, default 300)
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CANDIDATE_PACKAGES = [
    process.env.PERF_PACKAGE,
    "ca.psiphon.conduit",
    "host.exp.exponent",
].filter(Boolean);

function rawAdb(...args) {
    return execFileSync("adb", args, { encoding: "utf8", maxBuffer: 32e6 });
}

// With several devices attached, target PERF_DEVICE/ANDROID_SERIAL if set,
// otherwise the first physical device, otherwise the first emulator.
const serial =
    process.env.PERF_DEVICE ??
    process.env.ANDROID_SERIAL ??
    (() => {
        const devices = rawAdb("devices")
            .split("\n")
            .slice(1)
            .map((line) => line.split("\t"))
            .filter((parts) => parts[1] === "device")
            .map((parts) => parts[0]);
        return (
            devices.find((device) => !device.startsWith("emulator-")) ??
            devices[0]
        );
    })();
if (!serial) {
    console.log("No Android device connected.");
    process.exit(1);
}

function adb(...args) {
    return rawAdb("-s", serial, ...args);
}

function resolvePackage() {
    for (const candidate of CANDIDATE_PACKAGES) {
        const out = adb("shell", "dumpsys", "gfxinfo", candidate);
        if (!out.includes("No process found")) {
            return { name: candidate, gfxinfo: out };
        }
    }
    return null;
}

function reset() {
    // Reset only the intended package: falling back (e.g. to Expo Go) here
    // would silently reset the wrong app when ours isn't running yet.
    const name = CANDIDATE_PACKAGES[0];
    const out = adb("shell", "dumpsys", "gfxinfo", name);
    const running = !out.includes("No process found");
    if (running) {
        adb("shell", "dumpsys", "gfxinfo", name, "reset");
    }
    // Chatty devices (e.g. tunnel logging) can rotate the default ~256KB
    // buffer in well under a minute, silently dropping [PERF] lines before
    // they're pulled. Grow it for the session.
    adb("logcat", "-G", "16M");
    adb("logcat", "-c");
    return running ? { name } : null;
}

function perfLogLines() {
    const logs = adb("logcat", "-d", "-s", "ReactNativeJS:I");
    return logs.split("\n").filter((line) => line.includes("[PERF]"));
}

function report() {
    console.log("== In-app probe summaries ([PERF]) ==");
    const perfLines = perfLogLines();
    if (perfLines.length === 0) {
        console.log(
            "(none captured — the instrumented interaction wasn't run, " +
                "or the running bundle predates src/common/perfProbe.ts: " +
                "reload the app against a current Metro)",
        );
    }
    for (const line of perfLines.slice(-12)) {
        const json = line
            .slice(line.indexOf("[PERF]") + "[PERF]".length)
            .trim()
            // console.log via logcat can wrap the payload in quotes
            .replace(/^[',]+\s*'?/, "")
            .replace(/'$/, "");
        try {
            console.log(JSON.stringify(JSON.parse(json), null, 2));
        } catch {
            console.log(json);
        }
    }

    console.log("\n== RenderThread frame stats (dumpsys gfxinfo) ==");
    const pkg = resolvePackage();
    if (!pkg) {
        console.log(
            `No running process found for: ${CANDIDATE_PACKAGES.join(", ")}. ` +
                "Launch the app (or set PERF_PACKAGE) and retry.",
        );
        return;
    }
    console.log(`device: ${serial}  package: ${pkg.name}`);
    const KEEP = [
        "Total frames rendered",
        "Janky frames",
        "50th percentile",
        "90th percentile",
        "95th percentile",
        "99th percentile",
        "Number Missed Vsync",
        "Number Slow",
    ];
    for (const line of pkg.gfxinfo.split("\n")) {
        const trimmed = line.trim();
        if (KEEP.some((key) => trimmed.startsWith(key))) {
            console.log(trimmed);
        }
    }
}

if (process.argv.includes("--reset")) {
    const pkg = reset();
    console.log(
        `Cleared ${pkg ? pkg.name + " frame stats and " : ""}logcat on ` +
            `${serial}. Interact with the app, then run again without --reset.`,
    );
} else if (process.argv.includes("--session")) {
    const timeoutS = Number(process.env.PERF_TIMEOUT_S ?? 300);
    reset();
    console.log(
        `Counters cleared on ${serial}. Run the instrumented interaction ` +
            `on the device now (waiting up to ${timeoutS}s for a [PERF] ` +
            "summary)...",
    );
    const deadline = Date.now() + timeoutS * 1000;
    let found = false;
    while (Date.now() < deadline) {
        if (perfLogLines().length > 0) {
            found = true;
            break;
        }
        await sleep(2000);
    }
    if (!found) {
        console.log("\nTimed out waiting for a [PERF] summary.\n");
    } else {
        // Let any immediately-following summaries land too.
        await sleep(1500);
        console.log("");
    }
    report();
    process.exit(found ? 0 : 2);
} else {
    report();
}
