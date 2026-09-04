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
  --web-rc <number>         Web RC number. Default: the selected Android or iOS
                            build number; for web-only cuts, the next global RC.
  --current-branch          Use the current branch for the merge request instead
                            of creating a release branch. Rejected on main.
  --help                    Show this help.

This updates the Expo config, commits and pushes the release cut, opens a merge
request, waits for it to merge, and tags the resulting commit:

  release-android-<version>-RC.<versionCode>
  release-ios-<version>-RC.<buildNumber>
  release-web-<version>-RC.<n>

Build counters must be greater than their current values. Reusing an Android
versionCode will be rejected by Google Play. Run 'git fetch origin --tags'
beforehand so web-only cuts use the latest release-candidate number.
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
        if (arg === "--current-branch") {
            args.currentBranch = true;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    return args;
}

function validateArgs(args) {
    if (!args.version) throw new Error("--version is required");
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(args.version)) {
        throw new Error(
            `--version must look like semver, got: ${args.version}`,
        );
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
            throw new Error(
                `--${key} must be a positive integer, got: ${args[key]}`,
            );
        }
        args[key] = Number(args[key]);
    }
    return args;
}

function normalizeAppJson(contents) {
    const appJson = JSON.parse(contents);
    appJson.expo = appJson.expo || {};
    appJson.expo.android = appJson.expo.android || {};
    appJson.expo.ios = appJson.expo.ios || {};
    return appJson;
}

function readAppJson() {
    return normalizeAppJson(fs.readFileSync(appJsonPath, "utf8"));
}

function readAppJsonAtRef(ref) {
    return normalizeAppJson(
        execFileSync("git", ["show", `${ref}:app.json`], {
            cwd: root,
            encoding: "utf8",
        }),
    );
}

function parseBuildNumber(value, name) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(
            `${name} must be a non-negative integer, got: ${value}`,
        );
    }
    return parsed;
}

function highestReleaseRc() {
    let tags;
    try {
        tags = execFileSync("git", ["tag", "--list", "release-*-RC.*"], {
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

function releaseValues(appJson) {
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

function currentReleaseValues() {
    return releaseValues(readAppJson());
}

function releaseValuesAtRef(ref) {
    return releaseValues(readAppJsonAtRef(ref));
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
        args.webRc =
            args.webRc ??
            args.androidBuild ??
            args.iosBuild ??
            Math.max(
                current.androidVersionCode,
                current.iosBuildNumber,
                highestReleaseRc(),
            ) + 1;
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

function currentGitBranch() {
    return execFileSync("git", ["branch", "--show-current"], {
        cwd: root,
        encoding: "utf8",
    }).trim();
}

function requireCleanWorkingTree() {
    const status = execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
    });
    if (status.trim()) {
        throw new Error(
            "release:cut requires a clean working tree; commit or stash changes first",
        );
    }
}

function requireGitLabAuthentication() {
    try {
        execFileSync("glab", ["auth", "status"], {
            cwd: root,
            stdio: "inherit",
        });
    } catch (_error) {
        throw new Error(
            "glab authentication is required before cutting a release",
        );
    }
}

function releaseDetails(args) {
    const summary = [`version ${args.version}`];
    const tags = [];
    const branchParts = [];
    if (args.platforms.includes("android")) {
        summary.push(`Android versionCode ${args.androidBuild}`);
        tags.push(`release-android-${args.version}-RC.${args.androidBuild}`);
        branchParts.push(`android.${args.androidBuild}`);
    }
    if (args.platforms.includes("ios")) {
        summary.push(`iOS buildNumber ${args.iosBuild}`);
        tags.push(`release-ios-${args.version}-RC.${args.iosBuild}`);
        branchParts.push(`ios.${args.iosBuild}`);
    }
    if (args.platforms.includes("web")) {
        summary.push(`web RC ${args.webRc}`);
        tags.push(`release-web-${args.version}-RC.${args.webRc}`);
        branchParts.push(`web.${args.webRc}`);
    }
    return {
        summary,
        tags,
        releaseBranch: `release/${args.version}-${branchParts.join("-")}`,
    };
}

function runGit(args, options = {}) {
    return execFileSync("git", args, {
        cwd: root,
        stdio: "inherit",
        ...options,
    });
}

function createMergeRequest(branch, removeSourceBranch) {
    const createArgs = [
        "mr",
        "create",
        "--fill",
        "--source-branch",
        branch,
        "--target-branch",
        "main",
        "--yes",
    ];
    if (removeSourceBranch) createArgs.push("--remove-source-branch");
    const output = execFileSync("glab", createArgs, {
        cwd: root,
        encoding: "utf8",
        stdio: ["inherit", "pipe", "inherit"],
    });
    process.stdout.write(output);
    const id = output.match(/\/merge_requests\/(\d+)/)?.[1];
    if (!id) {
        throw new Error("Could not determine the created merge request ID");
    }
    return id;
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForMerge(mergeRequestId) {
    console.log(`Waiting for merge request !${mergeRequestId} to be merged...`);
    for (;;) {
        const mergeRequest = JSON.parse(
            execFileSync(
                "glab",
                ["mr", "view", mergeRequestId, "--output", "json"],
                {
                    cwd: root,
                    encoding: "utf8",
                },
            ),
        );
        const state = String(mergeRequest.state).toLowerCase();
        if (state === "merged") {
            return (
                mergeRequest.merge_commit_sha ??
                mergeRequest.mergeCommitSha ??
                mergeRequest.squash_commit_sha ??
                mergeRequest.squashCommitSha
            );
        }
        if (state === "closed") {
            throw new Error("Merge request was closed without being merged");
        }
        await delay(10_000);
    }
}

function tagMergedRelease(tags, mergeCommit) {
    if (!mergeCommit) {
        throw new Error(
            "GitLab did not report the merged commit SHA; refusing to tag origin/main",
        );
    }
    runGit(["fetch", "origin", "main"]);
    try {
        execFileSync(
            "git",
            ["merge-base", "--is-ancestor", mergeCommit, "origin/main"],
            {
                cwd: root,
                stdio: "ignore",
            },
        );
    } catch (_error) {
        throw new Error(
            `Merged commit ${mergeCommit} is not present on origin/main; refusing to tag`,
        );
    }
    for (const tag of tags) runGit(["tag", tag, mergeCommit]);
    runGit(["push", "origin", ...tags.map((tag) => `refs/tags/${tag}`)]);
}

async function main() {
    let args;
    let branch;
    let current;
    try {
        args = parseArgs(process.argv.slice(2));
        requireCleanWorkingTree();
        branch = currentGitBranch();
        if (!branch)
            throw new Error("release:cut cannot run from detached HEAD");
        if (args.currentBranch && branch === "main") {
            throw new Error("--current-branch cannot be used on main");
        }
        requireGitLabAuthentication();
        if (args.currentBranch) {
            runGit(["fetch", "origin", "--tags"]);
            current = currentReleaseValues();
        } else {
            runGit(["fetch", "origin", "main", "--tags"]);
            current = releaseValuesAtRef("origin/main");
        }
        args = await promptForMissingArgs(args, current);
        args = validateArgs(args);
        args = resolveBuildNumbers(args, current);
    } catch (error) {
        console.error(error.message);
        usage(1);
    }

    const { summary, tags, releaseBranch } = releaseDetails(args);
    if (!args.currentBranch) {
        try {
            runGit(["switch", "-c", releaseBranch, "origin/main"]);
            branch = releaseBranch;
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }
    }

    try {
        updateAppJson(args);
        runGit(["add", "app.json"]);
        runGit([
            "commit",
            "-m",
            `Cut release ${args.version} (${args.platforms.join(", ")})`,
        ]);
        runGit(["push", "-u", "origin", branch]);
        const mergeRequestId = createMergeRequest(branch, !args.currentBranch);
        const mergeCommit = await waitForMerge(mergeRequestId);
        tagMergedRelease(tags, mergeCommit);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    console.log(`Released: ${summary.join(", ")}`);
    console.log(`Tags: ${tags.join(", ")}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
