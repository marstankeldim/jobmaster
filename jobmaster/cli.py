from __future__ import annotations

import argparse
from pathlib import Path
from wsgiref.simple_server import make_server

from .autofill import run_autofill
from .cover_letters import render_cover_letter
from .db import export_jobs_csv, get_job, init_db, log_event, save_generated_cover_letter, write_generated_letter
from .storage import ensure_user_files, load_answers, load_cover_letter_template, load_profile
from .web import app


def serve(host: str, port: int) -> None:
    ensure_user_files()
    init_db()
    with make_server(host, port, app) as server:
        print(f"Jobmaster dashboard running at http://{host}:{port}")
        server.serve_forever()


def command_init() -> None:
    ensure_user_files()
    init_db()
    print("Initialized Jobmaster data files and SQLite database.")


def command_export(output: Path) -> None:
    ensure_user_files()
    init_db()
    exported = export_jobs_csv(output)
    print(f"Exported applications to {exported}")


def command_generate_cover_letter(job_id: int) -> None:
    ensure_user_files()
    init_db()
    job = get_job(job_id)
    if job is None:
        raise SystemExit(f"Job {job_id} not found.")
    rendered = render_cover_letter(load_cover_letter_template(), job, load_profile())
    save_generated_cover_letter(job_id, rendered)
    output = write_generated_letter(job_id, rendered)
    print(rendered)
    print(f"\nSaved to {output}")


def command_autofill(job_id: int, url: str | None, headless: bool, submit: bool) -> None:
    ensure_user_files()
    init_db()
    job = get_job(job_id)
    if job is None:
        raise SystemExit(f"Job {job_id} not found.")
    target_url = url or job.get("job_url")
    if not target_url:
        raise SystemExit("No application URL found. Add one to the job or pass --url.")

    cover_letter = job.get("generated_cover_letter") or render_cover_letter(
        load_cover_letter_template(), job, load_profile()
    )
    result = run_autofill(
        target_url,
        load_profile(),
        load_answers(),
        cover_letter,
        headless=headless,
        submit=submit,
    )
    log_event(
        job_id,
        "autofill",
        f"Autofill filled {len(result['filled'])} fields and skipped {len(result['skipped'])}.",
    )
    if result["submitted"]:
        log_event(job_id, "submitted", "Autofill attempted a final submit click.")
    print("Filled fields:")
    for item in result["filled"]:
        print(f"  - {item}")
    print("Skipped fields:")
    for item in result["skipped"]:
        print(f"  - {item}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Local-first job application tracker and autofill helper.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init", help="Initialize local data files and the SQLite database.")

    serve_parser = subparsers.add_parser("serve", help="Run the local Jobmaster dashboard.")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", default=8765, type=int)

    export_parser = subparsers.add_parser("export", help="Export tracked applications to CSV.")
    export_parser.add_argument("--output", default="data/applications.csv", type=Path)

    cover_parser = subparsers.add_parser("generate-cover-letter", help="Render a cover letter for a tracked job.")
    cover_parser.add_argument("--job", required=True, type=int)

    autofill_parser = subparsers.add_parser("autofill", help="Open a browser and autofill a tracked application.")
    autofill_parser.add_argument("--job", required=True, type=int)
    autofill_parser.add_argument("--url", help="Override the job's saved application URL.")
    autofill_parser.add_argument("--headless", action="store_true", help="Run the browser in headless mode.")
    autofill_parser.add_argument("--submit", action="store_true", help="Attempt a final submit click after filling.")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "init":
        command_init()
    elif args.command == "serve":
        serve(args.host, args.port)
    elif args.command == "export":
        command_export(args.output)
    elif args.command == "generate-cover-letter":
        command_generate_cover_letter(args.job)
    elif args.command == "autofill":
        command_autofill(args.job, args.url, args.headless, args.submit)
    else:
        parser.error("Unknown command")

