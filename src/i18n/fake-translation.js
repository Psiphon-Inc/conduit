"use strict";

import { promises as fs } from "fs";
const path = require("path");
const pseudo = require("./pseudo").PSEUDO;

// englishLines will hold the contents of the English translation file. xaLines and
// xbLines will hold the contents of the en-xa and ar-xb translation files, which are
// pseudolocales used for testing.
let englishLines,
    xaLines = {},
    xbLines = {};

async function getEnglishLines() {
    const data = await fs.readFile(
        path.resolve(__dirname, "locales/en/translation.json"),
        (err, _) => {
            if (err) throw err;
        },
    );
    englishLines = JSON.parse(data);
}

async function processTranslationFiles() {
    for (let translationItem in englishLines) {
        // Add the strings from englishLines to xaLines and xbLines and translate using the
        // corresponding pseudolocale function.
        xaLines[translationItem] = {
            string: pseudo["xa"].translate(
                englishLines[translationItem].string,
            ),
        };
        xbLines[translationItem] = {
            string: pseudo["xb"].translate(
                englishLines[translationItem].string,
            ),
        };
    }

    // Write the xa and xb lines to their respective files
    await fs.writeFile(
        path.resolve(__dirname, "locales/en-xa/translation.json"),
        JSON.stringify(xaLines, null, 2) + "\n",
        (err) => {
            if (err) throw err;
        },
    );
    await fs.writeFile(
        path.resolve(__dirname, "locales/ar-xb/translation.json"),
        JSON.stringify(xbLines, null, 2) + "\n",
        (err) => {
            if (err) throw err;
        },
    );
}

async function main() {
    await getEnglishLines();
    await processTranslationFiles();
}

main();
