# Jobmaster Extension

Current version: `0.2.0`

## Load Unpacked

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `extension/` directory in this repo

## What Works Today

- MV3 extension scaffold
- options page for settings/profile/resume/answers/candidate data/template
- browser-local job tracker
- popup job capture flow
- cover-letter preview generation
- semantic autofill engine with autocomplete/accessibility-first matching
- grouped question handling for radios and checkbox groups
- active-step scanning for Workday and LinkedIn
- page-context fill bridge for stubborn controlled inputs
- first-pass platform adapters for Greenhouse, Lever, Workday, and LinkedIn
- recent scan history with timing, root/step scope, and skipped-field previews
- conservative review queue for medium-confidence matches

## Notes

- Resume upload is stored inside the extension and used for best-effort file autofill.
- Site-specific adapters are an initial pass and will need hardening on real job flows.
- Reload the unpacked extension after each update so the new manifest version is picked up.
- Local replay fixtures live in `extension/test-fixtures/html/`.
- Run the JS autofill core tests with `node --test extension/tests/*.test.mjs`.
