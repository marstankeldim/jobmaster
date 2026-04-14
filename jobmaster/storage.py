from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import (
    ANSWERS_PATH,
    CANDIDATE_SOURCES_PATH,
    COVER_LETTER_TEMPLATE_PATH,
    DATA_DIR,
    DEFAULT_COVER_LETTER_TEMPLATE,
    LEGACY_COVER_LETTER_TEMPLATE_PATH,
    PROFILE_PATH,
    UPLOADS_DIR,
    default_answers,
    default_candidate_sources,
    default_profile,
)


def _write_json_if_missing(path: Path, payload: dict[str, Any]) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _write_text_if_missing(path: Path, value: str) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def _coerce_template_to_latex(value: str) -> str:
    stripped = value.lstrip()
    if stripped.startswith(r"\documentclass") or stripped.startswith(r"\begin{document}"):
        return value
    body = value.strip() or "{summary}"
    escaped_body = body.replace("\\", r"\\")
    return DEFAULT_COVER_LETTER_TEMPLATE.replace(
        "I am excited to apply for the {title} role at {company}. My background aligns well with the work your team is doing, especially across {top_skills}.\n\n{summary}\n\nI would welcome the opportunity to contribute to {company} and discuss how I can add value to the team.",
        escaped_body,
    )


def ensure_user_files(
    data_dir: Path = DATA_DIR,
    profile_path: Path = PROFILE_PATH,
    answers_path: Path = ANSWERS_PATH,
    template_path: Path = COVER_LETTER_TEMPLATE_PATH,
) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    _write_json_if_missing(profile_path, default_profile())
    _write_json_if_missing(answers_path, default_answers())
    _write_json_if_missing(CANDIDATE_SOURCES_PATH, default_candidate_sources())
    if not template_path.exists() and LEGACY_COVER_LETTER_TEMPLATE_PATH.exists():
        template_path.write_text(
            _coerce_template_to_latex(LEGACY_COVER_LETTER_TEMPLATE_PATH.read_text(encoding="utf-8")).rstrip() + "\n",
            encoding="utf-8",
        )
    _write_text_if_missing(template_path, DEFAULT_COVER_LETTER_TEMPLATE)


def load_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return fallback
    except json.JSONDecodeError:
        return fallback


def save_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def load_profile(path: Path = PROFILE_PATH) -> dict[str, Any]:
    return load_json(path, default_profile())


def save_profile(payload: dict[str, Any], path: Path = PROFILE_PATH) -> None:
    save_json(path, payload)


def load_answers(path: Path = ANSWERS_PATH) -> dict[str, Any]:
    return load_json(path, default_answers())


def save_answers(payload: dict[str, Any], path: Path = ANSWERS_PATH) -> None:
    save_json(path, payload)


def load_candidate_sources(path: Path = CANDIDATE_SOURCES_PATH) -> dict[str, Any]:
    return load_json(path, default_candidate_sources())


def save_candidate_sources(payload: dict[str, Any], path: Path = CANDIDATE_SOURCES_PATH) -> None:
    save_json(path, payload)


def load_cover_letter_template(path: Path = COVER_LETTER_TEMPLATE_PATH) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        try:
            return _coerce_template_to_latex(LEGACY_COVER_LETTER_TEMPLATE_PATH.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return DEFAULT_COVER_LETTER_TEMPLATE


def save_cover_letter_template(value: str, path: Path = COVER_LETTER_TEMPLATE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def save_resume_upload(filename: str, content: bytes) -> Path:
    suffix = Path(filename).suffix.lower() or ".pdf"
    if len(suffix) > 10 or not suffix.startswith("."):
        suffix = ".pdf"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = UPLOADS_DIR / f"resume{suffix}"
    output_path.write_bytes(content)
    return output_path
