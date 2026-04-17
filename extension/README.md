# Jobmaster Extension

Current version: `0.3.1`

## Load Unpacked

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `extension/` directory in this repo

## Done

- MV3 extension scaffold with popup, settings, on-page assistant, and tracker dashboard
- browser-local tracker with statuses, notes, and event history
- semantic autofill with review states, resume upload, and cover-letter download
- first-pass adapters for Workday, LinkedIn, Greenhouse, and Lever
- built-in AI draft flow for unresolved questions when Chrome supports it

## Workflow

1. Open a job page.
2. Use `Open Assistant` from the popup.
3. Review suggested, review, and skipped fields on the page.
4. Fill high-confidence answers, use AI draft when needed, then save or mark the job in the tracker.

## Next

- improve live ATS reliability, especially Workday and LinkedIn variants
- tune scan quality for custom widgets and multi-step forms
- make generated answers more targeted to each company and prompt
- keep expanding tracker workflows beyond save and submit

## Notes

- Reload the unpacked extension after each update.
- Chrome AI drafting depends on device/browser support.
- Run tests with `node --test extension/tests/*.test.mjs`.
