from __future__ import annotations

import json
import mimetypes
from dataclasses import dataclass
from email.parser import BytesParser
from email.policy import default
from html import escape
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

from .config import STATUS_OPTIONS, TEMPLATE_FIELDS
from .cover_letters import latex_to_text, render_cover_letter
from .db import (
    create_job,
    export_jobs_csv,
    get_job,
    init_db,
    list_events,
    list_jobs,
    recent_jobs,
    save_generated_cover_letter,
    summary_counts,
    update_job,
    write_generated_letter,
)
from .storage import (
    ensure_user_files,
    load_answers,
    load_candidate_sources,
    load_cover_letter_template,
    load_profile,
    save_answers,
    save_candidate_sources,
    save_cover_letter_template,
    save_profile,
    save_resume_upload,
)
from .summary import generate_professional_summary


STATIC_CSS = Path(__file__).with_name("static").joinpath("styles.css").read_text(encoding="utf-8")


@dataclass
class UploadedFile:
    filename: str
    content_type: str
    content: bytes


def html_page(title: str, body: str, active: str = "dashboard", notice: str = "") -> bytes:
    nav = []
    for key, label, href in [
        ("dashboard", "Dashboard", "/"),
        ("jobs", "Jobs", "/jobs"),
        ("settings", "Settings", "/settings"),
        ("export", "Export CSV", "/export.csv"),
    ]:
        cls = "nav-link active" if key == active else "nav-link"
        nav.append(f'<a class="{cls}" href="{href}">{label}</a>')
    notice_html = f'<div class="notice">{escape(notice)}</div>' if notice else ""
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(title)} · Jobmaster</title>
  <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
  <div class="page-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Local-first job search autopilot</p>
        <h1>Jobmaster</h1>
        <p class="hero-copy">Keep your profile, recruiter answers, cover letters, and applications in one place.</p>
      </div>
      <nav class="nav">{''.join(nav)}</nav>
    </header>
    {notice_html}
    {body}
  </div>
</body>
</html>"""
    return html.encode("utf-8")


def parse_request(environ: dict[str, Any]) -> tuple[dict[str, str], dict[str, UploadedFile]]:
    size = int(environ.get("CONTENT_LENGTH") or 0)
    body = environ["wsgi.input"].read(size)
    content_type = environ.get("CONTENT_TYPE", "")
    if content_type.startswith("multipart/form-data"):
        message = BytesParser(policy=default).parsebytes(
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + body
        )
        fields: dict[str, str] = {}
        files: dict[str, UploadedFile] = {}
        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition")
            if not name:
                continue
            filename = part.get_filename()
            payload = part.get_payload(decode=True) or b""
            if filename:
                files[name] = UploadedFile(
                    filename=filename,
                    content_type=part.get_content_type(),
                    content=payload,
                )
            else:
                fields[name] = payload.decode("utf-8").strip()
        return fields, files

    raw = body.decode("utf-8")
    parsed = parse_qs(raw, keep_blank_values=True)
    return {key: values[0] if values else "" for key, values in parsed.items()}, {}


def response(start_response: Any, status: str, body: bytes, headers: list[tuple[str, str]] | None = None) -> list[bytes]:
    default_headers = [("Content-Type", "text/html; charset=utf-8"), ("Content-Length", str(len(body)))]
    start_response(status, (headers or default_headers))
    return [body]


def redirect(start_response: Any, location: str) -> list[bytes]:
    start_response("303 See Other", [("Location", location)])
    return [b""]


def dashboard_page() -> bytes:
    counts = summary_counts()
    jobs = recent_jobs()
    events = list_events(limit=8)
    cards = []
    for label, value in [
        ("Saved", counts["saved"]),
        ("Applying", counts["applying"]),
        ("Submitted", counts["submitted"]),
        ("Interviews", counts["interview"]),
        ("Total", counts["total"]),
    ]:
        cards.append(f'<article class="card stat-card"><p>{label}</p><strong>{value}</strong></article>')

    rows = []
    for job in jobs:
        rows.append(
            f"""
            <tr>
              <td><a href="/jobs/{job['id']}">{escape(job['company'])}</a></td>
              <td>{escape(job['title'])}</td>
              <td>{escape(job['location'] or '—')}</td>
              <td><span class="pill status-{escape(job['status'])}">{escape(job['status'])}</span></td>
              <td>{escape(job['updated_at'])}</td>
            </tr>
            """
        )
    if not rows:
        rows.append('<tr><td colspan="5" class="empty">No jobs yet. Add one from the Jobs page.</td></tr>')

    activity = []
    for event in events:
        activity.append(
            f'<li><strong>Job #{event["job_id"]}</strong> · {escape(event["details"])} <span>{escape(event["created_at"])}</span></li>'
        )
    if not activity:
        activity.append("<li>No activity yet.</li>")

    body = f"""
    <main class="grid two-up">
      <section class="card stack">
        <div class="section-head">
          <h2>Overview</h2>
          <p>Your current pipeline at a glance.</p>
        </div>
        <div class="stats-grid">
          {''.join(cards)}
        </div>
      </section>
      <section class="card stack">
        <div class="section-head">
          <h2>How to use it</h2>
          <p>Fill your profile once, track every lead, and run browser autofill when a job is worth applying to.</p>
        </div>
        <ol class="plain-list">
          <li>Open Settings and add your profile, recruiter answers, and cover letter template.</li>
          <li>Add job leads from the Jobs page and keep notes as you go.</li>
          <li>Run <code>python3 -m jobmaster autofill --job JOB_ID</code> for a real application URL.</li>
        </ol>
      </section>
      <section class="card stack wide">
        <div class="section-head">
          <h2>Recent jobs</h2>
          <p>Click any job to update status or generate a cover letter.</p>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Company</th><th>Role</th><th>Location</th><th>Status</th><th>Updated</th></tr>
            </thead>
            <tbody>{''.join(rows)}</tbody>
          </table>
        </div>
      </section>
      <section class="card stack">
        <div class="section-head">
          <h2>Recent activity</h2>
          <p>Every job update is logged so you can keep momentum.</p>
        </div>
        <ul class="activity-list">{''.join(activity)}</ul>
      </section>
    </main>
    """
    return html_page("Dashboard", body, active="dashboard")


def jobs_page() -> bytes:
    jobs = list_jobs()
    rows = []
    for job in jobs:
        rows.append(
            f"""
            <tr>
              <td><a href="/jobs/{job['id']}">{escape(job['company'])}</a></td>
              <td>{escape(job['title'])}</td>
              <td>{escape(job['source'] or '—')}</td>
              <td>{escape(job['location'] or '—')}</td>
              <td><span class="pill status-{escape(job['status'])}">{escape(job['status'])}</span></td>
              <td>{escape(job['created_at'])}</td>
            </tr>
            """
        )
    if not rows:
        rows.append('<tr><td colspan="6" class="empty">No jobs yet.</td></tr>')

    body = f"""
    <main class="grid two-up">
      <section class="card stack">
        <div class="section-head">
          <h2>Add a job</h2>
          <p>Create a lead before you apply so every step stays tracked.</p>
        </div>
        <form method="post" action="/jobs" class="form-grid">
          <label>Company<input type="text" name="company" required></label>
          <label>Role title<input type="text" name="title" required></label>
          <label>Location<input type="text" name="location"></label>
          <label>Source<input type="text" name="source" placeholder="LinkedIn, referral, company site"></label>
          <label class="wide">Application URL<input type="url" name="job_url"></label>
          <label>Compensation<input type="text" name="compensation"></label>
          <label class="wide">Notes<textarea name="notes" rows="5" placeholder="Referral context, why it looks interesting, deadlines, etc."></textarea></label>
          <button class="primary" type="submit">Save job</button>
        </form>
      </section>
      <section class="card stack wide">
        <div class="section-head">
          <h2>Tracked jobs</h2>
          <p>Use the detail view to update status, save notes, and generate cover letters.</p>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Company</th><th>Role</th><th>Source</th><th>Location</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>{''.join(rows)}</tbody>
          </table>
        </div>
      </section>
    </main>
    """
    return html_page("Jobs", body, active="jobs")


def settings_page(notice: str = "") -> bytes:
    profile = load_profile()
    answers = load_answers()
    candidate_sources = load_candidate_sources()
    template = load_cover_letter_template()
    template_help = ", ".join(TEMPLATE_FIELDS)
    resume_path = str(profile.get("resume_path", "")).strip()
    resume_exists = Path(resume_path).expanduser().exists() if resume_path else False
    resume_status = "Resume on file" if resume_exists else "No uploaded resume found yet"
    resume_link = '<a href="/resume">Open current resume</a>' if resume_exists else ""
    body = f"""
    <main class="grid two-up">
      <section class="card stack">
        <div class="section-head">
          <h2>Profile</h2>
          <p>This is the reusable data Jobmaster uses in cover letters and autofill.</p>
        </div>
        <form method="post" action="/settings/profile" class="form-grid">
          <label>Full name<input type="text" name="full_name" value="{escape(str(profile.get('full_name', '')))}"></label>
          <label>Email<input type="email" name="email" value="{escape(str(profile.get('email', '')))}"></label>
          <label>Phone<input type="text" name="phone" value="{escape(str(profile.get('phone', '')))}"></label>
          <label>Location<input type="text" name="location" value="{escape(str(profile.get('location', '')))}"></label>
          <label>LinkedIn<input type="url" name="linkedin" value="{escape(str(profile.get('linkedin', '')))}"></label>
          <label>GitHub<input type="url" name="github" value="{escape(str(profile.get('github', '')))}"></label>
          <label>Portfolio<input type="url" name="portfolio" value="{escape(str(profile.get('portfolio', '')))}"></label>
          <label>Work authorization<input type="text" name="work_authorization" value="{escape(str(profile.get('work_authorization', '')))}"></label>
          <label>Sponsorship needed<input type="text" name="sponsorship_needed" value="{escape(str(profile.get('sponsorship_needed', '')))}"></label>
          <label>Salary expectation<input type="text" name="salary_expectation" value="{escape(str(profile.get('salary_expectation', '')))}"></label>
          <label>Available start date<input type="text" name="available_start_date" value="{escape(str(profile.get('available_start_date', '')))}"></label>
          <label>Preferred workplace<input type="text" name="preferred_workplace" value="{escape(str(profile.get('preferred_workplace', '')))}"></label>
          <label class="wide">Top skills<input type="text" name="top_skills" value="{escape(str(profile.get('top_skills', '')))}"></label>
          <label class="wide">Professional summary<textarea name="summary" rows="6">{escape(str(profile.get('summary', '')))}</textarea></label>
          <button class="primary" type="submit">Save profile</button>
        </form>
      </section>
      <section class="card stack">
        <div class="section-head">
          <h2>Resume</h2>
          <p>{escape(resume_status)}. Current path: {escape(resume_path or 'Not set')} {resume_link}</p>
        </div>
        <form method="post" action="/settings/resume" enctype="multipart/form-data" class="stack">
          <label class="wide">Upload resume<input type="file" name="resume_file" accept=".pdf,.doc,.docx,.txt,.rtf"></label>
          <button class="primary" type="submit">Upload resume</button>
        </form>
        <form method="post" action="/settings/resume-path" class="stack">
          <label class="wide">Or set an existing local resume path<input type="text" name="resume_path" value="{escape(resume_path)}" placeholder="data/uploads/resume.pdf"></label>
          <button class="primary" type="submit">Save resume path</button>
        </form>
      </section>
      <section class="card stack">
        <div class="section-head">
          <h2>Recruiter answers</h2>
          <p>Edit your answer bank as JSON. Aliases improve generic form matching.</p>
        </div>
        <form method="post" action="/settings/answers" class="stack">
          <label class="wide">Answer bank<textarea name="answers_json" rows="16">{escape(json.dumps(answers, indent=2))}</textarea></label>
          <button class="primary" type="submit">Save answers</button>
        </form>
      </section>
      <section class="card stack wide">
        <div class="section-head">
          <h2>Candidate source data</h2>
          <p>Store anything helpful: resume notes, GitHub signals, LinkedIn data, education, project highlights, and recruiter-facing context.</p>
        </div>
        <form method="post" action="/settings/candidate-sources" class="stack">
          <label class="wide">Candidate context JSON<textarea name="candidate_sources_json" rows="22">{escape(json.dumps(candidate_sources, indent=2))}</textarea></label>
          <div class="button-row">
            <button class="primary" type="submit">Save source data</button>
          </div>
        </form>
        <form method="post" action="/settings/generate-summary" class="stack">
          <button class="primary" type="submit">Generate professional summary</button>
        </form>
      </section>
      <section class="card stack wide">
        <div class="section-head">
          <h2>LaTeX cover letter template</h2>
          <p>Available placeholders: {escape(template_help)}</p>
        </div>
        <form method="post" action="/settings/template" class="stack">
          <label class="wide">Template<textarea name="template" rows="18">{escape(template)}</textarea></label>
          <button class="primary" type="submit">Save template</button>
        </form>
      </section>
    </main>
    """
    return html_page("Settings", body, active="settings", notice=notice)


def job_detail_page(job_id: int, notice: str = "") -> bytes:
    job = get_job(job_id)
    if job is None:
        return html_page("Not Found", '<main class="card"><p>That job does not exist.</p></main>', active="jobs", notice=notice)

    events = list_events(job_id=job_id)
    profile = load_profile()
    template = load_cover_letter_template()
    cover_letter = job.get("generated_cover_letter") or render_cover_letter(template, job, profile)
    plain_cover_letter = latex_to_text(cover_letter)
    options = []
    for status in STATUS_OPTIONS:
        selected = " selected" if status == job["status"] else ""
        options.append(f'<option value="{status}"{selected}>{status.title()}</option>')

    activity = []
    for event in events:
        activity.append(f'<li>{escape(event["details"])} <span>{escape(event["created_at"])}</span></li>')
    if not activity:
        activity.append("<li>No activity yet.</li>")

    autofill_command = f"python3 -m jobmaster autofill --job {job_id}"
    body = f"""
    <main class="grid two-up">
      <section class="card stack">
        <div class="section-head">
          <h2>{escape(job['title'])}</h2>
          <p>{escape(job['company'])}</p>
        </div>
        <form method="post" action="/jobs/{job_id}/update" class="form-grid">
          <label>Company<input type="text" name="company" value="{escape(job['company'])}" required></label>
          <label>Role title<input type="text" name="title" value="{escape(job['title'])}" required></label>
          <label>Location<input type="text" name="location" value="{escape(job['location'] or '')}"></label>
          <label>Source<input type="text" name="source" value="{escape(job['source'] or '')}"></label>
          <label class="wide">Application URL<input type="url" name="job_url" value="{escape(job['job_url'] or '')}"></label>
          <label>Compensation<input type="text" name="compensation" value="{escape(job['compensation'] or '')}"></label>
          <label>Status<select name="status">{''.join(options)}</select></label>
          <label class="wide">Notes<textarea name="notes" rows="8">{escape(job['notes'] or '')}</textarea></label>
          <button class="primary" type="submit">Save changes</button>
        </form>
        <div class="command-box">
          <p>Browser autofill command</p>
          <code>{escape(autofill_command)}</code>
        </div>
      </section>
      <section class="card stack">
        <div class="section-head">
          <h2>Cover letter</h2>
          <p>Generate from your LaTeX template and this job’s details.</p>
        </div>
        <form method="post" action="/jobs/{job_id}/generate">
          <button class="primary" type="submit">Generate cover letter</button>
        </form>
        <div class="command-box">
          <p>Autofill uses a plain-text version of this LaTeX output for web forms.</p>
          <code>{escape(plain_cover_letter[:280] + ('...' if len(plain_cover_letter) > 280 else ''))}</code>
        </div>
        <pre class="letter-preview">{escape(cover_letter)}</pre>
      </section>
      <section class="card stack wide">
        <div class="section-head">
          <h2>Activity</h2>
          <p>Every major update for this job lives here.</p>
        </div>
        <ul class="activity-list">{''.join(activity)}</ul>
      </section>
    </main>
    """
    return html_page(f"{job['company']} · {job['title']}", body, active="jobs", notice=notice)


def app(environ: dict[str, Any], start_response: Any) -> list[bytes]:
    ensure_user_files()
    init_db()
    method = environ["REQUEST_METHOD"]
    effective_method = "GET" if method == "HEAD" else method
    path = environ.get("PATH_INFO", "/")

    if effective_method == "GET" and path == "/":
        return response(start_response, "200 OK", dashboard_page())
    if effective_method == "GET" and path == "/jobs":
        return response(start_response, "200 OK", jobs_page())
    if method == "POST" and path == "/jobs":
        payload, _ = parse_request(environ)
        if payload.get("company") and payload.get("title"):
            create_job(
                company=payload["company"],
                title=payload["title"],
                location=payload.get("location", ""),
                source=payload.get("source", ""),
                job_url=payload.get("job_url", ""),
                compensation=payload.get("compensation", ""),
                notes=payload.get("notes", ""),
            )
        return redirect(start_response, "/jobs")
    if effective_method == "GET" and path == "/settings":
        return response(start_response, "200 OK", settings_page())
    if method == "POST" and path == "/settings/profile":
        payload, _ = parse_request(environ)
        current_profile = load_profile()
        current_profile.update(payload)
        save_profile(current_profile)
        return response(start_response, "200 OK", settings_page(notice="Profile saved."))
    if method == "POST" and path == "/settings/resume":
        payload, files = parse_request(environ)
        uploaded = files.get("resume_file")
        if uploaded is None or not uploaded.content:
            return response(start_response, "200 OK", settings_page(notice="Choose a resume file to upload."))
        saved_path = save_resume_upload(uploaded.filename, uploaded.content)
        profile = load_profile()
        profile["resume_path"] = str(saved_path)
        save_profile(profile)
        return response(start_response, "200 OK", settings_page(notice=f"Resume uploaded to {saved_path}."))
    if method == "POST" and path == "/settings/resume-path":
        payload, _ = parse_request(environ)
        profile = load_profile()
        profile["resume_path"] = payload.get("resume_path", "").strip()
        save_profile(profile)
        return response(start_response, "200 OK", settings_page(notice="Resume path saved."))
    if method == "POST" and path == "/settings/answers":
        payload, _ = parse_request(environ)
        try:
            parsed = json.loads(payload.get("answers_json", "{}"))
            save_answers(parsed)
            return response(start_response, "200 OK", settings_page(notice="Answer bank saved."))
        except json.JSONDecodeError:
            return response(start_response, "200 OK", settings_page(notice="Answer bank JSON is invalid."))
    if method == "POST" and path == "/settings/candidate-sources":
        payload, _ = parse_request(environ)
        try:
            parsed = json.loads(payload.get("candidate_sources_json", "{}"))
            save_candidate_sources(parsed)
            return response(start_response, "200 OK", settings_page(notice="Candidate source data saved."))
        except json.JSONDecodeError:
            return response(start_response, "200 OK", settings_page(notice="Candidate source JSON is invalid."))
    if method == "POST" and path == "/settings/generate-summary":
        profile = load_profile()
        summary = generate_professional_summary(profile, load_candidate_sources())
        profile["summary"] = summary
        save_profile(profile)
        return response(start_response, "200 OK", settings_page(notice="Professional summary regenerated from candidate source data."))
    if method == "POST" and path == "/settings/template":
        payload, _ = parse_request(environ)
        save_cover_letter_template(payload.get("template", ""))
        return response(start_response, "200 OK", settings_page(notice="LaTeX cover letter template saved."))
    if effective_method == "GET" and path == "/resume":
        resume_path = Path(str(load_profile().get("resume_path", "") or "")).expanduser()
        if not resume_path.exists() or not resume_path.is_file():
            return response(
                start_response,
                "404 Not Found",
                html_page("Resume Not Found", '<main class="card"><p>No resume file is configured yet.</p></main>', active="settings"),
            )
        body = resume_path.read_bytes()
        content_type, _ = mimetypes.guess_type(str(resume_path))
        headers = [
            ("Content-Type", content_type or "application/octet-stream"),
            ("Content-Length", str(len(body))),
            ("Content-Disposition", f'inline; filename="{resume_path.name}"'),
        ]
        return response(start_response, "200 OK", body, headers=headers)
    if effective_method == "GET" and path == "/export.csv":
        export_path = export_jobs_csv(Path("data/applications.csv"))
        body = export_path.read_bytes()
        headers = [
            ("Content-Type", "text/csv; charset=utf-8"),
            ("Content-Length", str(len(body))),
            ("Content-Disposition", 'attachment; filename="applications.csv"'),
        ]
        return response(start_response, "200 OK", body, headers=headers)
    if effective_method == "GET" and path == "/static/styles.css":
        css_bytes = STATIC_CSS.encode("utf-8")
        headers = [
            ("Content-Type", "text/css; charset=utf-8"),
            ("Content-Length", str(len(css_bytes))),
        ]
        return response(start_response, "200 OK", css_bytes, headers=headers)

    if path.startswith("/jobs/"):
        parts = [piece for piece in path.split("/") if piece]
        if len(parts) >= 2 and parts[1].isdigit():
            job_id = int(parts[1])
            if effective_method == "GET" and len(parts) == 2:
                return response(start_response, "200 OK", job_detail_page(job_id))
            if method == "POST" and len(parts) == 3 and parts[2] == "update":
                payload, _ = parse_request(environ)
                update_job(job_id, payload)
                return response(start_response, "200 OK", job_detail_page(job_id, notice="Job updated."))
            if method == "POST" and len(parts) == 3 and parts[2] == "generate":
                job = get_job(job_id)
                if job is not None:
                    rendered = render_cover_letter(load_cover_letter_template(), job, load_profile())
                    save_generated_cover_letter(job_id, rendered)
                    write_generated_letter(job_id, rendered)
                return response(start_response, "200 OK", job_detail_page(job_id, notice="Cover letter generated."))

    return response(
        start_response,
        "404 Not Found",
        html_page("Not Found", '<main class="card"><p>Page not found.</p></main>', active="dashboard"),
    )
