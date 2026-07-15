from app.models import User


def serialize_user(user: User) -> dict:
    return {
        "user_id": str(user.user_id),
        "organisation_id": str(user.organisation_id),
        "email": user.email,
        "full_name": user.full_name,
        "created_at": user.created_at,
    }
