from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import (
    ANSWERS_PATH,
    COVER_LETTER_TEMPLATE_PATH,
    DATA_DIR,
    DEFAULT_COVER_LETTER_TEMPLATE,
    PROFILE_PATH,
    default_answers,
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


def ensure_user_files(
    data_dir: Path = DATA_DIR,
    profile_path: Path = PROFILE_PATH,
    answers_path: Path = ANSWERS_PATH,
    template_path: Path = COVER_LETTER_TEMPLATE_PATH,
) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    _write_json_if_missing(profile_path, default_profile())
    _write_json_if_missing(answers_path, default_answers())
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


def load_cover_letter_template(path: Path = COVER_LETTER_TEMPLATE_PATH) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return DEFAULT_COVER_LETTER_TEMPLATE


def save_cover_letter_template(value: str, path: Path = COVER_LETTER_TEMPLATE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8")

