// Re-applies Conduit's Android customizations on every `expo prebuild`.
// Native projects are generated artifacts, so release signing, local AAR
// packaging, E2E/performance variants, manifest merges, and Fastlane all live
// here instead of depending on hand edits under android/.
const fs = require("fs");
const path = require("path");
const {
    withAndroidManifest,
    withAppBuildGradle,
    withDangerousMod,
    withGradleProperties,
} = require("expo/config-plugins");

const FASTLANE_TEMPLATE_DIR = path.join(__dirname, "android-fastlane");

const SIGNING_BLOCK = `
// Release signing: CI writes android/keystore.properties with the Play upload
// key before building. Local builds without it use the generated debug key.
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
def hasReleaseKeystore = keystorePropertiesFile.exists()
if (hasReleaseKeystore) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
`;

const RELEASE_SIGNING_CONFIG = `        if (hasReleaseKeystore) {
            config {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
`;

function patchAppBuildGradle(contents) {
    if (!contents.includes("hasReleaseKeystore")) {
        contents = contents.replace(/\nandroid \{/, `${SIGNING_BLOCK}\nandroid {`);
        contents = contents.replace(
            /(signingConfigs \{\n)([\s\S]*?)(\n    \})/,
            (match, open, body, close) =>
                `${open}${body}\n${RELEASE_SIGNING_CONFIG}${close}`,
        );
        contents = contents.replace(
            /signingConfig signingConfigs\.debug/g,
            "signingConfig hasReleaseKeystore ? signingConfigs.config : signingConfigs.debug",
        );
    }

    if (!contents.includes("conduitE2eDebuggable")) {
        contents = contents.replace(
            /        release \{\n/,
            `        release {
            // RevenueCat Test Store keys require a debuggable E2E release.
            if (findProperty('conduitE2eDebuggable')?.toBoolean() ?: false) {
                debuggable true
            }
            // Performance builds install beside a developer's normal app.
            if (findProperty('conduitPerfApplicationId')?.toBoolean() ?: false) {
                applicationIdSuffix ".perf"
            }
`,
        );
    }

    if (!contents.includes("ca.psiphon.aar")) {
        contents = contents.replace(
            '    implementation("com.facebook.react:react-android")',
            '    implementation("com.facebook.react:react-android")\n    implementation files(rootProject.file("../modules/expo-psiphon-tunnel-core/android/libs/ca.psiphon.aar"))',
        );
    }
    return contents;
}

const GRADLE_PROPERTIES = [
    { key: "android.compileSdkVersion", value: "36" },
    { key: "android.targetSdkVersion", value: "36" },
    { key: "android.enableMinifyInReleaseBuilds", value: "true" },
    { key: "org.gradle.workers.max", value: "2" },
    {
        key: "org.gradle.jvmargs",
        value: "-Xmx3072m -XX:MaxMetaspaceSize=1024m",
    },
];

function withConduitGradleProperties(config) {
    return withGradleProperties(config, (config) => {
        for (const { key, value } of GRADLE_PROPERTIES) {
            const existing = config.modResults.find(
                (item) => item.type === "property" && item.key === key,
            );
            if (existing) {
                existing.value = value;
            } else {
                config.modResults.push({ type: "property", key, value });
            }
        }
        config.modResults = config.modResults.filter(
            (item) =>
                !(item.type === "property" && item.key === "org.gradle.parallel"),
        );
        return config;
    });
}

function withConduitManifest(config) {
    return withAndroidManifest(config, (config) => {
        const manifest = config.modResults.manifest;
        const recordAudio = manifest["uses-permission"]?.find(
            (permission) =>
                permission.$["android:name"] === "android.permission.RECORD_AUDIO",
        );
        if (recordAudio) {
            recordAudio.$["tools:node"] = "remove";
        }

        const app = manifest.application?.[0];
        if (app) {
            app.$["tools:replace"] =
                "android:fullBackupContent,android:dataExtractionRules";
            const mainActivity = app.activity?.find(
                (activity) => activity.$["android:name"] === ".MainActivity",
            );
            const deepLinkFilter = mainActivity?.["intent-filter"]?.find(
                (filter) =>
                    filter.action?.some(
                        (action) =>
                            action.$["android:name"] === "android.intent.action.VIEW",
                    ),
            );
            if (
                deepLinkFilter &&
                !deepLinkFilter.data?.some(
                    (data) => data.$["android:scheme"] === "conduit",
                )
            ) {
                deepLinkFilter.data = deepLinkFilter.data || [];
                deepLinkFilter.data.push({ $: { "android:scheme": "conduit" } });
            }
        }

        manifest.queries = manifest.queries || [{}];
        const queries = manifest.queries[0];
        queries.intent = queries.intent || [];
        const hasRyveQuery = queries.intent.some((intent) =>
            intent.data?.some(
                (data) => data.$["android:scheme"] === "network.ryve.app",
            ),
        );
        if (!hasRyveQuery) {
            queries.intent.push({
                action: [
                    { $: { "android:name": "android.intent.action.VIEW" } },
                ],
                category: [
                    { $: { "android:name": "android.intent.category.BROWSABLE" } },
                ],
                data: [{ $: { "android:scheme": "network.ryve.app" } }],
            });
        }
        return config;
    });
}

function withConduitFastlane(config) {
    return withDangerousMod(config, [
        "android",
        (config) => {
            const fastlaneDir = path.join(
                config.modRequest.platformProjectRoot,
                "fastlane",
            );
            fs.mkdirSync(fastlaneDir, { recursive: true });
            for (const filename of ["Appfile", "Fastfile"]) {
                fs.copyFileSync(
                    path.join(FASTLANE_TEMPLATE_DIR, filename),
                    path.join(fastlaneDir, filename),
                );
            }
            return config;
        },
    ]);
}

module.exports = function withConduitAndroid(config) {
    config = withAppBuildGradle(config, (config) => {
        config.modResults.contents = patchAppBuildGradle(
            config.modResults.contents,
        );
        return config;
    });
    config = withConduitGradleProperties(config);
    config = withConduitManifest(config);
    config = withConduitFastlane(config);
    return config;
};
