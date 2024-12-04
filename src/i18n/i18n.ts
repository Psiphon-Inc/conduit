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

import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import translationXB from "@/src/i18n/locales/ar-xb/translation.json";
import translationXA from "@/src/i18n/locales/en-xa/translation.json";
import translationEN from "@/src/i18n/locales/en/translation.json";

const resources = {
    en: {
        translation: translationEN,
    },
    // en-XA and ar-XB are Pseudolocales for testing.
    "en-XA": {
        translation: translationXA,
    },
    "ar-XB": {
        translation: translationXB,
    },
};

// return available language if found or empty string
function findMatching(language: string): string {
    const available = Object.keys(resources);
    for (let i = 0; i < available.length; i++) {
        if (available[i] === language) {
            return available[i];
        }
    }
    return "";
}

// loop through phone locales looking for matching languages
function findBestLanguage(): { languageTag: string; languageCode: string } {
    const locales = getLocales();

    let languageTag: string;
    let languageCode: string;
    for (let i = 0; i < locales.length; i++) {
        // loop through available looking for either a matching tag or code for `lng`
        languageTag = findMatching(locales[i].languageTag);
        if (locales[i].languageCode !== null) {
            if (languageTag !== "") {
                // if we have a language code and found a matching tag, search for a matching code for fallbackLng
                languageCode = findMatching(locales[i].languageCode || "");
                return { languageTag, languageCode };
            } else {
                // if we didn't find a tag, see if we can match the code
                languageTag = findMatching(locales[i].languageCode || "");
                // can't have a fallback for a base code, so we return empty for languageCode
                return { languageTag, languageCode: "" };
            }
        } else {
            // no code available, no match, return the tag we found or go to next phone locale
            if (languageTag !== "") {
                return { languageTag, languageCode: "" };
            }
        }
    }
    // if we find nothing, we explicitly return blank
    return { languageTag: "", languageCode: "" };
}

class i18nService {
    initialized = false;

    initI18n() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        const { languageTag, languageCode } = findBestLanguage();

        // The app has to be restarted to change the language
        i18n.use(initReactI18next).init({
            compatibilityJSON: "v3",
            lng: languageTag || "en", // Default en
            fallbackLng: languageCode || "en", // Default en
            resources: resources,
            interpolation: {
                escapeValue: false,
            },
        });
    }
}

export default new i18nService();
