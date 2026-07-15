from app.models import Workspace, WorkspaceMember


def serialize_workspace(workspace: Workspace) -> dict:
    return {
        "workspace_id": str(workspace.workspace_id),
        "organisation_id": str(workspace.organisation_id),
        "workspace_name": workspace.workspace_name,
        "purpose": workspace.purpose,
        "created_at": workspace.created_at,
    }


def serialize_member(member: WorkspaceMember) -> dict:
    return {
        "workspace_member_id": str(member.workspace_member_id),
        "workspace_id": str(member.workspace_id),
        "user_id": str(member.user_id),
        "email": member.user.email if member.user else None,
        "full_name": member.user.full_name if member.user else None,
        "role": member.role,
        "created_at": member.created_at,
    }
