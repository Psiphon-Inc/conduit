# i18n

⚠️ **Important Notes:**
- Lint checks only verify Android translations
- React Native (Conduit core) translations are not verified

## Setup
1. Create `transifex_api_token` file in this directory (this file is gitignored)
2. Place your Transifex API token in this file

## Workflow Steps

1. Pull translations:
```bash
uv run transifex_pull.py
```

2. Check translation quality:
```bash
cd ../android
./gradlew lint
```

3. If lint fails:
   - Fix or delete problematic translations
   - Rerun lint until it passes
   - Then try building the app

4. If all checks pass, commit the changes