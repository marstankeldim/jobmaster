# Jobmaster Extension

Current version: `0.3.0`

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
- in-page assistant with detect → review → fill → track workflow
- tracker dashboard with job list, status editing, notes, and event timeline
- cover-letter preview generation
- semantic autofill engine with autocomplete/accessibility-first matching
- grouped question handling for radios and checkbox groups
- active-step scanning for Workday and LinkedIn
- page-context fill bridge for stubborn controlled inputs
- built-in AI drafting flow for unresolved custom fields when enabled
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
- The scan now pulls more evidence from labels, legends, `aria-describedby`, nearby prompt text, and common ATS automation/test attributes before falling back to weaker heuristics.
- The new on-page assistant is the recommended workflow: open it from the popup, review the suggested fields, fill high-confidence answers, use `AI Draft` only for unresolved questions, then save or mark the job in the tracker.

## New Workflow

1. Open the job page and click `Open Assistant` in the popup.
2. Review the `Suggested Fields`, `Needs Review`, and `Skipped` sections directly on the page.
3. Click `Fill Suggested` for high-confidence fields.
4. Use `AI Draft` or `Draft Missing with AI` for unresolved custom prompts when you want a model-backed draft grounded in your saved candidate data.
5. Save the job or mark it submitted from the assistant, then use `Open Tracker` for notes, status changes, and history.

## Tracker

- `dashboard.html` is now the tracker surface for the extension.
- It shows:
  - status counts
  - searchable job list
  - per-job notes
  - status editing
  - event timeline
- The popup and on-page assistant both link to the tracker dashboard.

## Built-in AI Drafting

- AI drafting now uses Chrome's built-in Prompt API when available on the machine and browser profile.
- This is intended for unresolved recruiter questions and long-form prompts, not for inventing facts.
- If built-in AI is unavailable on the device, Jobmaster will keep the field in review/skip and show the error in the assistant.
- On older installs, if you do not see AI draft buttons, check Settings and make sure built-in AI drafting is enabled.

## Troubleshooting

- Reload the unpacked extension after each update so the new manifest version is picked up.
- `0.3.0` adds a new `dashboard.html` extension page and an on-page assistant content script, so a full reload matters here.
- Open the popup and check `Last Autofill`:
  - `Filled` means the value was applied.
  - `Needs Review` means Jobmaster found a plausible answer but kept it conservative.
  - `Skipped` means there was no strong enough match or the page refused the fill.
- If a field should have filled but did not, start with `Refresh` in the popup after the application modal/step finishes loading.
- If scan metrics show `visible fields: 0`, `0.2.2` now automatically retries the root container and then the whole document before giving up.
- Workday and LinkedIn are still the highest-variance targets, but the assistant now gives you a safer fallback path than blind autofill.
- Chrome's built-in AI features are device-dependent. If AI drafting is unavailable, the rest of the deterministic scan/fill workflow still works.

## Notes

- Resume upload is stored inside the extension and used for best-effort file autofill.
- Site-specific adapters are stronger than before, but they still need more hardening on real job flows.
- Local replay fixtures live in `extension/test-fixtures/html/`.
- Run the JS autofill core tests with `node --test extension/tests/*.test.mjs`.
