from uuid import UUID

from pydantic import BaseModel


class CurrentUserOut(BaseModel):
    """What GET /auth/me tells the frontend about the currently-authenticated
    Firebase account - whether it's already linked to a User row, and if so,
    which organisation/workspace to restore the session to instead of
    sending them through onboarding again."""

    has_account: bool
    organisation_id: UUID | None = None
    workspace_id: UUID | None = None
