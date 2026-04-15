# Jobmaster Extension

Current version: `0.2.4`

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
- scan fallback that widens from active step to root/document if the first scope comes back empty
- profile settings aligned more closely to common application asks like legal name, name parts, education details, preferred location, referral source, and prior-application flags
- yes/no profile fields now use dropdown selections, and graduation year uses a year selector instead of free-text input
- generated answers that synthesize responses from your existing profile and candidate source data instead of relying on a huge duplicate question list

## Autofill Behavior

- `Conservative` now autofills clear high-signal fields like email, phone, many name/address fields, and file uploads more reliably.
- Long-form custom prompts are still biased toward `Needs Review` instead of being pasted blindly.
- The popup now analyzes pages using your saved autofill settings, so adapter toggles and mode changes affect both scan and fill behavior consistently.
- The profile/settings page now stores more of the fields companies commonly ask directly, and the autofill engine derives related answers from those fields plus candidate source data.

## Troubleshooting

- Reload the unpacked extension after each update so the new manifest version is picked up.
- Open the popup and check `Last Autofill`:
  - `Filled` means the value was applied.
  - `Needs Review` means Jobmaster found a plausible answer but kept it conservative.
  - `Skipped` means there was no strong enough match or the page refused the fill.
- If a field should have filled but did not, start with `Refresh` in the popup after the application modal/step finishes loading.
- If scan metrics show `visible fields: 0`, `0.2.2` now automatically retries the root container and then the whole document before giving up.
- Workday and LinkedIn are still the highest-variance targets; some variants will need more adapter tuning against live pages.

## Notes

- Resume upload is stored inside the extension and used for best-effort file autofill.
- Site-specific adapters are an initial pass and will need hardening on real job flows.
- Local replay fixtures live in `extension/test-fixtures/html/`.
- Run the JS autofill core tests with `node --test extension/tests/*.test.mjs`.
