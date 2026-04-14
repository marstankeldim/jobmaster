import tempfile
import unittest
from pathlib import Path

from jobmaster.db import create_job, get_job, init_db, summary_counts, update_job


class DatabaseTests(unittest.TestCase):
    def test_create_and_update_job(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "jobmaster.db"
            init_db(db_path)
            job_id = create_job("Acme", "Platform Engineer", db_path=db_path)
            job = get_job(job_id, db_path=db_path)
            self.assertIsNotNone(job)
            self.assertEqual(job["status"], "saved")

            update_job(
                job_id,
                {
                    "company": "Acme",
                    "title": "Platform Engineer",
                    "location": "Remote",
                    "source": "Referral",
                    "job_url": "https://example.com",
                    "compensation": "$150k",
                    "status": "submitted",
                    "notes": "Applied",
                },
                db_path=db_path,
            )
            updated = get_job(job_id, db_path=db_path)
            self.assertEqual(updated["status"], "submitted")
            self.assertEqual(summary_counts(db_path)["submitted"], 1)


if __name__ == "__main__":
    unittest.main()

