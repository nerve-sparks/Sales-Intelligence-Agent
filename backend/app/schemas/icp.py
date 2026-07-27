"""Historical module name (kept, like IcpImportBatch, so callers don't churn
over a rename) - the ICP CRUD schemas (IcpOut/IcpCreate/IcpCompaniesOut) that
used to live here have been deleted along with the ICP CRUD API they backed
(no ICP anywhere in the active product). ImportBatchOut is the only survivor:
prospect-upload history has no ICP dependency and is still actively used by
Onboarding/Settings via controllers/icp_imports.py."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ImportBatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    import_batch_id: UUID
    workspace_id: UUID | None = None
    icp_id: UUID | None = None  # legacy, null for new prospect uploads
    icp_name: str | None = None  # legacy
    file_names: list[str] | None = None
    files_processed: int
    total_rows: int
    companies_ingested: int
    signals_extracted: int
    # New pipeline sales-status counts (brief section 7).
    sales_ready_count: int = 0
    high_priority_count: int = 0
    warm_count: int = 0
    monitor_count: int = 0
    low_priority_count: int = 0
    # Legacy read-only counters (old ICP/gate pipeline).
    matched_icp_count: int = 0
    active_count: int = 0
    nurture_count: int = 0
    # 'pending' while background research+scoring is still running (see
    # excel_pipeline.score_companies_in_background) - counts are 0 until this
    # flips to 'complete'.
    scoring_status: str = "complete"
    # Operational status of the background task (brief items 21, 23):
    # pending | complete | complete_with_warnings | failed.
    research_status: str = "pending"
    companies_researched: int = 0
    research_failure_count: int = 0
    llm_failure_count: int = 0
    scoring_failure_count: int = 0
    processing_started_at: datetime | None = None
    processing_completed_at: datetime | None = None
    processing_error: str | None = None
    processing_warnings: list | dict | None = None
    created_at: datetime | None = None
