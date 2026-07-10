import uuid
from typing import TYPE_CHECKING

from sqlalchemy import BIGINT, VARCHAR, CheckConstraint, ForeignKey, Index, Text
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
        Index("idx_dm_company_id", "company_id"),
        Index("idx_dm_persona", "persona"),
        Index("idx_dm_email", "email"),
    )

    # ZoomInfo Identity
    zi_person_id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
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
