const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const cutReleaseScript = path.join(__dirname, "cut-release.js");

function git(repository, args) {
    return execFileSync("git", args, {
        cwd: repository,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function createReleaseRepository() {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), "cut-release-test-"),
    );
    const repository = path.join(directory, "repository");
    const remote = path.join(directory, "remote.git");
    const bin = path.join(directory, "bin");
    const glabLog = path.join(directory, "glab.log");
    fs.mkdirSync(repository);
    fs.mkdirSync(bin);
    execFileSync("git", ["init", "--bare", remote]);
    git(repository, ["init", "-b", "main"]);
    git(repository, ["config", "user.name", "Release Test"]);
    git(repository, ["config", "user.email", "release-test@example.com"]);
    fs.mkdirSync(path.join(repository, "scripts"));
    fs.copyFileSync(
        cutReleaseScript,
        path.join(repository, "scripts/cut-release.js"),
    );
    fs.writeFileSync(
        path.join(repository, "app.json"),
        `${JSON.stringify(
            {
                expo: {
                    version: "1.0.0",
                    android: { versionCode: 1 },
                    ios: { buildNumber: "1" },
                },
            },
            null,
            4,
        )}\n`,
    );
    git(repository, ["add", "."]);
    git(repository, ["commit", "-m", "Initial commit"]);
    git(repository, ["remote", "add", "origin", remote]);
    git(repository, ["push", "-u", "origin", "main"]);

    const glab = path.join(bin, "glab");
    fs.writeFileSync(
        glab,
        `#!/bin/sh
if [ "$1 $2" = "auth status" ]; then
    exit 0
elif [ "$1 $2" = "mr create" ]; then
    printf '%s\n' "$*" >> "${glabLog}"
    echo "https://gitlab.example.test/project/-/merge_requests/1"
elif [ "$1 $2" = "mr view" ]; then
    sha=$(git rev-parse HEAD)
    git push origin HEAD:main >/dev/null 2>&1
    printf '{"state":"merged","merge_commit_sha":"%s"}\n' "$sha"
else
    exit 1
fi
`,
    );
    fs.chmodSync(glab, 0o755);
    const npx = path.join(bin, "npx");
    fs.writeFileSync(npx, "#!/bin/sh\nexit 1\n");
    fs.chmodSync(npx, 0o755);

    return {
        directory,
        repository,
        glabLog,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    };
}

function runRelease(repository, env, extraArgs = []) {
    return execFileSync(
        process.execPath,
        [
            "scripts/cut-release.js",
            "--version",
            "2.0.0",
            "--platforms",
            "android",
            "--android-build",
            "2",
            ...extraArgs,
        ],
        { cwd: repository, env, encoding: "utf8" },
    );
}

describe("release:cut GitLab workflow", () => {
    test("creates a release branch and tags it after the merge request merges", () => {
        const { directory, repository, glabLog, env } =
            createReleaseRepository();
        try {
            const output = runRelease(repository, env);

            expect(git(repository, ["branch", "--show-current"]).trim()).toBe(
                "release/2.0.0-android.2",
            );
            expect(output).toContain("Waiting for merge request !1");
            expect(output).toContain("Released: version 2.0.0");
            expect(fs.readFileSync(glabLog, "utf8")).toContain(
                "--remove-source-branch",
            );
            expect(
                git(repository, ["ls-remote", "--tags", "origin"]),
            ).toContain("refs/tags/release-android-2.0.0-RC.2");
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    test("uses a non-main current branch when requested", () => {
        const { directory, repository, glabLog, env } =
            createReleaseRepository();
        try {
            git(repository, ["switch", "-c", "feature/release"]);
            runRelease(repository, env, ["--current-branch"]);

            expect(git(repository, ["branch", "--show-current"]).trim()).toBe(
                "feature/release",
            );
            expect(git(repository, ["log", "-1", "--format=%s"]).trim()).toBe(
                "Cut release 2.0.0 (android)",
            );
            expect(fs.readFileSync(glabLog, "utf8")).not.toContain(
                "--remove-source-branch",
            );
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    test("rejects --current-branch on main", () => {
        const { directory, repository, env } = createReleaseRepository();
        try {
            const result = spawnSync(
                process.execPath,
                [
                    "scripts/cut-release.js",
                    "--version",
                    "2.0.0",
                    "--platforms",
                    "android",
                    "--current-branch",
                ],
                { cwd: repository, env, encoding: "utf8" },
            );

            expect(result.status).toBe(1);
            expect(result.stderr).toContain(
                "--current-branch cannot be used on main",
            );
            expect(git(repository, ["log", "-1", "--format=%s"]).trim()).toBe(
                "Initial commit",
            );
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
});
