"""Competitor detection: a mild, graded negative parameter.

Research may judge that a prospect itself SELLS what the tenant sells. That
costs it 5-20 points (by overlap) and puts a badge on it - never more than 20,
never a hidden company, and never a wipe-out of its real buying evidence. The
AI-made competitor list (Organisation.competitors) only keeps competitors out
of ICP lead generation; it never touches a score.
"""

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from sqlalchemy import select

from app.core import scoring_config as cfg
from app.core.db import async_session_maker
from app.models import BuyingEvent, Company, LeadScore
from app.services import buying_event_service as bes
from app.services import competitor_matching as cm
from app.services import evidence_scorer as es
from app.services import lead_generation
from app.services.offering_profile_service import pop_named_competitors

NOW = datetime.now(timezone.utc)
COMPANY_ID = "22222222-2222-2222-2222-222222222222"


def _cls(**over):
    values = {
        "is_real_company_event": True,
        "event_type": "solution_adoption",
        "event_category": "competitive_context",
        "event_summary": "Acme sells AI consulting",
        "event_status": "active",
        "event_date": NOW.strftime("%Y-%m-%d"),
        "seller_relevance": 0.0,
        "extraction_confidence": 0.9,
        "is_negative": True,
        "negative_type": "is_competitor",
        "competitor_strength": "strong",
        "canonical_subject": "Acme",
        "canonical_action": "sells",
        "canonical_object": "AI consulting services",
    }
    values.update(over)
    return values


def _evidence(url):
    return {"url": url, "domain": url.split("/")[2], "title": "t", "snippet": "s",
            "published_date": NOW.isoformat(), "source_type": "reputable_independent", "company_match": 0.95}


# ── extraction ────────────────────────────────────────────────────────────


def test_confident_competitor_read_gets_its_own_event_type():
    out = bes._apply_negative_type(_cls())
    assert out["event_type"] == cfg.COMPETITOR_EVENT_TYPE
    assert out["competitor_strength"] == "strong"


def test_low_confidence_competitor_read_is_dropped():
    assert bes._apply_negative_type(_cls(extraction_confidence=0.5)) is None


def test_competitor_read_without_valid_strength_is_dropped():
    assert bes._apply_negative_type(_cls(competitor_strength="huge")) is None
    assert bes._apply_negative_type(_cls(competitor_strength=None)) is None


def test_vendor_selected_is_persisted_as_its_own_type():
    out = bes._apply_negative_type(_cls(negative_type="vendor_selected", competitor_strength=None))
    assert out["event_type"] == cfg.VENDOR_SELECTED_EVENT_TYPE


def test_positive_events_are_untouched():
    cls = _cls(is_negative=False, negative_type=None)
    assert bes._apply_negative_type(cls) is cls


def _accepted(cls, url):
    cls = bes._apply_negative_type(cls)
    return {"cls": cls, "evidence": _evidence(url), "event_type": cls["event_type"], "relevance": 0.0}


def test_penalty_follows_strength():
    for strength, expected in cfg.COMPETITOR_PENALTY_BY_STRENGTH.items():
        groups = bes._build_canonical_events(COMPANY_ID, [_accepted(_cls(competitor_strength=strength), "https://a.com/1")], NOW)
        (only,) = groups.values()
        assert only["penalty_value"] == expected, strength


def test_merged_competitor_reads_keep_the_strongest_overlap():
    accepted = [
        _accepted(_cls(competitor_strength="partial", extraction_confidence=0.95), "https://a.com/1"),
        _accepted(_cls(competitor_strength="direct", extraction_confidence=0.75), "https://b.com/2"),
    ]
    groups = bes._build_canonical_events(COMPANY_ID, accepted, NOW)
    assert len(groups) == 1
    assert next(iter(groups.values()))["penalty_value"] == 20


def test_competitor_read_does_not_suppress_positive_events_from_the_same_article():
    url = "https://news.example.com/launch"
    positive = {
        "cls": _cls(is_negative=False, negative_type=None, competitor_strength=None,
                    event_type="transformation_program", seller_relevance=0.8,
                    canonical_action="launched", canonical_object="AI transformation program"),
        "evidence": _evidence(url), "event_type": "transformation_program", "relevance": 0.8,
    }
    groups = bes._build_canonical_events(COMPANY_ID, [positive, _accepted(_cls(), url)], NOW)
    assert {g["event_type"] for g in groups.values()} == {"transformation_program", cfg.COMPETITOR_EVENT_TYPE}


def test_prompt_offers_the_competitor_judgement():
    from app.services.offering_profile_service import XSPARKS_FALLBACK_PROFILE

    prompt = bes._build_prompt({"company_name": "X", "company_domain": "x.com"}, XSPARKS_FALLBACK_PROFILE, [], NOW)
    assert "is_competitor" in prompt and "competitor_strength" in prompt


# ── scoring maths ─────────────────────────────────────────────────────────


def test_competitor_penalty_is_strongest_read_capped_at_twenty():
    assert es.competitor_penalty([]) == 0
    assert es.competitor_penalty([5, 15]) == 15
    assert es.competitor_penalty([20, 20, 20]) == 20
    assert es.competitor_penalty([35]) == 20


def test_strength_label_round_trips_from_penalty():
    for strength, penalty in cfg.COMPETITOR_PENALTY_BY_STRENGTH.items():
        assert es.competitor_strength_for(penalty) == strength
    assert es.competitor_strength_for(0) is None


async def _add_event(company_id, **overrides):
    values = dict(
        company_id=company_id,
        canonical_key=f"competitor-test-{uuid.uuid4().hex[:12]}",
        event_type="vendor_evaluation", category="buying_stage",
        title="Acme evaluating AI vendors", summary="Acme is evaluating AI vendors",
        evidence=[{"url": f"https://x.example.com/{uuid.uuid4().hex[:6]}", "company_match": 0.9}],
        published_at=NOW - timedelta(days=3),
        base_strength=70, relevance=0.9, freshness=1.0, source_quality=0.82,
        extraction_confidence=0.9, status_factor=1.0, event_score=46.49,
        is_negative=False, is_stale=False,
    )
    values.update(overrides)
    async with async_session_maker() as session:
        session.add(BuyingEvent(**values))
        await session.commit()


async def _score(company_id) -> LeadScore:
    async with async_session_maker() as session:
        company = await session.get(Company, company_id)
        await es.score_company(session, company, NOW)
        await session.commit()
        return (await session.execute(select(LeadScore).where(LeadScore.company_id == company_id))).scalar_one()


async def test_competitor_loses_only_its_graded_penalty_and_stays_scored(make_company):
    competitor = await make_company(company_name="Rival AI Consulting")
    prospect = await make_company(company_name="Plain Prospect")
    for company in (competitor, prospect):
        await _add_event(company.company_id)
    await _add_event(
        competitor.company_id, event_type=cfg.COMPETITOR_EVENT_TYPE, category="competitive_context",
        title="Rival AI Consulting launches AI services", summary="Sells AI consulting",
        is_negative=True, penalty_value=15, event_score=0,
    )

    rival, plain = await _score(competitor.company_id), await _score(prospect.company_id)

    assert round(float(plain.lead_score) - float(rival.lead_score), 2) == 15
    assert rival.competitor_strength == "strong"
    assert rival.competitor_detail["penalty"] == 15
    assert "possible_competitor" in (rival.scoring_warnings or [])
    assert not (rival.why_now or "").startswith("DISQUALIFIED")
    assert plain.competitor_strength is None and plain.competitor_detail is None


async def test_competitor_label_clears_when_the_read_goes_stale(make_company):
    company = await make_company()
    await _add_event(company.company_id)
    await _add_event(
        company.company_id, event_type=cfg.COMPETITOR_EVENT_TYPE, is_negative=True, penalty_value=10,
        event_score=0, is_stale=True,
    )
    score = await _score(company.company_id)
    assert score.competitor_strength is None


# ── AI competitor list + lead generation ──────────────────────────────────


def test_named_competitors_are_split_out_of_the_profile():
    profile, competitors = pop_named_competitors({
        "company": "XSparks", "offerings": [{"name": "AI"}],
        "named_competitors": [
            {"name": "Accenture", "domain": "https://www.accenture.com/us"},
            {"name": "Accenture plc", "domain": "accenture.com"},
            {"name": "Fractal Analytics"}, "Tiger Analytics", {"name": ""}, 7,
        ],
    })
    assert "named_competitors" not in profile
    assert competitors == [
        {"name": "Accenture", "domain": "accenture.com"},
        {"name": "Fractal Analytics", "domain": None},
        {"name": "Tiger Analytics", "domain": None},
    ]


def test_matching_is_strict():
    index = cm.build_index([{"name": "Acme Inc.", "domain": "acme.com"}, {"name": "Fractal Analytics", "domain": None}])
    assert index.match("Anything", "https://www.acme.com/about")
    assert index.match("Anything", "eu.acme.com")
    assert index.match("ACME, Inc", None)
    assert index.match("fractal analytics ltd", "fractal.ai")
    assert index.match("Acme Logistics", "acmelogistics.com") is None
    assert index.match("Other", "notacme.com") is None
    assert not cm.build_index(None)


def test_lead_prompt_names_competitors_separately():
    icp = SimpleNamespace(industries=[], countries=[], employee_min=None, employee_max=None,
                          revenue_min_usd=None, revenue_max_usd=None, technologies=[],
                          buying_committee_personas=[], departments=[])
    prompt = lead_generation._build_prompt(icp, "offering", 10, ["Known Co"], ["Accenture"])
    assert "competitors - NEVER propose them:\nAccenture" in prompt
    # Ahead of the truncatable "already known" list.
    assert prompt.index("Accenture") < prompt.index("Known Co")
    assert "competitors" not in lead_generation._build_prompt(icp, "offering", 10, [])


def test_drop_competitors_on_candidates_and_verified_leads():
    index = cm.build_index([{"name": "Accenture", "domain": "accenture.com"}])
    candidates = [lead_generation.Candidate(name="Accenture"), lead_generation.Candidate(name="Tata Steel")]
    kept, dropped = lead_generation.drop_competitors(candidates, index)
    assert [c.name for c in kept] == ["Tata Steel"] and dropped == 1

    leads = [lead_generation.VerifiedLead(name="Acc Services", domain="accenture.com", country=None, confidence=0.9)]
    assert lead_generation.drop_competitors(leads, index) == ([], 1)
    assert lead_generation.drop_competitors(leads, cm.build_index([])) == (leads, 0)
