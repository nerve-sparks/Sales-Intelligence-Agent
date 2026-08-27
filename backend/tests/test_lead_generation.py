"""ICP-driven lead generation.

The tests that matter most here are the guardrails, not the happy path: an
unverifiable company must never reach the database, and re-running an ICP must
never duplicate companies. Both are properties the feature is worthless
without.

External calls (LLM, you.com) are monkeypatched - the point is to test our
handling of what they return, including the ways they return garbage.
"""

import uuid

import pytest

from app.models import Company, IcpImportBatch
from app.schemas.icp import MAX_GENERATION_TARGET, GenerateLeadsIn
from app.services import lead_generation
from app.services.lead_generation import Candidate, VerifiedLead
from app.core.db import async_session_maker
from app.services.icp_service import create_icp
from sqlalchemy import select


# ── candidate parsing: the model returns text, not data ───────────────────


def test_parses_a_clean_json_array():
    raw = '[{"name": "Acme Industries", "country": "United States", "domain": "acme.com"}]'
    candidates = lead_generation._parse_candidates(raw)

    assert len(candidates) == 1
    assert candidates[0].name == "Acme Industries"
    assert candidates[0].country == "United States"
    assert candidates[0].domain_guess == "acme.com"


def test_parses_through_a_markdown_fence_and_prose():
    """A reply that is 95% right should not be thrown away wholesale."""
    raw = (
        "Sure! Here are some companies:\n```json\n"
        '[{"name": "Globex", "country": "Canada", "domain": "https://www.globex.ca/about"}]'
        "\n```\nHope that helps."
    )
    candidates = lead_generation._parse_candidates(raw)

    assert len(candidates) == 1
    assert candidates[0].name == "Globex"
    # Domain guess is normalised, not stored raw.
    assert candidates[0].domain_guess == "globex.ca"


@pytest.mark.parametrize(
    "raw",
    ["", "I cannot help with that.", "[not json", "{}", '["just a string"]', '[{"country": "US"}]'],
)
def test_unusable_replies_yield_no_candidates_rather_than_raising(raw):
    assert lead_generation._parse_candidates(raw) == []


def test_candidates_without_a_domain_guess_are_kept():
    """A missing domain is fine - verification resolves the real one anyway,
    and the guess is never trusted."""
    candidates = lead_generation._parse_candidates('[{"name": "Initech", "domain": null}]')

    assert len(candidates) == 1
    assert candidates[0].domain_guess is None


# ── verification: the anti-hallucination gate ─────────────────────────────


async def test_unresolvable_candidates_are_rejected(monkeypatch):
    """The whole feature's trustworthiness rests on this: a company the web
    cannot confirm must not become a row."""
    monkeypatch.setattr(lead_generation.you_client, "is_configured", lambda: True)
    monkeypatch.setattr(
        lead_generation.you_client, "search_query", _fake_search({"Northwind Logistics": "northwindlogistics.com"})
    )

    verified, rejected = await lead_generation.verify_candidates(
        [Candidate(name="Northwind Logistics"), Candidate(name="Totally Made Up Ltd")]
    )

    assert [lead.name for lead in verified] == ["Northwind Logistics"]
    assert rejected == 1


async def test_the_llms_domain_guess_is_never_trusted(monkeypatch):
    """A candidate whose guessed domain looks plausible but resolves to
    nothing is still rejected - the guess grants no credibility."""
    monkeypatch.setattr(lead_generation.you_client, "is_configured", lambda: True)
    monkeypatch.setattr(lead_generation.you_client, "search_query", _fake_search({}))

    verified, rejected = await lead_generation.verify_candidates(
        [Candidate(name="Invented Corp", domain_guess="inventedcorp.com")]
    )

    assert verified == []
    assert rejected == 1


async def test_a_search_failure_rejects_only_that_candidate(monkeypatch):
    monkeypatch.setattr(lead_generation.you_client, "is_configured", lambda: True)

    async def flaky(query, num=10):
        if "Boom" in query:
            raise RuntimeError("search exploded")
        return _results_for("Fabrikam Systems", "fabrikamsystems.com")

    monkeypatch.setattr(lead_generation.you_client, "search_query", flaky)

    verified, rejected = await lead_generation.verify_candidates(
        [Candidate(name="Boom Industries"), Candidate(name="Fabrikam Systems")]
    )

    assert [lead.name for lead in verified] == ["Fabrikam Systems"]
    assert rejected == 1


async def test_two_names_resolving_to_one_domain_collapse(monkeypatch):
    """"Acme Corp" and "Acme Corporation" are one company - it must not enter
    the batch twice."""
    monkeypatch.setattr(lead_generation.you_client, "is_configured", lambda: True)
    monkeypatch.setattr(
        lead_generation.you_client,
        "search_query",
        _fake_search({"Acme Corp": "acme.com", "Acme Corporation": "acme.com"}),
    )

    verified, _rejected = await lead_generation.verify_candidates(
        [Candidate(name="Acme Corp"), Candidate(name="Acme Corporation")]
    )

    assert len(verified) == 1
    assert verified[0].domain == "acme.com"


async def test_verification_refuses_to_run_without_search(monkeypatch):
    """Without search there is no way to verify anything, and the only
    alternative - trusting the LLM - is exactly what must never happen."""
    monkeypatch.setattr(lead_generation.you_client, "is_configured", lambda: False)

    with pytest.raises(lead_generation.LeadGenerationError):
        await lead_generation.verify_candidates([Candidate(name="Anything")])


async def test_no_candidates_needs_no_search(monkeypatch):
    monkeypatch.setattr(lead_generation.you_client, "is_configured", lambda: False)
    assert await lead_generation.verify_candidates([]) == ([], 0)


# ── deduplication against the org's existing companies ────────────────────


async def test_leads_already_in_the_org_are_dropped(org_ctx, make_company):
    organisation_id, _workspace_id = org_ctx
    await make_company(company_name="Existing Co", company_domain="existing.com")

    async with async_session_maker() as session:
        kept, dropped = await lead_generation.drop_existing_companies(
            session,
            organisation_id,
            [
                VerifiedLead(name="Existing Co", domain="existing.com", country=None, confidence=0.9),
                VerifiedLead(name="Brand New Co", domain="brandnew.com", country=None, confidence=0.9),
            ],
        )

    assert [lead.domain for lead in kept] == ["brandnew.com"]
    assert dropped == 1


async def test_another_orgs_company_is_not_treated_as_a_duplicate(org_ctx, make_company):
    """Deduplication is per-organisation - one tenant having a company must
    not stop another from discovering it."""
    _organisation_id, _workspace_id = org_ctx
    await make_company(company_name="Shared Co", company_domain="shared.com")

    async with async_session_maker() as session:
        kept, dropped = await lead_generation.drop_existing_companies(
            session,
            uuid.uuid4(),  # a different organisation
            [VerifiedLead(name="Shared Co", domain="shared.com", country=None, confidence=0.9)],
        )

    assert len(kept) == 1
    assert dropped == 0


# ── identity / idempotency ────────────────────────────────────────────────


def test_company_identity_is_derived_from_the_resolved_domain():
    """Re-running an ICP must update companies, not duplicate them. The id is
    hashed from the domain, so the same company resolves to the same row even
    if the LLM phrased its name differently."""
    first = lead_generation.to_company_rows(
        [VerifiedLead(name="Acme Corp", domain="acme.com", country="United States", confidence=0.9)],
        uuid.uuid4(),
    )
    second = lead_generation.to_company_rows(
        [VerifiedLead(name="Acme Corporation", domain="acme.com", country=None, confidence=0.4)],
        uuid.uuid4(),
    )

    assert first[0]["ZoomInfo Company ID"] == second[0]["ZoomInfo Company ID"]


def test_different_domains_get_different_identities():
    rows = lead_generation.to_company_rows(
        [
            VerifiedLead(name="A", domain="a.com", country=None, confidence=0.9),
            VerifiedLead(name="B", domain="b.com", country=None, confidence=0.9),
        ],
        uuid.uuid4(),
    )

    assert rows[0]["ZoomInfo Company ID"] != rows[1]["ZoomInfo Company ID"]


def test_generated_rows_carry_no_invented_firmographics():
    """Revenue/headcount/industry come from enrichment against real sources.
    Anything the LLM offered would be fabrication, so none is carried."""
    rows = lead_generation.to_company_rows(
        [VerifiedLead(name="Acme", domain="acme.com", country="United States", confidence=0.9)],
        uuid.uuid4(),
    )

    assert set(rows[0]) == {
        "ZoomInfo Company ID",
        "ZoomInfo Contact ID",
        "Company Name",
        "Website",
        "Company Country",
    }
    # No contacts by construction - a generated company is a company only.
    assert rows[0]["ZoomInfo Contact ID"] is None
    for fabricated in ("Revenue (in 000s USD)", "Employees", "Primary Industry"):
        assert fabricated not in rows[0]


def test_generated_rows_map_onto_real_company_columns():
    """The rows must be in the canonical shape the existing upload pipeline
    already upserts - generation reuses that path rather than its own."""
    from app.services.zoominfo_mapper import build_company_row

    organisation_id = uuid.uuid4()
    row = lead_generation.to_company_rows(
        [VerifiedLead(name="Acme", domain="acme.com", country="United States", confidence=0.9)],
        organisation_id,
    )[0]
    built = build_company_row(row, organisation_id)

    assert built["company_name"] == "Acme"
    assert built["company_domain"] == "acme.com"
    assert built["country"] == "United States"
    assert built["continent"] == "North America"
    assert built["revenue_usd"] is None and built["employee_count"] is None


# ── prompt construction ───────────────────────────────────────────────────


async def test_prompt_states_only_the_criteria_that_are_set(org_ctx):
    """An unset criterion is not a constraint, so naming it would invent one."""
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        icp = await create_icp(
            session, workspace_id, {"name": "Narrow", "industries": ["Software"], "employee_min": 50}
        )
        summary = lead_generation._icp_summary(icp)

    assert "Software" in summary
    assert "Employee count: 50 to any" in summary
    assert "revenue" not in summary.lower()
    assert "technologies" not in summary.lower()


async def test_prompt_forbids_invented_firmographics(org_ctx):
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "Any"})

    prompt = lead_generation._build_prompt(icp, "We sell AI services", 25, [])

    assert "Never invent a name" in prompt
    assert "Do not include revenue, employee count or industry" in prompt


async def test_prompt_excludes_already_proposed_companies(org_ctx):
    """Each chunk must steer away from what earlier chunks produced, or the
    model just repeats its most obvious answers."""
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "Any"})

    prompt = lead_generation._build_prompt(icp, "offering", 25, ["acme industries"])

    assert "already known" in prompt
    assert "acme industries" in prompt


# ── orchestration ─────────────────────────────────────────────────────────


async def test_generation_requires_an_llm(org_ctx, monkeypatch):
    _org_id, workspace_id = org_ctx
    monkeypatch.setattr(lead_generation.llm_client, "is_configured", lambda: False)

    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "Any"})
        with pytest.raises(lead_generation.LeadGenerationError):
            await lead_generation.propose_candidates(icp, {}, target=5)


async def test_full_pass_verifies_deduplicates_and_caps_to_target(
    org_ctx, make_company, monkeypatch
):
    organisation_id, workspace_id = org_ctx
    await make_company(company_name="Known Co", company_domain="known.com")

    monkeypatch.setattr(lead_generation.llm_client, "is_configured", lambda: True)
    monkeypatch.setattr(lead_generation.you_client, "is_configured", lambda: True)

    async def fake_complete(messages, **kwargs):
        return (
            '[{"name": "Known Co", "domain": "known.com"},'
            ' {"name": "Fresh One", "domain": null},'
            ' {"name": "Fresh Two", "domain": null},'
            ' {"name": "Ghost Co", "domain": null}]'
        )

    monkeypatch.setattr(lead_generation.llm_client, "complete", fake_complete)
    monkeypatch.setattr(
        lead_generation.you_client,
        "search_query",
        _fake_search({"Known Co": "known.com", "Fresh One": "freshone.com", "Fresh Two": "freshtwo.com"}),
    )

    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "Any"})
        result = await lead_generation.generate_leads(session, organisation_id, icp, target=1)

    # Ghost Co unverifiable, Known Co already owned, and target=1 trims the rest.
    assert result.rejected_unresolvable == 1
    assert result.rejected_duplicate == 1
    assert len(result.verified) == 1
    assert result.verified[0].domain in {"freshone.com", "freshtwo.com"}
    assert any("could not be verified" in w for w in result.warnings)


async def test_target_is_capped_regardless_of_what_is_asked_for(org_ctx, monkeypatch):
    """Generation can trivially produce more companies than anyone would
    upload by hand, and each one costs real search + research budget."""
    organisation_id, workspace_id = org_ctx
    seen_targets: list[int] = []

    monkeypatch.setattr(lead_generation.llm_client, "is_configured", lambda: True)

    async def fake_propose(icp, offering, target, trace_user_id=None):
        seen_targets.append(target)
        return [], []

    monkeypatch.setattr(lead_generation, "propose_candidates", fake_propose)

    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "Any"})
        await lead_generation.generate_leads(session, organisation_id, icp, target=10_000)

    assert seen_targets == [lead_generation.MAX_TARGET]


def test_schema_cap_matches_the_service_cap():
    """The schema duplicates the constant (schemas must not import services),
    so it has to be asserted rather than assumed."""
    assert MAX_GENERATION_TARGET == lead_generation.MAX_TARGET
    with pytest.raises(Exception):
        GenerateLeadsIn(target=MAX_GENERATION_TARGET + 1)


# ── batch provenance ──────────────────────────────────────────────────────


async def test_a_generated_batch_records_its_source_and_icp(org_ctx):
    """Provenance is what keeps generated and uploaded leads comparable
    instead of silently merged."""
    from app.services.excel_pipeline import record_import_batch

    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "Target market"})
        batch = await record_import_batch(
            session,
            workspace_id=workspace_id,
            file_names=["Generated from Target market"],
            total_rows=3,
            zi_to_company_id={},
            source="generated",
            icp_id=icp.icp_id,
        )

        stored = (
            await session.execute(
                select(IcpImportBatch).where(IcpImportBatch.import_batch_id == batch.import_batch_id)
            )
        ).scalar_one()

    assert stored.source == "generated"
    assert stored.icp_id == icp.icp_id


async def test_an_upload_batch_defaults_to_the_upload_source(org_ctx):
    from app.services.excel_pipeline import record_import_batch

    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        batch = await record_import_batch(
            session,
            workspace_id=workspace_id,
            file_names=["prospects.xlsx"],
            total_rows=1,
            zi_to_company_id={},
        )

    assert batch.source == "upload"
    assert batch.icp_id is None


# ── helpers ───────────────────────────────────────────────────────────────


def _results_for(name: str, domain: str) -> list[dict]:
    """A search result shaped like you.com's, whose link resolves to `domain`
    and whose text mentions the company - enough for resolve_domain to accept."""
    return [
        {
            "link": f"https://www.{domain}/",
            "title": f"{name} - Official Website",
            "snippet": f"{name} is a company.",
            "position": 0,
        }
    ]


def _fake_search(name_to_domain: dict[str, str]):
    """Patched you_client.search_query: returns a matching result for known
    names and nothing for anything else (i.e. an invented company)."""

    async def _search(query: str, num: int = 10):
        for name, domain in name_to_domain.items():
            if name.lower() in query.lower():
                return _results_for(name, domain)
        return []

    return _search


# ── end to end: the generate endpoint's own orchestration ─────────────────


class _FakeBackgroundTasks:
    """Captures the handoff instead of running it - the background pass is
    already covered by test_job_tracking; what matters here is that
    generation schedules the SAME task an upload does."""

    def __init__(self):
        self.tasks = []

    def add_task(self, func, *args, **kwargs):
        self.tasks.append((func, args, kwargs))


async def test_generate_endpoint_creates_verified_companies_and_a_labelled_batch(
    org_ctx, monkeypatch
):
    """The whole path: ICP -> candidates -> verification -> company rows ->
    a batch marked 'generated' -> the existing scoring task."""
    from app.controllers import icp as icp_controller
    from app.schemas.icp import GenerateLeadsIn
    from app.services import excel_pipeline

    organisation_id, workspace_id = org_ctx

    monkeypatch.setattr(lead_generation.llm_client, "is_configured", lambda: True)
    monkeypatch.setattr(lead_generation.you_client, "is_configured", lambda: True)

    async def fake_complete(messages, **kwargs):
        return (
            '[{"name": "Northwind Logistics", "country": "United States", "domain": null},'
            ' {"name": "Hallucinated Holdings", "country": "United States", "domain": null}]'
        )

    monkeypatch.setattr(lead_generation.llm_client, "complete", fake_complete)
    monkeypatch.setattr(
        lead_generation.you_client,
        "search_query",
        _fake_search({"Northwind Logistics": "northwindlogistics.com"}),
    )

    background = _FakeBackgroundTasks()
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "Logistics", "industries": ["Transportation"]})
        out = await icp_controller.generate(
            workspace_id, icp.icp_id, GenerateLeadsIn(target=5), background, session
        )

        # Only the verifiable company exists; the invented one never persisted.
        companies = (
            await session.execute(
                select(Company).where(Company.organisation_id == organisation_id)
            )
        ).scalars().all()
        names = {c.company_name for c in companies}

        stored = (
            await session.execute(
                select(IcpImportBatch).where(IcpImportBatch.import_batch_id == out.import_batch_id)
            )
        ).scalar_one()

    assert names == {"Northwind Logistics"}
    assert "Hallucinated Holdings" not in names

    # Provenance, so the two populations stay comparable.
    assert stored.source == "generated"
    assert stored.icp_id == icp.icp_id
    assert out.scoring_status == "pending"

    # Handed to the SAME background task an upload uses - no parallel pipeline.
    assert len(background.tasks) == 1
    func, args, _kwargs = background.tasks[0]
    assert func is excel_pipeline.score_companies_in_background
    assert args == (organisation_id, workspace_id, out.import_batch_id)


async def test_re_running_the_same_icp_does_not_duplicate_companies(org_ctx, monkeypatch):
    """Acceptance criterion 10. Identity is hashed from the resolved domain,
    so a second run updates the same row instead of creating a twin."""
    from app.controllers import icp as icp_controller
    from app.schemas.icp import GenerateLeadsIn

    organisation_id, workspace_id = org_ctx

    monkeypatch.setattr(lead_generation.llm_client, "is_configured", lambda: True)
    monkeypatch.setattr(lead_generation.you_client, "is_configured", lambda: True)

    async def fake_complete(messages, **kwargs):
        return '[{"name": "Northwind Logistics", "country": "United States", "domain": null}]'

    monkeypatch.setattr(lead_generation.llm_client, "complete", fake_complete)
    monkeypatch.setattr(
        lead_generation.you_client,
        "search_query",
        _fake_search({"Northwind Logistics": "northwindlogistics.com"}),
    )

    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "Logistics"})
        await icp_controller.generate(
            workspace_id, icp.icp_id, GenerateLeadsIn(target=5), _FakeBackgroundTasks(), session
        )

        # Second run: the company now already exists, so dedup rejects it and
        # there is nothing new to create - which is itself the correct outcome.
        with pytest.raises(Exception) as excinfo:
            await icp_controller.generate(
                workspace_id, icp.icp_id, GenerateLeadsIn(target=5), _FakeBackgroundTasks(), session
            )

        companies = (
            await session.execute(
                select(Company).where(Company.organisation_id == organisation_id)
            )
        ).scalars().all()

    assert len(companies) == 1, "re-running must not create a duplicate company"
    assert "already in your data" in str(excinfo.value)


async def test_generate_reports_a_configuration_problem_distinctly(org_ctx, monkeypatch):
    """A missing LLM/search key is not a user error - it must not read as
    "no companies match your ICP"."""
    from fastapi import HTTPException

    from app.controllers import icp as icp_controller
    from app.schemas.icp import GenerateLeadsIn

    _organisation_id, workspace_id = org_ctx
    monkeypatch.setattr(lead_generation.llm_client, "is_configured", lambda: False)

    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "Any"})
        with pytest.raises(HTTPException) as excinfo:
            await icp_controller.generate(
                workspace_id, icp.icp_id, GenerateLeadsIn(target=5), _FakeBackgroundTasks(), session
            )

    assert excinfo.value.status_code == 503


async def test_generate_rejects_an_icp_from_another_workspace(org_ctx, monkeypatch):
    from fastapi import HTTPException

    from app.controllers import icp as icp_controller
    from app.schemas.icp import GenerateLeadsIn

    _organisation_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "Private"})
        with pytest.raises(HTTPException) as excinfo:
            await icp_controller.generate(
                uuid.uuid4(), icp.icp_id, GenerateLeadsIn(target=5), _FakeBackgroundTasks(), session
            )

    assert excinfo.value.status_code == 404


async def test_a_row_with_a_company_but_no_contact_ingests_the_company(org_ctx):
    """Regression: decision_maker.zi_person_id is NOT NULL, so building a
    contact row for a person-less line aborted the WHOLE upload with an
    integrity error. table_mapper emits such rows for company-only spreadsheet
    lines, and every ICP-generated company is one by construction.
    """
    from app.models import DecisionMaker
    from app.services.excel_pipeline import upsert_rows

    organisation_id, _workspace_id = org_ctx
    rows = [
        {
            "ZoomInfo Company ID": 987654321,
            "ZoomInfo Contact ID": None,
            "Company Name": "Contactless Co",
            "Website": "contactless.example.com",
            "Company Country": "United States",
        }
    ]

    async with async_session_maker() as session:
        await upsert_rows(session, organisation_id, rows)

        companies = (
            await session.execute(select(Company).where(Company.organisation_id == organisation_id))
        ).scalars().all()
        contacts = (
            await session.execute(
                select(DecisionMaker).where(DecisionMaker.organisation_id == organisation_id)
            )
        ).scalars().all()

    assert [c.company_name for c in companies] == ["Contactless Co"]
    assert contacts == [], "no contact exists, so none should be invented"
