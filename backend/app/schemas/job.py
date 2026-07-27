"""Per-company job monitoring - GET .../imports/{id}, GET .../imports/{id}/items,
POST .../retry-failed, POST .../cancel. "Job" here is exactly the existing
IcpImportBatch/CompanyImportBatch pair (job_id == import_batch_id); this
module just gives that existing data a job-shaped read view, it does not
introduce a new underlying resource.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

# Overall job status (distinct from the lower-level research_status/
# scoring_status fields already on IcpImportBatch, which several existing
# pages read) - computed fresh from the current per-company status tally
# rather than stored, so it can never drift out of sync with the real
# per-company state.
JOB_STATUSES = ("queued", "processing", "partially_completed", "completed", "failed", "cancelled")

# Per-company pipeline stages actually used by this app's background
# pipeline (excel_pipeline.py + search_signal_ingest.py + evidence_scorer.py)
# - no decision-maker-lookup or email-generation stage, neither exists here.
COMPANY_STATUSES = ("queued", "researching", "scoring", "completed", "retrying", "failed", "needs_review")


class JobStatusOut(BaseModel):
    job_id: UUID
    status: str  # one of JOB_STATUSES
    total: int
    queued: int
    processing: int  # researching + scoring + retrying, collapsed
    completed: int
    failed: int
    needs_review: int
    progress_percentage: float


class JobItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    company_id: UUID
    company_name: str
    status: str
    error_message: str | None = None
    retry_count: int
    started_at: datetime | None = None
    completed_at: datetime | None = None


class JobItemsOut(BaseModel):
    items: list[JobItemOut]
    total: int
    page: int
    page_size: int


class RetryFailedOut(BaseModel):
    retried_count: int
    status: JobStatusOut
