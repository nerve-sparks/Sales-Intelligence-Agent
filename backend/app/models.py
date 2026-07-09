import uuid

from sqlalchemy import (
    BIGINT,
    TIMESTAMP,
    VARCHAR,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

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


class Company(Base):
    __tablename__ = "company"
    __table_args__ = (
        CheckConstraint(
            "ownership_type IN ('public', 'private', 'pe_backed')",
            name="company_ownership_type_check",
        ),
        Index("idx_company_domain", "company_domain"),
        Index("idx_company_zi_id", "zi_company_id"),
    )

    # ZoomInfo Identity
    zi_company_id: Mapped[int] = mapped_column(BIGINT, unique=True, nullable=False)
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


class CompanyIntent(Base):
    __tablename__ = "company_intent"
    __table_args__ = (
        Index("idx_intent_company_id", "company_id"),
        Index("idx_intent_topic", "topic"),
        Index("idx_intent_signal_score", text("signal_score DESC")),
        Index("idx_intent_signal_date", "signal_date"),
    )

    # ZoomInfo Identity
    intent_id: Mapped[str] = mapped_column(Text, primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id", ondelete="CASCADE"), nullable=False
    )

    # Intent Data
    category: Mapped[str | None] = mapped_column(Text)
    topic: Mapped[str | None] = mapped_column(Text)
    signal_score: Mapped[int | None] = mapped_column(SmallInteger)
    signal_date: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))

    # Recommended Contacts
    # [{id, firstName, lastName, jobTitle, jobFunctions: [{name, department}]}]
    recommended_contacts: Mapped[dict | None] = mapped_column(JSONB)

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="intents")


class CompanyNews(Base):
    __tablename__ = "company_news"
    __table_args__ = (
        Index("idx_news_company_id", "company_id"),
        Index("idx_news_category", "category"),
        Index("idx_news_page_date", text("page_date DESC")),
    )

    # Identity
    news_id: Mapped[str] = mapped_column(Text, primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id", ondelete="CASCADE"), nullable=False
    )

    # Article Data
    domain: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    page_date: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="news")


class CompanyScoop(Base):
    __tablename__ = "company_scoop"
    __table_args__ = (
        Index("idx_scoop_company_id", "company_id"),
        Index("idx_scoop_published_date", text("published_date DESC")),
    )

    # Identity
    scoop_id: Mapped[str] = mapped_column(Text, primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id", ondelete="CASCADE"), nullable=False
    )

    # Scoop Data
    description: Mapped[str | None] = mapped_column(Text)
    published_date: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))

    # Topic & Type
    topics: Mapped[dict | None] = mapped_column(JSONB)  # [{id, topic}]
    types: Mapped[dict | None] = mapped_column(JSONB)  # [{id, type}]

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="scoops")
