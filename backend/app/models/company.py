import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    BIGINT,
    TIMESTAMP,
    VARCHAR,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.company_intent import CompanyIntent
    from app.models.company_news import CompanyNews
    from app.models.company_scoop import CompanyScoop
    from app.models.decision_maker import DecisionMaker
    from app.models.organisation import Organisation


class Company(Base):
    __tablename__ = "company"
    __table_args__ = (
        CheckConstraint(
            "ownership_type IN ('public', 'private', 'pe_backed')",
            name="company_ownership_type_check",
        ),
        UniqueConstraint("organisation_id", "zi_company_id", name="company_org_zi_id_key"),
        Index("idx_company_domain", "company_domain"),
        Index("idx_company_zi_id", "zi_company_id"),
        Index("idx_company_organisation_id", "organisation_id"),
    )

    # Tenancy
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisation.organisation_id", ondelete="CASCADE"), nullable=False
    )

    # Which Excel upload most recently created/updated this company (see
    # excel_pipeline.record_import_batch) - lets the Dashboard's timeline
    # picker show only companies/signals from one specific upload, instead
    # of every company the org has ever ingested. Null for companies from
    # before this column existed, or ingested some other way (e.g. ZoomInfo
    # enrichment endpoints).
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("icp_import_batch.import_batch_id", ondelete="SET NULL")
    )

    # ZoomInfo Identity
    zi_company_id: Mapped[int] = mapped_column(BIGINT, nullable=False)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    company_name: Mapped[str] = mapped_column(Text, nullable=False)
    company_domain: Mapped[str | None] = mapped_column(Text)
    company_type: Mapped[str | None] = mapped_column(VARCHAR(50))
    company_status: Mapped[str | None] = mapped_column(VARCHAR(50))
    is_verified: Mapped[bool | None] = mapped_column(Boolean, server_default="false")

    # Firmographics
    employee_count: Mapped[int | None] = mapped_column(Integer)
    employee_range: Mapped[str | None] = mapped_column(VARCHAR(50))
    revenue_usd: Mapped[int | None] = mapped_column(BIGINT)
    revenue_range: Mapped[str | None] = mapped_column(VARCHAR(50))
    ownership_type: Mapped[str | None] = mapped_column(Text)
    founded_year: Mapped[str | None] = mapped_column(VARCHAR(10))
    description: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(Text)

    # HQ Location
    city: Mapped[str | None] = mapped_column(VARCHAR(100))
    state: Mapped[str | None] = mapped_column(VARCHAR(100))
    country: Mapped[str | None] = mapped_column(VARCHAR(100))
    continent: Mapped[str | None] = mapped_column(VARCHAR(100))

    # Industry
    primary_industry: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    industries: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    # Social Media
    linkedin_url: Mapped[str | None] = mapped_column(Text)
    twitter_url: Mapped[str | None] = mapped_column(Text)
    facebook_url: Mapped[str | None] = mapped_column(Text)

    # Funding
    total_funding_amount: Mapped[int | None] = mapped_column(BIGINT)
    recent_funding_amount: Mapped[int | None] = mapped_column(BIGINT)
    recent_funding_date: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))
    company_funding: Mapped[dict | None] = mapped_column(JSONB)

    # Employee Growth
    employee_growth: Mapped[dict | None] = mapped_column(JSONB)

    # Competitors
    competitors: Mapped[dict | None] = mapped_column(JSONB)

    # Technologies
    technologies: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    products: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    # Relationships
    organisation: Mapped["Organisation"] = relationship()
    decision_makers: Mapped[list["DecisionMaker"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    intents: Mapped[list["CompanyIntent"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    news: Mapped[list["CompanyNews"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    scoops: Mapped[list["CompanyScoop"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
