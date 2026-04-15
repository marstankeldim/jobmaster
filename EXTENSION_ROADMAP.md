# Jobmaster Chrome Extension Roadmap

## Goal

Turn Jobmaster from a local Python web app into a Chrome extension where:

- the current Settings experience becomes the extension's options/settings page
- application tracking lives in the browser
- autofill runs directly on job sites through content scripts
- cover-letter and summary generation use the same candidate data model
- applying to jobs feels like "detect page, review answers, fill, track"

## Best Approach

The best path is **not** to wrap the Python app inside Chrome.

The best path is to:

1. Keep the current Python app as a product prototype and behavior reference.
2. Rebuild the product as a **Chrome Extension Manifest V3 app** using JavaScript or TypeScript.
3. Port your current logic module-by-module:
   - storage model
   - summary generation
   - cover-letter rendering
   - field matching and autofill
4. Treat the current web UI as the blueprint for the extension's options page.

This is the right approach because Chrome extensions need:

- `chrome.storage` or IndexedDB instead of local Python files/SQLite
- content scripts instead of Playwright for page interaction
- a background service worker instead of a Python server
- browser-native file handling for resume uploads

## Recommended Architecture

Use a **Manifest V3 extension** with four main surfaces:

### 1. Options Page

This replaces your current `/settings` page.

It should contain:

- profile
- resume upload/reference
- recruiter answers
- candidate source data
- generated professional summary
- LaTeX cover-letter template
- import/export

### 2. Popup

This is the quick control center when you click the extension icon.

It should show:

- detected company/job title/url from current tab
- whether the page looks like Greenhouse, Lever, Workday, LinkedIn, etc.
- quick actions:
  - save job
  - generate cover letter
  - autofill page
  - mark applied
  - open settings

### 3. Content Scripts

These run on job pages and do the actual autofill.

Responsibilities:

- detect form fields
- identify job platform
- match labels/questions to stored answers
- fill text/select/radio/checkbox/file fields
- inject a lightweight review UI on the page
- optionally confirm before submit

### 4. Background Service Worker

This coordinates everything.

Responsibilities:

- store and retrieve data
- react to tab changes/navigation
- parse job metadata from current page
- manage imports/exports
- coordinate popup <-> content script <-> options page messaging

## What To Port From The Current App

### Keep the data model

Your current data model is already the right foundation:

- `profile`
- `answers`
- `candidate_sources`
- `cover_letter_template`
- `jobs`
- `events`

These should become shared TypeScript interfaces.

### Keep the autofill heuristics

[jobmaster/autofill.py](/Users/ayan/Documents/cmpsc/jobmaster/jobmaster/autofill.py) already has the important matching ideas:

- field scanning
- label normalization
- answer matching
- select-option matching
- resume field handling

That logic should be rewritten in TypeScript and run inside content scripts.

### Keep the generation logic

[jobmaster/summary.py](/Users/ayan/Documents/cmpsc/jobmaster/jobmaster/summary.py) and [jobmaster/cover_letters.py](/Users/ayan/Documents/cmpsc/jobmaster/jobmaster/cover_letters.py) should be ported almost directly to shared browser-side modules.

### Do not port the Python web server

[jobmaster/web.py](/Users/ayan/Documents/cmpsc/jobmaster/jobmaster/web.py) is useful as a UI and workflow reference, but the server itself should not be carried into the extension.

## Storage Strategy

Use a layered browser storage model:

### `chrome.storage.local`

Use for:

- profile
- answers
- candidate source data
- settings
- lightweight job records

### IndexedDB

Use for:

- application tracker
- event history
- larger generated assets
- cached page analysis
- future AI output history

### Downloads / File references

For resume handling:

- store metadata in extension storage
- store the uploaded resume as a `Blob` in IndexedDB, or
- store an imported file snapshot if you want extension-local portability

Important note:

Chrome extensions cannot always reuse arbitrary filesystem paths like the Python app does. The extension should own the uploaded resume data.

## Product Phases

### Phase 1: Extension Foundation

Goal: get the app skeleton working.

Build:

- `manifest.json`
- options page
- popup
- background service worker
- shared types
- storage wrapper

Deliverable:

- extension loads unpacked
- settings persist
- popup opens

### Phase 2: Settings Page Migration

Goal: move everything useful from the current Settings page into extension UI.

Build:

- profile editor
- recruiter answers editor
- candidate source data editor
- resume upload
- LaTeX template editor
- summary generation button
- import/export JSON

Deliverable:

- everything under current Python settings is available in extension settings

### Phase 3: Tracker Migration

Goal: move jobs/events tracking into the extension.

Build:

- jobs list page
- job detail view
- event history
- status updates
- quick-save current job from popup

Deliverable:

- extension can track saved/applied/interview/etc. without the Python app

### Phase 4: Generic Autofill

Goal: replicate current Playwright behavior in content scripts.

Build:

- DOM field scanner
- matcher for profile + answer bank
- fill engine for input/select/textarea/radio/checkbox
- resume upload handling
- preview/confirm before filling

Deliverable:

- works on simple HTML forms and easier ATS pages

### Phase 5: Site-Specific Adapters

Goal: make autofill reliable on common job sites.

Build adapters for:

- Greenhouse
- Lever
- Workday
- LinkedIn Easy Apply

Each adapter should provide:

- platform detection
- field mapping overrides
- navigation helpers
- safe submit rules

Deliverable:

- much better fill quality on real sites

### Phase 6: Smart Workflow Features

Goal: make the extension feel like a job-application assistant, not just a form filler.

Build:

- auto-detect job metadata from active page
- suggest whether to save this job
- generate job-specific cover letters
- generate job-specific summaries if needed
- duplicate application detection
- reminders/follow-up prompts

Deliverable:

- a full browser-native application workflow

## Suggested Tech Stack

Recommended stack:

- TypeScript
- Vite
- React
- Chrome Manifest V3
- IndexedDB via Dexie
- Zod for runtime validation

Why this stack:

- fast local iteration
- strong typing for shared data models
- easier options/popup UI development
- safer migrations over time

## Folder Structure Recommendation

```text
extension/
  manifest.json
  src/
    background/
      service-worker.ts
    content/
      main.ts
      platforms/
        greenhouse.ts
        lever.ts
        workday.ts
        linkedin.ts
      autofill/
        scanner.ts
        matcher.ts
        filler.ts
    popup/
      index.html
      main.tsx
    options/
      index.html
      main.tsx
    shared/
      types.ts
      storage.ts
      summary.ts
      coverLetters.ts
      jobs.ts
      parsing.ts
```

## Migration Mapping From Current Code

- `jobmaster/storage.py` -> `shared/storage.ts`
- `jobmaster/summary.py` -> `shared/summary.ts`
- `jobmaster/cover_letters.py` -> `shared/coverLetters.ts`
- `jobmaster/autofill.py` -> `content/autofill/*`
- `jobmaster/web.py` settings UI -> `options/*`
- `jobmaster/db.py` -> `shared/jobs.ts` + IndexedDB schema

## Biggest Risks

### Resume upload handling

Browser security makes file autofill trickier than local scripts. Design around extension-owned uploads instead of absolute file paths.

### Workday and LinkedIn complexity

These flows are not just forms. They often need platform-specific handling and step-by-step automation.

### Service worker lifecycle

Manifest V3 service workers are ephemeral. Keep critical state in storage, not memory.

### Permissions scope

Do not request broad permissions too early. Start narrow, then add host permissions intentionally.

## Recommended Build Order

If we want the fastest path to something real:

1. Create the MV3 extension scaffold.
2. Build the options page from the current settings page.
3. Port storage/types first.
4. Port summary and cover-letter generation.
5. Build popup job capture.
6. Port generic autofill scanner/matcher.
7. Add Greenhouse and Lever first.
8. Add Workday and LinkedIn after the generic engine is stable.

This order gets you a usable extension early, instead of spending weeks on the hardest autofill cases first.

## Recommendation

The best approach is:

- use the current Python app as the spec
- rebuild as a real MV3 extension in TypeScript
- make the current Settings page the extension options page first
- move storage and generation logic before advanced autofill
- treat site-specific adapters as a second wave, not day-one scope

## Next Step

The most valuable next implementation step is:

**scaffold the Chrome extension and migrate the current Settings page into an options page with browser storage.**

That gives you a real extension shell while preserving almost everything you've already learned.

