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
