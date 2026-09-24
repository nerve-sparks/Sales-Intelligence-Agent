from uuid import UUID

from pydantic import BaseModel


class CurrentUserOut(BaseModel):
    """What GET /auth/me tells the frontend about the currently-authenticated
    gateway account - whether it's already linked to a User row, and if so,
    which organisation/workspace to restore the session to instead of
    sending them through onboarding again.

    user_id/email/full_name/designation identify the caller THEMSELVES,
    resolved from their own app_user row via the verified JWT - never from a
    workspace's member list. The TopBar and Settings' "Your Designation"
    field both used to re-derive "who am I" by searching
    listWorkspaceMembers(activeWorkspaceId) for a matching email, which
    silently showed a DIFFERENT person (the workspace's owner, or its first
    member) whenever the logged-in user switched to a workspace they aren't
    a member of - their own identity should never depend on which workspace
    happens to be active.
    """

    has_account: bool
    organisation_id: UUID | None = None
    workspace_id: UUID | None = None
    user_id: UUID | None = None
    email: str | None = None
    full_name: str | None = None
    designation: str | None = None
