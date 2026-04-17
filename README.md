# Jobmaster

Jobmaster is a local-first job application copilot. It stores candidate data, tracks applications, generates LaTeX cover letters, and helps fill job forms.

## Done

- Python dashboard for profile, resume, candidate data, cover letters, and application tracking
- local job tracker with status history and CSV export
- summary generation from resume, GitHub, LinkedIn, and other candidate data
- MV3 Chrome extension with settings, popup, on-page assistant, and tracker dashboard
- semantic autofill with review states, resume upload, and first-pass adapters for Workday, LinkedIn, Greenhouse, and Lever
- built-in AI draft flow for unresolved application questions when Chrome supports it

## Next

- harden live ATS adapters, especially Workday and LinkedIn variants
- improve scan quality for complex multi-step forms and custom widgets
- make generated answers more tailored to company and question style
- expand tracker workflow around follow-ups, reminders, and interview prep

## Quick start

```bash
python3 -m jobmaster init
python3 -m jobmaster serve
```

Open `http://127.0.0.1:8765` for the Python app, or load `extension/` as an unpacked Chrome extension.

## Commands

- `python3 -m jobmaster serve`
- `python3 -m jobmaster export --output data/applications.csv`
- `python3 -m jobmaster generate-summary`
- `python3 -m jobmaster generate-cover-letter --job 1`
- `python3 -m jobmaster autofill --job 1`
