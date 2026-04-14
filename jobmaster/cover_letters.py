from __future__ import annotations

from datetime import datetime
from typing import Any


class SafeFormatDict(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def build_context(job: dict[str, Any], profile: dict[str, Any]) -> dict[str, str]:
    context = {key: "" if value is None else str(value) for key, value in profile.items()}
    context.update(
        {
            "company": str(job.get("company", "")),
            "title": str(job.get("title", "")),
            "location": str(job.get("location", "")),
            "job_url": str(job.get("job_url", "")),
            "source": str(job.get("source", "")),
            "today": datetime.now().strftime("%B %d, %Y"),
        }
    )
    return context


def render_cover_letter(template_text: str, job: dict[str, Any], profile: dict[str, Any]) -> str:
    return template_text.format_map(SafeFormatDict(build_context(job, profile))).strip()

