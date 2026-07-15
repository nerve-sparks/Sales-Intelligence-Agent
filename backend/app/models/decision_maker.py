import uuid
from typing import TYPE_CHECKING

from sqlalchemy import BIGINT, VARCHAR, CheckConstraint, ForeignKey, Index, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.company import Company

PERSONA_VALUES = (
    "chairman",
    "board_member",
    "founder",
    "co_founder",
    "ceo",
    "president",
    "coo",
    "cfo",
    "cto",
    "cio",
    "ciso",
    "chief_ai_officer",
    "chief_data_officer",
    "chief_product_officer",
    "chief_strategy_officer",
    "chief_revenue_officer",
    "chief_marketing_officer",
    "chief_sales_officer",
    "chro",
    "general_counsel",
    "evp",
    "svp",
    "vp_operations",
    "vp_sales",
    "director",
    "managing_director",
    "general_manager",
)


class DecisionMaker(Base):
    __tablename__ = "decision_maker"
    __table_args__ = (
        CheckConstraint(
            f"persona IN ({', '.join(repr(v) for v in PERSONA_VALUES)})",
            name="decision_maker_persona_check",
        ),
        UniqueConstraint("organisation_id", "zi_person_id", name="decision_maker_org_zi_person_id_key"),
        Index("idx_dm_company_id", "company_id"),
        Index("idx_dm_persona", "persona"),
        Index("idx_dm_email", "email"),
        Index("idx_dm_organisation_id", "organisation_id"),
    )

    # Tenancy - a person can appear under the same zi_person_id across
    # different Organisations' imports; each Org gets its own row so
    # upserts never reassign a contact between tenants.
    decision_maker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisation.organisation_id", ondelete="CASCADE"), nullable=False
    )

    # ZoomInfo Identity
    zi_person_id: Mapped[int] = mapped_column(BIGINT, nullable=False)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id", ondelete="CASCADE"), nullable=False
    )

    # Name
    first_name: Mapped[str | None] = mapped_column(Text)
    last_name: Mapped[str | None] = mapped_column(Text)
    picture_url: Mapped[str | None] = mapped_column(Text)

    # Role
    job_title: Mapped[str | None] = mapped_column(Text)
    department: Mapped[str | None] = mapped_column(VARCHAR(100))
    years_of_experience: Mapped[str | None] = mapped_column(VARCHAR(50))

    # Persona Tag (SIGNAL layer)
    persona: Mapped[str | None] = mapped_column(Text)

    # Contact Info
    email: Mapped[str | None] = mapped_column(VARCHAR(255))
    phone: Mapped[str | None] = mapped_column(VARCHAR(50))
    mobile_phone: Mapped[str | None] = mapped_column(VARCHAR(50))
    linkedin_url: Mapped[str | None] = mapped_column(Text)

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="decision_makers")
