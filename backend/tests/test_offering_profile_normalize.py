"""Offering Profiles written by the onboarding website prefill are raw LLM
JSON, and the LLM sometimes fills the string lists with objects. Research's
prompt builder joined those lists as text, so every company in a batch failed
with "TypeError: sequence item 0: expected str instance, dict found" - which
was then reported to the user as "LLM unavailable".
"""

from datetime import datetime, timezone

from app.models import Organisation
from app.services.buying_event_service import _build_prompt, _offering_summary
from app.services.offering_profile_service import normalize_profile, profile_for_scoring

# Shape observed from the prefill: objects inside every "string" list.
MALFORMED = {
    "company": "Service Now",
    "positioning": "Digital workflow platform",
    "offerings": [
        {
            "name": "IT Service Management",
            "problems_solved": [{"name": "Slow ticket resolution", "description": "..."}],
            "technologies": [{"name": "AIOps"}, "ITSM"],
            "buying_signals": [{"description": "Hiring IT ops leaders"}],
        },
        "Customer Service Management",
        42,
    ],
    "problems_solved": [{"title": "Manual workflows"}, "Siloed data", None],
    "relevant_technologies": [{"name": "Low-code"}],
    "accelerators": [{"name": "Now Assist", "description": "GenAI"}],
    "alternative_solutions": ["Legacy ITSM", {"category": "Homegrown tools", "inferred": False}, {}],
    "source_url": "https://www.servicenow.com",
}


def test_normalize_turns_every_list_into_text():
    p = normalize_profile(MALFORMED)
    assert p["problems_solved"] == ["Manual workflows", "Siloed data"]
    assert p["relevant_technologies"] == ["Low-code"]
    assert p["accelerators"] == ["Now Assist"]
    assert [o["name"] for o in p["offerings"]] == ["IT Service Management", "Customer Service Management"]
    first = p["offerings"][0]
    assert first["problems_solved"] == ["Slow ticket resolution"]
    assert first["technologies"] == ["AIOps", "ITSM"]
    assert first["buying_signals"] == ["Hiring IT ops leaders"]
    assert p["alternative_solutions"] == [
        {"category": "Legacy ITSM", "inferred": True},
        {"category": "Homegrown tools", "inferred": False},
    ]
    assert p["source_url"] == MALFORMED["source_url"]  # unknown keys kept


def test_normalize_is_idempotent_and_does_not_mutate_input():
    once = normalize_profile(MALFORMED)
    assert normalize_profile(once) == once
    assert MALFORMED["accelerators"] == [{"name": "Now Assist", "description": "GenAI"}]


def test_research_prompt_builds_from_a_malformed_profile():
    """The exact crash from the server logs."""
    summary = _offering_summary(MALFORMED)
    assert "Accelerators: Now Assist" in summary
    company = {"company_name": "Airbyte", "company_domain": "airbyte.com"}
    item = {"title": "Airbyte raises Series B", "url": "https://example.com", "snippet": "Funding news"}
    prompt = _build_prompt(company, MALFORMED, [item], datetime.now(timezone.utc))
    assert "Airbyte" in prompt


def test_profiles_already_stored_malformed_are_fixed_on_read():
    org = Organisation(company_name="Service Now", offering_profile=MALFORMED)
    assert profile_for_scoring(org)["accelerators"] == ["Now Assist"]
