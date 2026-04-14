from __future__ import annotations

import csv
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import DB_PATH, GENERATED_DIR, STATUS_OPTIONS


SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT DEFAULT '',
    source TEXT DEFAULT '',
    job_url TEXT DEFAULT '',
    compensation TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'saved',
    notes TEXT DEFAULT '',
    generated_cover_letter TEXT DEFAULT '',
    submitted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
);
"""


def timestamp() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db(db_path: Path = DB_PATH) -> None:
    with connect(db_path) as connection:
        connection.executescript(SCHEMA)


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def create_job(
    company: str,
    title: str,
    location: str = "",
    source: str = "",
    job_url: str = "",
    compensation: str = "",
    notes: str = "",
    db_path: Path = DB_PATH,
) -> int:
    created = timestamp()
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO jobs (
                company, title, location, source, job_url, compensation, status, notes,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'saved', ?, ?, ?)
            """,
            (company, title, location, source, job_url, compensation, notes, created, created),
        )
        job_id = int(cursor.lastrowid)
        connection.execute(
            "INSERT INTO events (job_id, event_type, details, created_at) VALUES (?, ?, ?, ?)",
            (job_id, "created", f"{title} at {company}", created),
        )
        return job_id


def list_jobs(db_path: Path = DB_PATH) -> list[dict[str, Any]]:
    with connect(db_path) as connection:
        rows = connection.execute(
            "SELECT * FROM jobs ORDER BY updated_at DESC, id DESC"
        ).fetchall()
    return [row_to_dict(row) for row in rows if row_to_dict(row) is not None]


def recent_jobs(limit: int = 6, db_path: Path = DB_PATH) -> list[dict[str, Any]]:
    with connect(db_path) as connection:
        rows = connection.execute(
            "SELECT * FROM jobs ORDER BY updated_at DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [row_to_dict(row) for row in rows if row_to_dict(row) is not None]


def get_job(job_id: int, db_path: Path = DB_PATH) -> dict[str, Any] | None:
    with connect(db_path) as connection:
        row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return row_to_dict(row)


def update_job(job_id: int, payload: dict[str, Any], db_path: Path = DB_PATH) -> None:
    fields = [
        "company",
        "title",
        "location",
        "source",
        "job_url",
        "compensation",
        "status",
        "notes",
    ]
    updates = {field: payload.get(field, "") for field in fields}
    if updates["status"] not in STATUS_OPTIONS:
        updates["status"] = "saved"
    submitted_at = timestamp() if updates["status"] == "submitted" else None
    with connect(db_path) as connection:
        existing = get_job(job_id, db_path)
        connection.execute(
            """
            UPDATE jobs
            SET company = ?, title = ?, location = ?, source = ?, job_url = ?, compensation = ?,
                status = ?, notes = ?, submitted_at = COALESCE(submitted_at, ?), updated_at = ?
            WHERE id = ?
            """,
            (
                updates["company"],
                updates["title"],
                updates["location"],
                updates["source"],
                updates["job_url"],
                updates["compensation"],
                updates["status"],
                updates["notes"],
                submitted_at,
                timestamp(),
                job_id,
            ),
        )
        if existing:
            changed_status = existing.get("status") != updates["status"]
            detail = f"Updated {updates['title']} at {updates['company']}"
            if changed_status:
                detail = f"Status changed to {updates['status']}"
            connection.execute(
                "INSERT INTO events (job_id, event_type, details, created_at) VALUES (?, ?, ?, ?)",
                (job_id, "updated", detail, timestamp()),
            )


def save_generated_cover_letter(job_id: int, value: str, db_path: Path = DB_PATH) -> None:
    with connect(db_path) as connection:
        connection.execute(
            "UPDATE jobs SET generated_cover_letter = ?, updated_at = ? WHERE id = ?",
            (value, timestamp(), job_id),
        )
        connection.execute(
            "INSERT INTO events (job_id, event_type, details, created_at) VALUES (?, ?, ?, ?)",
            (job_id, "cover_letter", "Generated a cover letter", timestamp()),
        )


def log_event(job_id: int, event_type: str, details: str, db_path: Path = DB_PATH) -> None:
    with connect(db_path) as connection:
        connection.execute(
            "INSERT INTO events (job_id, event_type, details, created_at) VALUES (?, ?, ?, ?)",
            (job_id, event_type, details, timestamp()),
        )
        connection.execute(
            "UPDATE jobs SET updated_at = ? WHERE id = ?",
            (timestamp(), job_id),
        )


def list_events(job_id: int | None = None, limit: int = 20, db_path: Path = DB_PATH) -> list[dict[str, Any]]:
    query = "SELECT * FROM events"
    params: tuple[Any, ...]
    if job_id is None:
        query += " ORDER BY created_at DESC, id DESC LIMIT ?"
        params = (limit,)
    else:
        query += " WHERE job_id = ? ORDER BY created_at DESC, id DESC LIMIT ?"
        params = (job_id, limit)
    with connect(db_path) as connection:
        rows = connection.execute(query, params).fetchall()
    return [row_to_dict(row) for row in rows if row_to_dict(row) is not None]


def summary_counts(db_path: Path = DB_PATH) -> dict[str, int]:
    counts = {status: 0 for status in STATUS_OPTIONS}
    with connect(db_path) as connection:
        rows = connection.execute(
            "SELECT status, COUNT(*) AS count FROM jobs GROUP BY status"
        ).fetchall()
    for row in rows:
        counts[row["status"]] = row["count"]
    counts["total"] = sum(counts[status] for status in STATUS_OPTIONS)
    return counts


def export_jobs_csv(output_path: Path, db_path: Path = DB_PATH) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rows = list_jobs(db_path)
    fieldnames = [
        "id",
        "company",
        "title",
        "location",
        "source",
        "job_url",
        "compensation",
        "status",
        "notes",
        "submitted_at",
        "created_at",
        "updated_at",
    ]
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})
    return output_path


def write_generated_letter(job_id: int, content: str, db_path: Path = DB_PATH) -> Path:
    job = get_job(job_id, db_path)
    if job is None:
        raise ValueError(f"Job {job_id} does not exist")
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    safe_company = "".join(char.lower() if char.isalnum() else "-" for char in job["company"]).strip("-")
    safe_title = "".join(char.lower() if char.isalnum() else "-" for char in job["title"]).strip("-")
    output_path = GENERATED_DIR / f"{job_id}-{safe_company}-{safe_title}.tex"
    output_path.write_text(content.rstrip() + "\n", encoding="utf-8")
    return output_path
