"""Structured logging for the background pipeline. There's no Celery task_id
here (this app uses asyncio background tasks, not Celery workers - see the
architecture note in excel_pipeline.py) - job_id (the import_batch_id) +
company_id + stage together give the same log-correlation value a Celery
task_id would, since every background operation is already scoped to exactly
one (job, company) pair.

configure_logging() is called once from main.py at import time.
"""

import logging

from app.core.config import get_settings

_CONTEXT_FIELDS = ("job_id", "company_id", "stage")


class _ContextDefaultsFilter(logging.Filter):
    """Log calls elsewhere in the app (outside the background pipeline) don't
    pass job_id/company_id/stage via `extra=` - without a default, the format
    string below would raise a KeyError formatting THOSE records instead of
    just leaving the field blank."""

    def filter(self, record: logging.LogRecord) -> bool:
        for field in _CONTEXT_FIELDS:
            if not hasattr(record, field):
                setattr(record, field, "-")
        return True


def configure_logging() -> None:
    settings = get_settings()
    handler = logging.StreamHandler()
    handler.addFilter(_ContextDefaultsFilter())
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s "
            "job_id=%(job_id)s company_id=%(company_id)s stage=%(stage)s "
            "%(message)s"
        )
    )
    root = logging.getLogger()
    root.setLevel(settings.log_level)
    # Avoid duplicate handlers if configure_logging() is somehow called twice
    # (e.g. re-imported under a test runner).
    root.handlers = [handler]
