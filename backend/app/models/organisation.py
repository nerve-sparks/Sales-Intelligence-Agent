import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.workspace import Workspace


class Organisation(Base):
    """The tenant boundary - one per paying customer.

    Merges onboarding step 1 (account identity/subdomain) and step 2
    (company profile) into a single record; both describe the same tenant.
    """

    __tablename__ = "organisation"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )

    # Onboarding step 1 - account identity (subdomain-bound)
    account_name: Mapped[str | None] = mapped_column(Text)
    account_url: Mapped[str | None] = mapped_column(Text, unique=True)
    account_logo_url: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str | None] = mapped_column(Text)

    # Onboarding step 2 - company profile
    company_name: Mapped[str] = mapped_column(Text, nullable=False)
    website: Mapped[str | None] = mapped_column(Text)
    legal_business_name: Mapped[str | None] = mapped_column(Text)
    industry: Mapped[str | None] = mapped_column(Text)
    sub_industry: Mapped[str | None] = mapped_column(Text)
    headquarters_location: Mapped[str | None] = mapped_column(Text)
    founded_year: Mapped[str | None] = mapped_column(Text)
    employee_count_range: Mapped[str | None] = mapped_column(Text)
    annual_revenue_range: Mapped[str | None] = mapped_column(Text)
    business_type: Mapped[str | None] = mapped_column(Text)
    company_description: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    users: Mapped[list["User"]] = relationship(back_populates="organisation")
    workspaces: Mapped[list["Workspace"]] = relationship(back_populates="organisation")
