#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

/**
 * Script to convert relative imports to absolute imports using @/src/ path alias
 * This script processes all .ts and .tsx files in the src directory
 */

const SRC_DIR = path.join(__dirname, "..", "src");

function getAllTsFiles(dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...getAllTsFiles(fullPath));
        } else if (
            entry.isFile() &&
            (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
        ) {
            files.push(fullPath);
        }
    }

    return files;
}

function convertImportsInFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const fileDir = path.dirname(filePath);
    let modified = false;

    // Match import statements with relative paths
    // Handles: import ... from "./path" or "../path"
    const importRegex =
        /^(import\s+(?:[\s\S]*?)\s+from\s+['"])(\.\.?\/[^'"]+)(['"];?)$/gm;

    const newContent = content.replace(
        importRegex,
        (match, prefix, importPath, suffix) => {
            // Skip if it's already an absolute import
            if (importPath.startsWith("@/")) {
                return match;
            }

            // Skip non-relative imports
            if (!importPath.startsWith("./") && !importPath.startsWith("../")) {
                return match;
            }

            // Resolve the absolute path
            const absolutePath = path.resolve(fileDir, importPath);

            // Check if the resolved path is within the src directory
            if (!absolutePath.startsWith(SRC_DIR)) {
                // Keep imports outside src directory as relative
                return match;
            }

            // Convert to @/src/ format
            const relativePath = path.relative(SRC_DIR, absolutePath);
            const normalizedPath = relativePath.split(path.sep).join("/");
            const absoluteImport = `@/src/${normalizedPath}`;

            modified = true;
            return `${prefix}${absoluteImport}${suffix}`;
        },
    );

    if (modified) {
        fs.writeFileSync(filePath, newContent, "utf8");
        console.log(
            `✓ Converted imports in: ${path.relative(process.cwd(), filePath)}`,
        );
        return true;
    }

    return false;
}

function main() {
    console.log("Converting relative imports to absolute imports...\n");

    const files = getAllTsFiles(SRC_DIR);
    let convertedCount = 0;

    for (const file of files) {
        if (convertImportsInFile(file)) {
            convertedCount++;
        }
    }

    console.log(`\n✓ Processed ${files.length} files`);
    console.log(`✓ Converted imports in ${convertedCount} files`);
}

main();
