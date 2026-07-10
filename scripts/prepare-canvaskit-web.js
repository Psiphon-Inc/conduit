#!/usr/bin/env node

const { copyFileSync, mkdirSync } = require("node:fs");
const { dirname, join } = require("node:path");

const projectRoot = join(__dirname, "..");
const sourcePath = require.resolve(
    "canvaskit-wasm/bin/full/canvaskit.wasm",
);
const outputPath = join(
    projectRoot,
    "public",
    "canvaskit",
    "canvaskit.wasm",
);

mkdirSync(dirname(outputPath), { recursive: true });
copyFileSync(sourcePath, outputPath);
