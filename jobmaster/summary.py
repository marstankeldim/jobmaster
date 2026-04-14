from __future__ import annotations

import re
from typing import Any


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" ,.;")


def _split_multi(value: str) -> list[str]:
    if not value:
        return []
    chunks = re.split(r"[|,/;]\s*|\s{2,}", value)
    return [_clean(chunk) for chunk in chunks if _clean(chunk)]


def _split_bio_parts(value: str) -> list[str]:
    return [_clean(chunk) for chunk in value.split("|") if _clean(chunk)]


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def _natural_join(values: list[str]) -> str:
    values = [value for value in values if value]
    if not values:
        return ""
    if len(values) == 1:
        return values[0]
    if len(values) == 2:
        return f"{values[0]} and {values[1]}"
    return f"{', '.join(values[:-1])}, and {values[-1]}"


def _bio_identity(github_bio: str) -> str:
    first = _split_bio_parts(github_bio)[:1]
    if not first:
        return ""
    lead = first[0]
    if "@" in lead:
        role, org = [piece.strip() for piece in lead.split("@", 1)]
        return f"{org} {role.lower()} student"
    return lead


def _bio_focus_areas(github_bio: str) -> tuple[list[str], str]:
    parts = _split_bio_parts(github_bio)
    focus: list[str] = []
    seeking = ""
    for part in parts[1:]:
        if part.lower().startswith("seeking "):
            seeking = part
        else:
            focus.extend(_split_multi(part))
    return focus, seeking


def _repo_languages(candidate_sources: dict[str, Any]) -> list[str]:
    repositories = candidate_sources.get("github", {}).get("repositories", [])
    langs = [
        str(repo.get("language", "")).strip()
        for repo in repositories
        if str(repo.get("language", "")).strip() and str(repo.get("language", "")).strip().lower() != "other"
    ]
    return _unique(langs)


def _sentence_open(value: str) -> str:
    if not value:
        return ""
    return value[0].upper() + value[1:]


def generate_professional_summary(profile: dict[str, Any], candidate_sources: dict[str, Any]) -> str:
    github = candidate_sources.get("github", {})
    preferences = candidate_sources.get("preferences", {})
    education = candidate_sources.get("education", {})
    github_bio = str(github.get("bio", "")).strip()

    identity = ""
    if education.get("school") and education.get("degree"):
        identity = f"{education['school']} {str(education['degree']).lower()} student"
    elif education.get("school"):
        identity = f"Student at {education['school']}"
    else:
        identity = _bio_identity(github_bio)

    bio_focus, seeking = _bio_focus_areas(github_bio)
    skills = _unique(
        bio_focus
        + _split_multi(str(profile.get("top_skills", "")))
        + _repo_languages(candidate_sources)
        + [str(candidate_sources.get("preferences", {}).get("industries", "")).strip()]
    )
    skills = [skill for skill in skills if skill and not skill.lower().startswith("seeking ")]

    project_highlights = candidate_sources.get("project_highlights", [])
    repo_count = int(github.get("repository_count", 0) or 0)
    repos = github.get("repositories", [])
    repo_descriptions = [str(repo.get("description", "")).strip() for repo in repos if str(repo.get("description", "")).strip()]

    sentence_1 = ""
    filtered_skills = [skill for skill in skills if "internship" not in skill.lower()]
    if identity and filtered_skills:
        sentence_1 = f"{_sentence_open(identity)} with hands-on experience in {_natural_join(filtered_skills[:4])}."
    elif identity:
        sentence_1 = f"{_sentence_open(identity)}."
    else:
        sentence_1 = "Hands-on candidate with practical technical project experience."

    sentence_2 = ""
    if project_highlights:
        sentence_2 = f"Recent work includes {_natural_join([str(item) for item in project_highlights[:2]])}."
    elif repo_descriptions:
        useful_descriptions = [item for item in repo_descriptions if not item.lower().startswith("forked coursework")]
        sentence_2 = (
            f"Recent work includes {_natural_join(useful_descriptions[:2])}, alongside {repo_count} public GitHub repositories"
            if repo_count
            else f"Recent work includes {_natural_join(useful_descriptions[:2])}"
        )
        sentence_2 = sentence_2.rstrip(".") + "."
    elif repo_count:
        sentence_2 = f"Maintains {repo_count} public GitHub repositories that showcase applied project work and ongoing technical learning."

    target_roles = str(preferences.get("target_roles", "")).strip()
    sentence_3 = ""
    if target_roles:
        sentence_3 = f"Interested in {target_roles}."
    elif seeking:
        sentence_3 = seeking.rstrip(".") + "."

    summary = " ".join(part for part in [sentence_1, sentence_2, sentence_3] if part).strip()
    return re.sub(r"\s+", " ", summary)
