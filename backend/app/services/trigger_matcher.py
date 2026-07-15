from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Company, Signal, TriggerDefinition, TriggerEvent, Workspace


async def create_trigger(session: AsyncSession, workspace_id: UUID, values: dict) -> TriggerDefinition:
    trigger = TriggerDefinition(workspace_id=workspace_id, **values)
    session.add(trigger)
    await session.commit()
    await session.refresh(trigger)
    return trigger


async def get_trigger(session: AsyncSession, workspace_id: UUID, trigger_id: UUID) -> TriggerDefinition | None:
    stmt = select(TriggerDefinition).where(
        TriggerDefinition.trigger_id == trigger_id, TriggerDefinition.workspace_id == workspace_id
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def detect_trigger_events(session: AsyncSession, trigger: TriggerDefinition) -> list[TriggerEvent]:
    # A trigger's Workspace belongs to exactly one Organisation - signals are
    # shared across all Workspaces in that Organisation (same as company data),
    # so scope by organisation_id (via the workspace), not by workspace_id.
    workspace = await session.get(Workspace, trigger.workspace_id)

    conditions = []
    if trigger.signal_types:
        conditions.append(Signal.signal_type.in_(trigger.signal_types))
    if trigger.signal_categories:
        conditions.append(Signal.signal_category.in_(trigger.signal_categories))

    if conditions:
        matching_signals = (
            await session.execute(
                select(Signal.signal_id, Signal.company_id)
                .join(Company, Company.company_id == Signal.company_id)
                .where(Company.organisation_id == workspace.organisation_id, or_(*conditions))
            )
        ).all()
        for signal_id, company_id in matching_signals:
            insert_stmt = (
                pg_insert(TriggerEvent)
                .values(trigger_id=trigger.trigger_id, signal_id=signal_id, company_id=company_id)
                .on_conflict_do_nothing(index_elements=["trigger_id", "signal_id"])
            )
            await session.execute(insert_stmt)
        await session.commit()

    stmt = (
        select(TriggerEvent)
        .where(TriggerEvent.trigger_id == trigger.trigger_id)
        .options(selectinload(TriggerEvent.company), selectinload(TriggerEvent.signal))
        .order_by(TriggerEvent.detected_at.desc())
    )
    return (await session.execute(stmt)).scalars().all()
