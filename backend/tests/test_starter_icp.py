"""Starter ICP - naming, the deterministic fallback, validation of LLM
suggestions against the ICP form's vocabularies, and the rule that a
Starter ICP is only ever re-filled until the user edits it.

The LLM is always monkeypatched here - no real network calls.
"""

import json

from app.core.db import async_session_maker
from app.models import Organisation
from app.schemas.icp import IcpCreate
from app.services import llm_client, starter_icp
from app.services.icp_service import create_icp, get_icp, update_icp
from app.services.starter_icp import (
    _validate_llm,
    build_starter_values,
    create_starter_icp,
    fallback_values,
    refresh_starter_icps,
    starter_name,
)

OFFERING_PROFILE = {
    "company": "ServiceNow",
    "positioning": "Digital workflow platform",
    "offerings": [{"name": "ITSM", "problems_solved": ["slow IT tickets"], "technologies": ["Workflow Automation"]}],
    "problems_solved": ["manual workflows"],
    "relevant_technologies": ["ITSM", "AIOps", "itsm"],
}


def _org(**overrides) -> Organisation:
    values = dict(
        company_name="ServiceNow",
        industry="Software",
        headquarters_location="North America",
        offering_profile=OFFERING_PROFILE,
    )
    values.update(overrides)
    return Organisation(**values)


def _fake_llm(monkeypatch, reply: str | Exception):
    async def fake_complete(*_args, **_kwargs):
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(llm_client, "complete", fake_complete)


def test_fallback_is_filled_and_descriptively_named():
    values = fallback_values(_org())
    assert values["name"] == "Software companies in United States & Canada"
    assert values["industries"] == ["Software"]
    assert values["countries"] == ["United States", "Canada"]
    # Offering Profile technologies, de-duplicated case-insensitively.
    assert values["technologies"] == ["ITSM", "AIOps", "Workflow Automation"]
    assert values["buying_committee_personas"] == ["ceo", "cto", "cio"]
    assert "departments" not in values


def test_name_falls_back_to_the_company_then_a_generic_name():
    assert starter_name({}, _org()) == "ServiceNow target customers"
    assert starter_name({}, _org(company_name="  ")) == "Starter ICP"
    assert (
        starter_name({"industries": ["Software", "Finance", "Retail"]}, _org())
        == "Software, Finance +1 companies"
    )


def test_llm_values_are_validated_against_the_icp_vocabularies():
    cleaned = _validate_llm(
        {
            "name": "  Mid-market software in North America  ",
            "industries": ["software", "Made Up Industry", "Finance"],
            "employee_band": 3,
            "revenue_band": 99,
            "countries": ["United States", "Atlantis"],
            "technologies": ["Snowflake", "", 42],
            "personas": ["CTO", "janitor", "cio"],
        }
    )
    assert cleaned["name"] == "Mid-market software in North America"
    assert cleaned["industries"] == ["Software", "Finance"]
    assert (cleaned["employee_min"], cleaned["employee_max"]) == (201, 500)
    assert "revenue_min_usd" not in cleaned  # out-of-range band ignored
    assert cleaned["countries"] == ["United States"]
    assert cleaned["technologies"] == ["Snowflake"]
    assert cleaned["buying_committee_personas"] == ["cto", "cio"]


async def test_llm_suggestion_overrides_the_fallback(monkeypatch):
    _fake_llm(
        monkeypatch,
        "Sure:\n"
        + json.dumps(
            {
                "name": "Enterprise IT teams in North America",
                "industries": ["Finance", "Insurance"],
                "employee_band": 5,
                "revenue_band": 5,
                "countries": ["United States", "Canada"],
                "technologies": ["ServiceNow", "Jira"],
                "personas": ["cio", "cto"],
            }
        ),
    )
    values = await build_starter_values(_org(), use_llm=True)
    assert values["name"] == "Enterprise IT teams in North America"
    assert values["industries"] == ["Finance", "Insurance"]
    assert (values["employee_min"], values["employee_max"]) == (1000, None)
    assert (values["revenue_min_usd"], values["revenue_max_usd"]) == (250_000_000, None)
    assert values["buying_committee_personas"] == ["cio", "cto"]


async def test_llm_failure_or_garbage_keeps_the_fallback(monkeypatch):
    expected = fallback_values(_org())
    _fake_llm(monkeypatch, RuntimeError("proxy down"))
    assert await build_starter_values(_org(), use_llm=True) == expected
    _fake_llm(monkeypatch, "not json at all")
    assert await build_starter_values(_org(), use_llm=True) == expected


async def test_refresh_only_touches_unedited_starter_icps(org_ctx, monkeypatch):
    organisation_id, workspace_id = org_ctx
    _fake_llm(monkeypatch, json.dumps({"name": "Refilled", "industries": ["Retail"]}))
    async with async_session_maker() as session:
        org = await session.get(Organisation, organisation_id)
        org.industry = "Software"
        await session.commit()
        starter = await create_starter_icp(session, workspace_id, org)
        user_icp = await create_icp(session, workspace_id, {"name": "Mine", "industries": ["Finance"]})

        assert await refresh_starter_icps(session, organisation_id) == 1
        refreshed = await get_icp(session, workspace_id, starter.icp_id)
        assert (refreshed.name, refreshed.industries, refreshed.auto_generated) == ("Refilled", ["Retail"], True)
        untouched = await get_icp(session, workspace_id, user_icp.icp_id)
        assert (untouched.name, untouched.industries) == ("Mine", ["Finance"])


async def test_a_user_edit_makes_the_starter_theirs_for_good(org_ctx, monkeypatch):
    organisation_id, workspace_id = org_ctx
    _fake_llm(monkeypatch, json.dumps({"name": "Refilled"}))
    async with async_session_maker() as session:
        org = await session.get(Organisation, organisation_id)
        starter = await create_starter_icp(session, workspace_id, org)
        await update_icp(session, workspace_id, starter.icp_id, IcpCreate(name="My edit").model_dump())

        assert await refresh_starter_icps(session, organisation_id) == 0
        edited = await get_icp(session, workspace_id, starter.icp_id)
        assert (edited.name, edited.auto_generated) == ("My edit", False)


def test_module_exports_background_entry_point():
    assert callable(starter_icp.refresh_starter_icps_in_background)
