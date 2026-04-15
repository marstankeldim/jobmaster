# Jobmaster Extension Scan Optimization Plan

## Goal

Make page scanning and autofill:

- much faster
- more accurate
- less noisy on large pages
- more reliable on ATS platforms like Workday, LinkedIn, Greenhouse, and Lever

## What Is Slow Right Now

From the current extension code:

- [extension/src/popup/popup.js](/Users/ayan/Documents/cmpsc/jobmaster/extension/src/popup/popup.js) calls `analyzeCurrentPage()` repeatedly for multiple popup actions.
- [extension/src/content/autofill.js](/Users/ayan/Documents/cmpsc/jobmaster/extension/src/content/autofill.js) scans **every** `input`, `textarea`, and `select` on the page every time autofill runs.
- `getFieldLabel()` does repeated DOM walks and `querySelectorAll(label[for=...])` lookups per field.
- `isVisible()` forces layout work with `getBoundingClientRect()` and `getComputedStyle()` for every element.
- answer matching recompares lots of regexes and strings for every field with no caching.
- platform detection is shallow, so generic scanning kicks in too often and touches too much DOM.

## Main Problems

### 1. Too much DOM work

The scanner does a full-page pass and performs expensive visibility and label lookups for each field.

### 2. No caching

The popup rescans metadata repeatedly, and the content script does not reuse previous scan results.

### 3. Generic scanning is too broad

We scan the whole document instead of narrowing to likely application containers.

### 4. Matching is not structured enough

Question matching is mostly string heuristics. It works, but it is not using a normalized field taxonomy first.

### 5. No observability

We don’t currently measure:

- scan time
- number of scanned fields
- number of candidate fields ignored
- match confidence
- platform-specific failure reasons

## Best Approach

Optimize in this order:

1. Reduce how much of the DOM we scan.
2. Cache analysis and scan results.
3. Build a field taxonomy layer before answer matching.
4. Add site-specific extraction paths earlier.
5. Add instrumentation so we know what improved.

This order gives the biggest performance gain first and also improves quality.

## Phase 1: Fast Wins

### A. Cache active-tab analysis in the popup

Problem:

- `popup.js` calls `analyzeCurrentPage()` on open and again before multiple actions.

Change:

- cache the last analysis result per tab ID + URL
- reuse it unless the URL changed or the user clicks a manual refresh button

Expected result:

- popup actions feel immediate
- less repeated message passing

### B. Scan only likely application containers

Problem:

- `scanFields(document)` scans the full page

Change:

- add `findApplicationRoot()` that tries:
  - `form`
  - `[data-automation-id*='apply']`
  - `.application, .jobs-apply, .apply-form`
  - platform-specific roots
- scan only that subtree
- fall back to `document` only if no likely root is found

Expected result:

- dramatically fewer elements to inspect

### C. Build a label index once

Problem:

- `getFieldLabel()` queries labels repeatedly for each field

Change:

- build a `Map<inputId, labelText[]>` once at scan start
- reuse it for all fields

Expected result:

- fewer repeated DOM queries

### D. Cheap visibility first, expensive visibility second

Problem:

- `getBoundingClientRect()` and `getComputedStyle()` are called for every field

Change:

- first reject obvious hidden fields using:
  - `type="hidden"`
  - `hidden`
  - `aria-hidden="true"`
  - disabled ancestors
- only run expensive visibility checks on the remaining candidates

Expected result:

- lower layout/computation cost

## Phase 2: Better Matching

### A. Introduce a normalized field taxonomy

Before trying freeform answer matching, classify fields into canonical buckets:

- `full_name`
- `preferred_name`
- `email`
- `phone`
- `location`
- `address_line_1`
- `address_line_2`
- `city`
- `state_region`
- `postal_code`
- `country`
- `linkedin`
- `github`
- `website`
- `resume`
- `cover_letter`
- `work_authorization`
- `sponsorship`
- `salary_expectation`
- `start_date`
- `work_preference`
- `gender`
- `veteran_status`
- `disability_status`
- `race_ethnicity`

Change:

- add a `classifyField(field)` step
- use aliases, autocomplete hints, input type, and platform metadata
- only fall back to fuzzy matching if classification fails

Expected result:

- faster matching
- more consistent fill quality

### B. Compile matching rules once

Problem:

- regex patterns are recreated or tested repeatedly

Change:

- precompile profile matchers and answer-bank aliases once per autofill run
- normalize all profile values once

Expected result:

- less repeated CPU work

### C. Add confidence scoring

Change:

- every matched field gets:
  - `confidence`
  - `source`
  - `taxonomyKey`

Use:

- high-confidence fields autofill immediately
- medium-confidence fields autofill only in review mode
- low-confidence fields remain skipped

Expected result:

- fewer wrong fills

## Phase 3: Platform-Specific Improvements

### A. Promote adapters earlier in the pipeline

Current problem:

- platform detection exists, but scanning still behaves too generically

Change:

- each adapter should provide:
  - `findRoot(document)`
  - `extractJob(document)`
  - `scanFields(root)`
  - `classifyField(field)`

Priority order:

1. Greenhouse
2. Lever
3. Workday
4. LinkedIn Easy Apply

Expected result:

- smaller scan scope
- better labels
- less guesswork

### B. Handle multi-step forms explicitly

Problem:

- Workday and LinkedIn are often step-based, not single-form

Change:

- detect current step
- scan only visible step container
- support “fill current step” instead of “scan whole page”

Expected result:

- much better behavior on real ATS flows

## Phase 4: Reliability and UX

### A. Add a scan preview panel

Show in popup or injected page UI:

- fields found
- taxonomy classification
- answer source
- confidence
- skipped reason

Expected result:

- easier debugging
- easier user trust

### B. Add a “refresh scan” button

Useful after:

- modal opens
- user clicks “Apply”
- next step loads dynamically

Expected result:

- less stale scanning on dynamic apps

### C. Add mutation-aware rescanning

Change:

- watch the application root with `MutationObserver`
- debounce rescans
- invalidate cached scan results only when the apply form meaningfully changes

Expected result:

- good support for dynamic UI without constant rescanning

## Phase 5: Instrumentation

Add internal metrics for every autofill run:

- `scanDurationMs`
- `fieldCountRaw`
- `fieldCountVisible`
- `fieldCountMatched`
- `fieldCountFilled`
- `fieldCountSkipped`
- `platform`
- `rootSelectorUsed`
- `matchBreakdown`

Store recent debug entries in extension storage.

Expected result:

- we can optimize based on real evidence

## Concrete Refactor Plan

### Step 1

Refactor [extension/src/content/autofill.js](/Users/ayan/Documents/cmpsc/jobmaster/extension/src/content/autofill.js) into:

- `findApplicationRoot()`
- `buildLabelIndex(root)`
- `scanFields(root, labelIndex)`
- `classifyField(field)`
- `matchField(field, context)`
- `fillField(field, answer)`

### Step 2

Update [extension/src/popup/popup.js](/Users/ayan/Documents/cmpsc/jobmaster/extension/src/popup/popup.js) to cache analysis by tab ID + URL.

### Step 3

Expand [extension/src/content/platforms.js](/Users/ayan/Documents/cmpsc/jobmaster/extension/src/content/platforms.js) so each platform defines its own root and field hints.

### Step 4

Add a debug/result payload from content script back to popup:

- time taken
- fields scanned
- matched/skipped reasons

### Step 5

Tune each adapter against live pages.

## Highest-Impact Wins

If we want the biggest improvements fast, do these first:

1. Scan only application roots instead of `document`.
2. Cache popup analysis.
3. Build label indexes once.
4. Add field taxonomy before fuzzy matching.
5. Add step-aware scanning for Workday and LinkedIn.

## Success Criteria

We should consider scanning “good” when:

- popup analysis feels instant after initial page load
- generic autofill scans fewer than 40 relevant fields on most forms
- Greenhouse and Lever complete within one short interaction
- Workday and LinkedIn only scan the active step
- skipped fields include a clear reason instead of silent misses

## Recommendation

The best next implementation pass is:

**optimize the content script first, not the popup UI**

Specifically:

1. application-root detection
2. label indexing
3. taxonomy classification
4. cached analysis

That will give you both speed and quality improvement at the same time.

