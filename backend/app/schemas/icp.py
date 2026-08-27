"""ICP schemas + prospect-import history schemas.

Two unrelated things share this module for historical reasons (the name
predates the split, and ImportBatchOut has many callers):

- IcpBase/IcpCreate/IcpOut back the ICP CRUD API (routes/icp.py). These were
  deleted in 2ba62a9 when ICP-as-a-scoring-filter was removed, and are
  restored here for ICP-as-a-discovery-seed - a different feature with the
  same storage. IcpCompaniesOut is deliberately NOT restored: it backed
  "which companies match this ICP", which is exactly the filtering semantics
  the product moved away from.
- ImportBatchOut is prospect-upload history, which has no ICP dependency and
  is served by controllers/icp_imports.py.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ImportBatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    import_batch_id: UUID
    workspace_id: UUID | None = None
    # 'upload' (a person supplied a file) or 'generated' (discovered from an
    # ICP). Generated batches set icp_id to the ICP they came from; uploads
    # leave it null.
    source: str = "upload"
    icp_id: UUID | None = None
    icp_name: str | None = None
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


class IcpBase(BaseModel):
    """The ICP criteria a user can set. Shared by create (POST) and
    full-replace update (PUT) - both accept exactly the same fields, so an
    omitted field means "no constraint on this criterion" in either case.

    Deliberately excludes fit_mode: it encoded the old strict/flexible
    ICP-fit *band* from the removed gate/D1-D7 scorer, and the current
    product scores purely on evidence (see evidence_scorer.py). An ICP is a
    seed for discovery, never a term in the Lead Score.
    """

    name: str | None = None
    industries: list[str] | None = None
    employee_min: int | None = None
    employee_max: int | None = None
    revenue_min_usd: int | None = None
    revenue_max_usd: int | None = None
    countries: list[str] | None = None
    technologies: list[str] | None = None
    buying_committee_personas: list[str] | None = None
    departments: list[str] | None = None

    @model_validator(mode="after")
    def _check_ranges(self):
        # A reversed range silently matches nothing, which reads as "no
        # companies like this exist" rather than "this ICP is impossible" -
        # reject it at the edge instead.
        if self.employee_min is not None and self.employee_max is not None:
            if self.employee_min > self.employee_max:
                raise ValueError("employee_min cannot be greater than employee_max")
        if self.revenue_min_usd is not None and self.revenue_max_usd is not None:
            if self.revenue_min_usd > self.revenue_max_usd:
                raise ValueError("revenue_min_usd cannot be greater than revenue_max_usd")
        return self


class IcpCreate(IcpBase):
    pass


class IcpOut(IcpBase):
    model_config = ConfigDict(from_attributes=True)

    icp_id: UUID
    workspace_id: UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None


class IcpOptionsOut(BaseModel):
    """Vocabulary for the ICP form's pickers, served from the backend so the
    frontend never carries a second copy that can drift from what the data
    actually contains.

    This matters more than it looks: an earlier ICP form hardcoded invented
    industry labels ("Software & SaaS") that matched no real company, and a
    persona list missing 10 of the real values, so criteria silently selected
    nothing. Industries come from industry_sectors (the same mapping the
    Dashboard/Enterprise List segment on) and personas from the
    decision_maker.persona CHECK constraint.
    """

    industries: list[str]
    sectors: dict[str, list[str]]
    personas: list[str]
    departments: list[str]


# Mirrors lead_generation.MAX_TARGET. Duplicated as a literal rather than
# imported because schemas must not depend on services (services import
# schemas); tests/test_lead_generation.py asserts the two stay equal.
MAX_GENERATION_TARGET = 100


class GenerateLeadsIn(BaseModel):
    """Request body for POST /workspaces/{id}/icp/{icp_id}/generate.

    `target` is capped because generation is the one path that can create far
    more companies than anyone would upload by hand, and every company costs a
    verification search plus a full research pass. Precision beats volume here:
    a short verified list is worth more than a long padded one.
    """

    target: int = Field(default=25, ge=1, le=MAX_GENERATION_TARGET)
