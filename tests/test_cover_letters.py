import unittest

from jobmaster.cover_letters import latex_to_text, render_cover_letter
from jobmaster.summary import generate_professional_summary


class CoverLetterTests(unittest.TestCase):
    def test_render_uses_job_and_profile_context(self) -> None:
        template = "Hello {company}, I am {full_name} applying for {title}."
        job = {"company": "Acme", "title": "Backend Engineer", "location": "Remote"}
        profile = {"full_name": "Ayan", "summary": "Builder"}
        rendered = render_cover_letter(template, job, profile)
        self.assertEqual(rendered, "Hello Acme, I am Ayan applying for Backend Engineer.")

    def test_missing_fields_remain_visible(self) -> None:
        template = "Question: {custom_field}"
        rendered = render_cover_letter(template, {}, {})
        self.assertEqual(rendered, "Question: {custom_field}")

    def test_latex_is_reduced_to_plain_text_for_autofill(self) -> None:
        latex = r"""\opening{Dear Team,}

I am applying for the role.

\closing{Sincerely,}"""
        self.assertEqual(latex_to_text(latex), "Dear Team,\n\nI am applying for the role.\n\nSincerely,")

    def test_default_latex_template_renders_without_format_errors(self) -> None:
        from jobmaster.config import DEFAULT_COVER_LETTER_TEMPLATE

        rendered = render_cover_letter(
            DEFAULT_COVER_LETTER_TEMPLATE,
            {"company": "Acme", "title": "Engineer", "location": "Remote"},
            {
                "full_name": "Ayan",
                "email": "a@example.com",
                "phone": "123",
                "summary": "Summary",
                "top_skills": "Python",
            },
        )
        self.assertIn(r"\begin{letter}{Acme Hiring Team \\ Remote}", rendered)
        self.assertIn(r"\signature{Ayan}", rendered)

    def test_summary_generation_uses_candidate_source_data(self) -> None:
        profile = {"top_skills": "Python, automation, APIs"}
        candidate_sources = {
            "github": {
                "bio": "Electrical Engineering @ Penn State | Robotics (ROS), Controls, Embedded | Seeking EE/Robotics Internships",
                "repository_count": 5,
                "repositories": [{"description": "tailored applications to jobs with custom cv and your resume", "language": "Python"}],
            },
            "preferences": {"target_roles": "robotics, controls, embedded, and automation internships", "industries": ""},
            "education": {},
            "project_highlights": [],
        }
        summary = generate_professional_summary(profile, candidate_sources)
        self.assertIn("Penn State electrical engineering student", summary)
        self.assertIn("robotics", summary.lower())
        self.assertIn("automation", summary.lower())


if __name__ == "__main__":
    unittest.main()
