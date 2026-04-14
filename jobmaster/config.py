from __future__ import annotations

from copy import deepcopy
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "jobmaster.db"
PROFILE_PATH = DATA_DIR / "profile.json"
ANSWERS_PATH = DATA_DIR / "answers.json"
COVER_LETTER_TEMPLATE_PATH = DATA_DIR / "cover_letter_template.txt"
GENERATED_DIR = DATA_DIR / "generated"

STATUS_OPTIONS = [
    "saved",
    "applying",
    "submitted",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
]

DEFAULT_PROFILE = {
    "full_name": "Your Name",
    "email": "you@example.com",
    "phone": "555-555-5555",
    "location": "Your City, State",
    "linkedin": "https://www.linkedin.com/in/your-name",
    "github": "https://github.com/your-name",
    "portfolio": "https://your-site.dev",
    "resume_path": "data/resume.pdf",
    "summary": "Replace this with a concise professional summary that fits most applications.",
    "top_skills": "Python, automation, APIs, backend engineering",
    "work_authorization": "Yes",
    "sponsorship_needed": "No",
    "salary_expectation": "",
    "available_start_date": "Two weeks after offer",
    "preferred_workplace": "Remote or hybrid",
}

DEFAULT_ANSWERS = {
    "answers": [
        {
            "question": "Are you legally authorized to work in the United States?",
            "answer": "Yes",
            "aliases": ["authorized to work", "work authorization", "eligible to work"],
        },
        {
            "question": "Will you now or in the future require visa sponsorship?",
            "answer": "No",
            "aliases": ["sponsorship", "visa sponsorship", "require sponsorship"],
        },
        {
            "question": "What is your preferred work arrangement?",
            "answer": "Remote or hybrid",
            "aliases": ["remote", "hybrid", "onsite", "work arrangement"],
        },
    ]
}

DEFAULT_COVER_LETTER_TEMPLATE = """Dear {company} hiring team,

I’m excited to apply for the {title} role in {location}. My background aligns well with the work you’re doing, especially across {top_skills}.

{summary}

I’d welcome the chance to contribute and would be glad to discuss how I can help {company}.

Best,
{full_name}
{email}
{phone}
"""

TEMPLATE_FIELDS = [
    "company",
    "title",
    "location",
    "full_name",
    "email",
    "phone",
    "summary",
    "top_skills",
    "today",
]


def default_profile() -> dict[str, str]:
    return deepcopy(DEFAULT_PROFILE)


def default_answers() -> dict[str, list[dict[str, object]]]:
    return deepcopy(DEFAULT_ANSWERS)

