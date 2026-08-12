#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");

const root = path.resolve(__dirname, "..");
const appJsonPath = path.join(root, "app.json");

const ALL_PLATFORMS = ["android", "ios", "web"];

function usage(exitCode = 0) {
    const stream = exitCode === 0 ? process.stdout : process.stderr;
    stream.write(`Usage:
  npm run release:cut
  npm run release:cut -- --version 2.3.0 --platforms android,ios,web
  npm run release:cut -- --version 2.3.0 --platforms android --android-build 84

Options:
  --version <semver>        Marketing version, e.g. 2.3.0
  --platforms <list>        Comma-separated: android, ios, web. Default: prompt.
  --android-build <number>  Android versionCode. Default: current + 1.
  --ios-build <number>      iOS buildNumber. Default: current + 1.
  --web-rc <number>         Web RC number. Default: highest existing
                            release-web-<version>-RC.* tag + 1 (fetch tags first!).
  --help                    Show this help.

This prepares, but does not commit, tag, or push, a release cut. It updates the
Expo config that generates the native projects and bumps the build counters for
selected platforms:

  release-android-<version>-RC.<versionCode>
  release-ios-<version>-RC.<buildNumber>
  release-web-<version>-RC.<n>

Build counters must be greater than their current values. Reusing an Android
versionCode will be rejected by Google Play. Run 'git fetch origin --tags'
beforehand so the web RC default is computed against the latest tags.
`);
    process.exit(exitCode);
}

function parseArgs(argv) {
    const args = {};

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--help" || arg === "-h") usage(0);
        if (arg === "--version") {
            args.version = argv[++i];
            continue;
        }
        if (arg === "--platforms") {
            args.platforms = (argv[++i] ?? "")
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);
            continue;
        }
        if (arg === "--android-build") {
            args.androidBuild = argv[++i];
            continue;
        }
        if (arg === "--ios-build") {
            args.iosBuild = argv[++i];
            continue;
        }
        if (arg === "--web-rc") {
            args.webRc = argv[++i];
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    return args;
}

function validateArgs(args) {
    if (!args.version) throw new Error("--version is required");
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(args.version)) {
        throw new Error(`--version must look like semver, got: ${args.version}`);
    }
    if (!args.platforms || args.platforms.length === 0) {
        throw new Error("--platforms is required");
    }
    for (const platform of args.platforms) {
        if (!ALL_PLATFORMS.includes(platform)) {
            throw new Error(
                `Unknown platform: ${platform} (expected: ${ALL_PLATFORMS.join(", ")})`,
            );
        }
    }
    for (const key of ["androidBuild", "iosBuild", "webRc"]) {
        if (args[key] === undefined) continue;
        if (!/^[1-9]\d*$/.test(args[key])) {
            throw new Error(`--${key} must be a positive integer, got: ${args[key]}`);
        }
        args[key] = Number(args[key]);
    }
    return args;
}

function readAppJson() {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
    appJson.expo = appJson.expo || {};
    appJson.expo.android = appJson.expo.android || {};
    appJson.expo.ios = appJson.expo.ios || {};
    return appJson;
}

function parseBuildNumber(value, name) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(`${name} must be a non-negative integer, got: ${value}`);
    }
    return parsed;
}

function highestWebRc(version) {
    let tags;
    try {
        tags = execFileSync("git", ["tag", "--list", `release-web-${version}-RC.*`], {
            cwd: root,
            encoding: "utf8",
        });
    } catch (_error) {
        return 0;
    }
    let highest = 0;
    for (const tag of tags.split("\n")) {
        const match = tag.match(/-RC\.(\d+)$/);
        if (match) highest = Math.max(highest, Number(match[1]));
    }
    return highest;
}

function currentReleaseValues() {
    const appJson = readAppJson();
    return {
        version: appJson.expo.version,
        androidVersionCode: parseBuildNumber(
            appJson.expo.android.versionCode ?? 0,
            "expo.android.versionCode",
        ),
        iosBuildNumber: parseBuildNumber(
            appJson.expo.ios.buildNumber ?? 0,
            "expo.ios.buildNumber",
        ),
    };
}

async function promptForMissingArgs(args, current) {
    if (args.version && args.platforms) return args;

    console.log(`Current release values:
  version: ${current.version ?? "(unset)"}
  android.versionCode: ${current.androidVersionCode}
  ios.buildNumber: ${current.iosBuildNumber}
`);

    const questions = [];
    if (!args.version) {
        questions.push({
            prompt: `Version [${current.version ?? "1.0.0"}]: `,
            apply: (answer) => {
                args.version = answer || current.version || "1.0.0";
            },
        });
    }
    if (!args.platforms) {
        questions.push({
            prompt: `Platforms (comma-separated) [${ALL_PLATFORMS.join(",")}]: `,
            apply: (answer) => {
                args.platforms = (answer || ALL_PLATFORMS.join(","))
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean);
            },
        });
    }

    if (!process.stdin.isTTY) {
        const answers = fs.readFileSync(0, "utf8").split(/\r?\n/);
        for (const question of questions) {
            const answer = (answers.shift() ?? "").trim();
            process.stdout.write(`${question.prompt}${answer}\n`);
            question.apply(answer);
        }
        return args;
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    try {
        for (const question of questions) {
            question.apply((await rl.question(question.prompt)).trim());
        }
    } finally {
        rl.close();
    }

    return args;
}

function resolveBuildNumbers(args, current) {
    if (args.platforms.includes("android")) {
        args.androidBuild = args.androidBuild ?? current.androidVersionCode + 1;
        if (args.androidBuild <= current.androidVersionCode) {
            throw new Error(
                `--android-build must be greater than current Android versionCode ${current.androidVersionCode}`,
            );
        }
    }
    if (args.platforms.includes("ios")) {
        args.iosBuild = args.iosBuild ?? current.iosBuildNumber + 1;
        if (args.iosBuild <= current.iosBuildNumber) {
            throw new Error(
                `--ios-build must be greater than current iOS buildNumber ${current.iosBuildNumber}`,
            );
        }
    }
    if (args.platforms.includes("web")) {
        args.webRc = args.webRc ?? highestWebRc(args.version) + 1;
    }
    return args;
}

function updateAppJson(args) {
    const appJson = readAppJson();
    appJson.expo.version = args.version;
    if (args.platforms.includes("android")) {
        appJson.expo.android.versionCode = args.androidBuild;
    }
    if (args.platforms.includes("ios")) {
        appJson.expo.ios.buildNumber = String(args.iosBuild);
    }
    fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 4)}\n`);
    try {
        execFileSync("npx", ["prettier", "--write", "app.json"], {
            cwd: root,
            stdio: "ignore",
        });
    } catch (_error) {
        // Formatting is cosmetic; the JSON above is already valid.
    }
}

async function main() {
    let args;
    try {
        args = parseArgs(process.argv.slice(2));
        args = await promptForMissingArgs(args, currentReleaseValues());
        args = validateArgs(args);
        args = resolveBuildNumbers(args, currentReleaseValues());
    } catch (error) {
        console.error(error.message);
        usage(1);
    }

    try {
        updateAppJson(args);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    const summary = [`version ${args.version}`];
    const tags = [];
    if (args.platforms.includes("android")) {
        summary.push(`Android versionCode ${args.androidBuild}`);
        tags.push(`release-android-${args.version}-RC.${args.androidBuild}`);
    }
    if (args.platforms.includes("ios")) {
        summary.push(`iOS buildNumber ${args.iosBuild}`);
        tags.push(`release-ios-${args.version}-RC.${args.iosBuild}`);
    }
    if (args.platforms.includes("web")) {
        summary.push(`web RC ${args.webRc}`);
        tags.push(`release-web-${args.version}-RC.${args.webRc}`);
    }

    console.log(`Updated: ${summary.join(", ")}`);
    console.log(`
Next steps:
  git diff -- app.json
  git add app.json
  git commit -m "Cut release ${args.version} (${args.platforms.join(", ")})"
${tags.map((tag) => `  git tag ${tag}`).join("\n")}
  git push origin main
${tags.map((tag) => `  git push origin tag ${tag}`).join("\n")}
`);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
