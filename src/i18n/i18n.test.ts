/*
 * Copyright (c) 2024, Psiphon Inc.
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

import * as fs from "fs";
import i18n from "i18next";
import path from "path";

import i18nService from "@/src/i18n/i18n";

jest.mock("i18next", () => ({
    init: jest.fn(() => ({ languageTag: "fr" })),
}));

describe("i18n service", () => {
    beforeAll(() => {
        i18nService.initI18n();
    });

    test("initializes", () => {
        expect(i18nService.initialized).toBe(true);
    });

    test("uses language provided by findBestLanguageTag", () => {
        expect(i18n.language).toBe("fr");
    });

    test("has en resources", () => {
        expect(i18n.hasResourceBundle("en", "translation")).toBe(true);
    });

    test("has en-XA resources", () => {
        expect(i18n.hasResourceBundle("en-XA", "translation")).toBe(true);
    });

    test("has ar-XB resources", () => {
        expect(i18n.hasResourceBundle("ar-XB", "translation")).toBe(true);
    });

    test("does not initialize twice", () => {
        i18nService.initI18n();
        expect(i18n.init).toHaveBeenCalledTimes(1);
    });

    describe("translation keys only occur once in en", () => {
        const englishStrings = require("./locales/en/translation.json");

        test(`no duplicate keys in en/translation.json`, () => {
            Object.keys(englishStrings).forEach((key) => {
                const count = Object.keys(englishStrings).filter(
                    (k) => k === key,
                ).length;
                expect(count).toBe(1);
            });
        });
    });

    describe("translation keys are valid in", () => {
        const englishStrings = require("./locales/en/translation.json");

        const sourceDir = path.join(__dirname, "../");

        fs.readdirSync(sourceDir, {
            recursive: true,
            encoding: "utf-8",
        }).forEach((file) => {
            // We only want to check .ts and .tsx files that are not *.test.* files
            if (file.match(/\.ts(x?)$/) && !file.match(/\.test\./)) {
                const filePath = path.join(sourceDir, file);
                const fileContent = fs.readFileSync(filePath, "utf8");
                // Regex to match strings that are all uppercase letters and underscores, with a
                // minimum of 2 characters, that contain the string I18N, and that may end with
                // .string, and are surrounded by quotes or backticks. Example:
                // "INVITE_FRIENDS_I18N.string" or `INVITE_FRIENDS_I18N`
                const matches = fileContent.match(
                    /("|'|`)[A-Z_]{2,}I18N(\.string)?("|'|`)/g,
                );

                // Remove the quotes and the .string suffix
                const keys = matches?.map((match) =>
                    match.replace(/("|'|`)/g, "").replace(".string", ""),
                );

                if (keys) {
                    keys.forEach((key) => {
                        test(`key "${key}" in file ${file} exists in translation.json`, () => {
                            expect(englishStrings[key]).toBeDefined();
                        });
                    });
                }
            }
        });
    });
});
