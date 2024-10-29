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


import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { findBestLanguageTag } from "react-native-localize";

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

class i18nService {
    initialized = false;

    initI18n() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        // Find best available language
        const bestLanguageTag = findBestLanguageTag(
            Object.keys(resources),
        )?.languageTag;

        // The app has to be restarted to change the language
        i18n.use(initReactI18next).init({
            compatibilityJSON: "v3",
            lng: bestLanguageTag,
            fallbackLng: "en",
            resources: resources,
            interpolation: {
                escapeValue: false,
            },
        });
    }
}

export default new i18nService();
