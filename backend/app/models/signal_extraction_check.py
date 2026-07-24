from sqlalchemy import TIMESTAMP, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SignalExtractionCheck(Base):
    """Marks that a news/scoop row (keyed by the same 'news:{id}'/'scoop:{id}'
    string used as Signal.original_source) has been through extraction at
    least once - regardless of whether it produced a real Signal row.

    Signal.original_source alone can't answer "have we checked this" for
    rows that were classified/LLM-judged and correctly found to carry no
    real signal (classify_scoop returning None, or the LLM saying "none") -
    those never get a Signal row, so without this table they were
    re-classified (and, if they landed on the LLM fallback, re-sent to
    Gemini) on every single upload, forever. See signal_extractor.py's
    _already_checked_sources / _mark_checked.
    """

    __tablename__ = "signal_extraction_check"

    original_source: Mapped[str] = mapped_column(Text, primary_key=True)
    checked_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )
