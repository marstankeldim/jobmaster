# Jobmaster Extension

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
- generic autofill engine
- first-pass platform detection for Greenhouse, Lever, Workday, and LinkedIn

## Notes

- Resume upload is stored inside the extension and used for best-effort file autofill.
- Site-specific adapters are an initial pass and will need hardening on real job flows.

