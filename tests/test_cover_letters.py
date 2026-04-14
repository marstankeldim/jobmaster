import unittest

from jobmaster.cover_letters import render_cover_letter


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


if __name__ == "__main__":
    unittest.main()

