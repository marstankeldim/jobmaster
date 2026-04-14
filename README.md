# Jobmaster

Jobmaster is a local-first job application copilot for your own search. It keeps your resume, recruiter-answer bank, and LaTeX cover letter template in one place, tracks every application in SQLite, and can optionally autofill supported application forms in a real browser.

## What it does

- Stores your candidate profile, recruiter answers, uploaded resume, and LaTeX cover letter template locally.
- Tracks jobs, statuses, notes, URLs, generated cover letters, and application activity.
- Exports your tracker to CSV.
- Launches a browser autofill run that uses your stored answers to populate common application fields.

## Quick start

1. Initialize your local data files:

```bash
python3 -m jobmaster init
```

2. Start the dashboard:

```bash
python3 -m jobmaster serve
```

3. Open `http://127.0.0.1:8765`, then fill in:

- your profile
- your resume
- your recruiter-answer bank
- your cover letter template
- your job leads

## Optional autofill setup

The tracker works with Python's standard library. Browser autofill is optional and uses Playwright.

```bash
python3 -m pip install playwright
playwright install chromium
```

Then run:

```bash
python3 -m jobmaster autofill --job 1
```

By default the browser opens in headed mode, gives you time to log in, and fills fields for review. Add `--submit` if you want Jobmaster to attempt the final submit click after filling.

## Resume handling

The Settings page gives you two ways to add your resume:

- upload the file into `data/uploads/`
- point Jobmaster at an existing local path

Autofill uses the saved `resume_path` automatically for file-upload fields.

## Cover letter placeholders

The cover letter template is stored as LaTeX and uses Python-style placeholders. These are the most useful ones:

- `{company}`
- `{title}`
- `{location}`
- `{full_name}`
- `{email}`
- `{phone}`
- `{summary}`
- `{top_skills}`
- `{today}`

Unknown placeholders are left untouched so you can refine your template safely.

## Recruiter-answer bank format

The dashboard lets you edit the answer bank as JSON. Each answer can include aliases to help the autofill matcher recognize similar prompts:

```json
{
  "answers": [
    {
      "question": "Are you legally authorized to work in the United States?",
      "answer": "Yes",
      "aliases": ["authorized to work", "work authorization", "eligible to work"]
    }
  ]
}
```

## Commands

- `python3 -m jobmaster init`
- `python3 -m jobmaster serve --host 127.0.0.1 --port 8765`
- `python3 -m jobmaster export --output data/applications.csv`
- `python3 -m jobmaster generate-cover-letter --job 1`
- `python3 -m jobmaster autofill --job 1`

## Notes

- The autofill engine is generic and works best on straightforward forms such as Greenhouse, Lever, and standard HTML applications.
- Some sites, especially heavily scripted Workday flows, may need more site-specific tuning.
- Generated cover letters are written as `.tex` files in `data/generated/`.
- Your private data stays local unless you choose to sync or commit it elsewhere.
