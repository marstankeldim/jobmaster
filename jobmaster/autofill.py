from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


FIELD_SCAN_JS = """
() => {
  const visible = (el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };

  const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim();

  const getLabels = (el) => {
    const chunks = [];
    if (el.labels) {
      for (const label of el.labels) chunks.push(clean(label.innerText));
    }
    if (el.id) {
      for (const label of document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`)) {
        chunks.push(clean(label.innerText));
      }
    }
    const parentLabel = el.closest('label');
    if (parentLabel) chunks.push(clean(parentLabel.innerText));
    const fieldset = el.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend) chunks.push(clean(legend.innerText));
    }
    return Array.from(new Set(chunks.filter(Boolean))).join(' | ');
  };

  const fields = [];
  const nodes = document.querySelectorAll('input, textarea, select');
  let index = 0;
  for (const el of nodes) {
    if (!visible(el) || el.disabled) continue;
    const id = `jobmaster-${index++}`;
    el.setAttribute('data-jobmaster-id', id);
    let options = [];
    if (el.tagName.toLowerCase() === 'select') {
      options = Array.from(el.options).map((option) => ({
        label: clean(option.label || option.textContent),
        value: option.value || ''
      }));
    }
    fields.push({
      jobmasterId: id,
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute('type') || '').toLowerCase(),
      name: el.getAttribute('name') || '',
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      autocomplete: el.getAttribute('autocomplete') || '',
      labelText: getLabels(el),
      currentValue: el.value || '',
      required: el.required,
      optionLabels: options
    });
  }
  return fields;
}
"""

YES_WORDS = {"yes", "true", "1"}
NO_WORDS = {"no", "false", "0"}


@dataclass
class CandidateAnswer:
    answer: str
    reason: str
    score: int


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def profile_answer_map(profile: dict[str, Any], cover_letter: str) -> list[tuple[re.Pattern[str], str]]:
    profile = {key: "" if value is None else str(value) for key, value in profile.items()}
    return [
        (re.compile(r"full.?name|your name|applicant name|legal name"), profile.get("full_name", "")),
        (re.compile(r"email|e-mail"), profile.get("email", "")),
        (re.compile(r"phone|mobile|cell"), profile.get("phone", "")),
        (re.compile(r"city|state|location|address"), profile.get("location", "")),
        (re.compile(r"linkedin"), profile.get("linkedin", "")),
        (re.compile(r"github"), profile.get("github", "")),
        (re.compile(r"portfolio|website|personal site"), profile.get("portfolio", "") or profile.get("github", "")),
        (re.compile(r"resume|cv"), profile.get("resume_path", "")),
        (re.compile(r"work authorization|authorized to work|eligible to work"), profile.get("work_authorization", "")),
        (re.compile(r"sponsorship|visa"), profile.get("sponsorship_needed", "")),
        (re.compile(r"salary|compensation|pay expectation"), profile.get("salary_expectation", "")),
        (re.compile(r"start date|available to start|notice period|availability"), profile.get("available_start_date", "")),
        (re.compile(r"remote|hybrid|onsite|work arrangement"), profile.get("preferred_workplace", "")),
        (re.compile(r"summary|about you|about yourself"), profile.get("summary", "")),
        (re.compile(r"skills|tech stack|strengths"), profile.get("top_skills", "")),
        (re.compile(r"cover letter"), cover_letter),
    ]


def custom_answer_match(field_text: str, answers_data: dict[str, Any]) -> CandidateAnswer | None:
    normalized_field = normalize(field_text)
    best: CandidateAnswer | None = None
    for item in answers_data.get("answers", []):
        question = str(item.get("question", ""))
        answer = str(item.get("answer", "")).strip()
        aliases = [str(alias) for alias in item.get("aliases", [])]
        candidates = [question, *aliases]
        score = 0
        for candidate in candidates:
            norm_candidate = normalize(candidate)
            if not norm_candidate:
                continue
            if norm_candidate in normalized_field:
                score = max(score, len(norm_candidate))
            else:
                tokens = set(norm_candidate.split())
                overlap = len(tokens.intersection(normalized_field.split()))
                score = max(score, overlap * 5)
        if answer and score > 0 and (best is None or score > best.score):
            best = CandidateAnswer(answer=answer, reason=f"custom match: {question}", score=score)
    return best


def choose_answer(field: dict[str, Any], profile: dict[str, Any], answers_data: dict[str, Any], cover_letter: str) -> CandidateAnswer | None:
    field_text = " ".join(
        str(field.get(key, ""))
        for key in ["labelText", "name", "placeholder", "ariaLabel", "autocomplete", "id"]
    )
    normalized_field = normalize(field_text)
    if not normalized_field:
        return None

    if field.get("type") == "file":
        resume_path = str(profile.get("resume_path", "")).strip()
        if resume_path:
            return CandidateAnswer(answer=resume_path, reason="resume upload", score=100)

    custom = custom_answer_match(field_text, answers_data)
    if custom is not None:
        return custom

    if field.get("tag") == "textarea" and "cover letter" in normalized_field:
        return CandidateAnswer(answer=cover_letter, reason="cover letter field", score=90)

    for pattern, value in profile_answer_map(profile, cover_letter):
        if value and pattern.search(normalized_field):
            return CandidateAnswer(answer=value, reason=f"profile match: {pattern.pattern}", score=50)

    if field.get("type") == "email" and profile.get("email"):
        return CandidateAnswer(answer=str(profile["email"]), reason="email input", score=40)
    if field.get("type") in {"tel", "phone"} and profile.get("phone"):
        return CandidateAnswer(answer=str(profile["phone"]), reason="phone input", score=40)

    return None


def choose_select_option(answer: str, field: dict[str, Any]) -> str | None:
    options = field.get("optionLabels") or []
    normalized_answer = normalize(answer)
    if not normalized_answer:
        return None

    for option in options:
        if normalize(option.get("label", "")) == normalized_answer:
            return option.get("value") or option.get("label")

    for option in options:
        option_norm = normalize(option.get("label", ""))
        if normalized_answer in option_norm or option_norm in normalized_answer:
            return option.get("value") or option.get("label")

    if normalized_answer in YES_WORDS:
        for option in options:
            if normalize(option.get("label", "")) in YES_WORDS:
                return option.get("value") or option.get("label")
    if normalized_answer in NO_WORDS:
        for option in options:
            if normalize(option.get("label", "")) in NO_WORDS:
                return option.get("value") or option.get("label")
    return None


def maybe_click_submit(page: Any) -> bool:
    selectors = [
        "button:has-text('Submit')",
        "button:has-text('Apply')",
        "button:has-text('Send application')",
        "input[type='submit']",
    ]
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if locator.count() and locator.is_visible():
                locator.click()
                return True
        except Exception:
            continue
    return False


def run_autofill(
    url: str,
    profile: dict[str, Any],
    answers_data: dict[str, Any],
    cover_letter: str,
    *,
    headless: bool = False,
    submit: bool = False,
) -> dict[str, Any]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit(
            "Playwright is not installed. Run `python3 -m pip install playwright` and `playwright install chromium`."
        ) from exc

    filled: list[str] = []
    skipped: list[str] = []
    resume_path = Path(str(profile.get("resume_path", "") or "")).expanduser()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=headless, slow_mo=75 if not headless else 0)
        page = browser.new_page()
        page.goto(url, wait_until="domcontentloaded")
        print("Browser opened. Log in if needed, then press Enter here once the application form is visible.")
        input()

        fields = page.evaluate(FIELD_SCAN_JS)
        for field in fields:
            candidate = choose_answer(field, profile, answers_data, cover_letter)
            label = field.get("labelText") or field.get("name") or field.get("id") or field.get("placeholder") or "<unnamed>"
            if candidate is None or not candidate.answer.strip():
                skipped.append(label)
                continue

            locator = page.locator(f'[data-jobmaster-id="{field["jobmasterId"]}"]')
            try:
                if field.get("type") == "file":
                    if resume_path.exists():
                        locator.set_input_files(str(resume_path))
                        filled.append(f"{label} <- resume")
                    else:
                        skipped.append(f"{label} (resume path not found)")
                    continue

                if field.get("tag") == "select":
                    option = choose_select_option(candidate.answer, field)
                    if option is None:
                        skipped.append(f"{label} (no select match)")
                        continue
                    locator.select_option(option)
                    filled.append(f"{label} <- {candidate.reason}")
                    continue

                if field.get("type") == "radio":
                    field_value = normalize(str(field.get("currentValue", "")))
                    candidate_value = normalize(candidate.answer)
                    if field_value == candidate_value or field_value in candidate_value or candidate_value in field_value:
                        locator.check()
                        filled.append(f"{label} <- {candidate.reason}")
                    else:
                        skipped.append(f"{label} (radio mismatch)")
                    continue

                if field.get("type") == "checkbox":
                    normalized_answer = normalize(candidate.answer)
                    if normalized_answer in YES_WORDS:
                        locator.check()
                        filled.append(f"{label} <- checked")
                    elif normalized_answer in NO_WORDS:
                        skipped.append(f"{label} (left unchecked)")
                    else:
                        skipped.append(f"{label} (checkbox ambiguous)")
                    continue

                locator.fill(candidate.answer)
                filled.append(f"{label} <- {candidate.reason}")
            except Exception as exc:
                skipped.append(f"{label} ({exc})")

        submitted = False
        if submit:
            print("Autofill finished. Attempting submit.")
            submitted = maybe_click_submit(page)
        else:
            print("Autofill finished. Review the browser, then press Enter to close it.")
            input()

        browser.close()

    return {"filled": filled, "skipped": skipped, "submitted": submitted}

