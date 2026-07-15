import uuid
from typing import TYPE_CHECKING

from sqlalchemy import BIGINT, TIMESTAMP, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.workspace import Workspace


class IcpProfile(Base):
    __tablename__ = "icp_profile"
    __table_args__ = (
        Index("idx_icp_profile_workspace_id", "workspace_id"),
    )

    icp_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.workspace_id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str | None] = mapped_column(Text)

    industries: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    employee_min: Mapped[int | None] = mapped_column(Integer)
    employee_max: Mapped[int | None] = mapped_column(Integer)
    revenue_min_usd: Mapped[int | None] = mapped_column(BIGINT)
    revenue_max_usd: Mapped[int | None] = mapped_column(BIGINT)
    countries: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    technologies: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    buying_committee_personas: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    created_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    workspace: Mapped["Workspace"] = relationship()
