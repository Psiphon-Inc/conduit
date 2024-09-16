# Internationalization

This project uses the react-i18next package for string localization and the react-native-localize package for retrieving device information about the user's preferred languages.

## String Localization

To localize a string within the project:

### Import

Import and initialize the translation function in the component that contains the string to be translated.

```
import {useTranslation} from 'react-i18next';

```

```
const {t} = useTranslation();
```

### Replace string

Replace the string that is to be translated with a key which will be used to reference the string in the JSON translations file, followed by `.string`. Wrap the key in the translator function

```
<Text>
    Sign in
</Text>
```

Should become

```
<Text>
    {t("SIGN_IN_I18N.string")}
</Text>
```

The key should be a unique string that identifies the message and follows the MACRO_CASE naming convention, and should end in I18N to make searching the project for all translation strings easy.

### Add to JSON file

Add the key and string to `locales/en/translation.json` and include a developer_comment that explains the meaning of the string to translators.

```
"SIGN_IN_I18N": {
    "string": "Sign in",
    "developer_comment": "Title for the button where the user can sign in."
},
```

We are using this format so that the file can be uploaded to Transifex for translation, and we can provide additional information or context to the translators. More information about the JSON formatting options for Transifex can be found [here](https://help.transifex.com/en/articles/6220899-structured-json)

### Generate Pseudolocales

`node i18n/fake-translations.js`

## Pseudolocales

Pseudolocales are locales that are designed to simulate characteristics of languages that cause UI and layout related changes while still being readable in english. They are useful for testing app localization because they make obvious untranslated text and UI or layout related issues that might not be evident in other locales.

### Android Pseudolocales

There are two Pseudolocales available on Android OS, en-XA which is the accented package, and ar-XB which is the mirrored package. In order to test this application with these Pseudolocales, we have generated xa and xb translation.json files which contain the accented or mirrored strings. Each Pseudolocale can be enabled in the Android Settings on the phone, and our custom generated translation.json files will be used.

#### en-XA

Our pseudolocale generator creates en-XA strings by modifying the english strings to have additional characters and accents added. This is useful to simulate the use of various accents that might be uncommon in english, and to test the UI with longer strings as the same text translated into different locales will have different lengths. Both the accents and longer strings will help to make potential UI issues evident.

#### ar-XB

Our pseudolocale generator creates ar-XB strings by modifying the english strings to replace characters with mirrored/flipped versions of themselves and give the text a RTL direction. This is useful to simulate RTL text and view the app in an RTL layout to identify potential layout issues.

### Pseudolocale Generator

The pseudolocale strings for en-XA and ar-XB are generated from `fake-translations.js` and `pseudo.js`.

When strings are added or changed, this `node i18n/fake-translations.js` should be run to create the corresponding Pseudolocale strings.

The script copies all translation objects from `en/translations.json` into `en-xa/translations/json` and `ar-xb/translations.json` and runs the pseudo function from `pseudo.js` which modifies the string appropriately.

### iOS Pseudolocales

iOS does not offer language tags that can be used for Pseudolocale testing. The only available language tags from the iOS settings all correspond to real languages. For now, there is no way to test Pseudolocales on iOS.
