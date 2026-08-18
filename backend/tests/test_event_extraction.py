"""Extraction/dedup invariants for buying_event_service.

Two bugs are guarded here, both of which silently distorted scores rather than
failing loudly:

  1. ONE EVENT PER URL. _parse used to key classifications by evidence index,
     one object per index, so a result covering several events kept only the
     last. A company newsroom listing dozens of dated press releases - the
     single richest source in a result set - could therefore only ever yield
     one event.

  2. SAME EVENT COUNTED N TIMES. Three articles about one Inseego earnings
     announcement became three separate scored events because the model
     described each headline's angle ("falls after weak guidance" / "earnings
     call transcript" / "expects $155M revenue") instead of the underlying
     happening. With EVIDENCE_WEIGHTS = [1.0, 0.6, 0.4] that one story
     occupied all three evidence slots and supplied ~70% of the company's
     Lead Score.

Pure unit tests - no DB, no network.
"""

from datetime import datetime, timezone

from app.services import buying_event_service as bes

NOW = datetime(2026, 8, 18, tzinfo=timezone.utc)
COMPANY_ID = "11111111-1111-1111-1111-111111111111"


def _cls(subject, action, obj, *, event_type="operational_inefficiency", date="2026-08-06", **over):
    values = {
        "is_real_company_event": True,
        "event_type": event_type,
        "event_category": "buying_stage",
        "event_summary": f"{subject} {action} {obj}",
        "event_status": "announced",
        "event_date": date,
        "xsparks_relevance": 0.65,
        "extraction_confidence": 0.85,
        "is_negative": False,
        "negative_type": None,
        "canonical_subject": subject,
        "canonical_action": action,
        "canonical_object": obj,
    }
    values.update(over)
    return values


def _evidence(url, *, source_type="reputable_independent", published="2026-08-06T00:00:00"):
    return {
        "url": url,
        "domain": url.split("/")[2],
        "title": f"article at {url}",
        "snippet": "snippet",
        "published_date": published,
        "source_type": source_type,
        "company_match": 0.95,
    }


def _accepted(cls, evidence):
    return {
        "cls": cls,
        "evidence": evidence,
        "event_type": cls["event_type"],
        "relevance": cls["xsparks_relevance"],
    }


# --------------------------------------------------------------------------
# Bug 1: one evidence item may yield several events
# --------------------------------------------------------------------------
def test_parse_keeps_every_event_from_a_single_result():
    """The regression guard for bug 1. A newsroom page describing three
    separate events must produce three classifications, not one."""
    raw = """[
      {"index":0,"is_real_company_event":true,"event_type":"acquisition_or_merger"},
      {"index":0,"is_real_company_event":true,"event_type":"leadership_change"},
      {"index":0,"is_real_company_event":true,"event_type":"plant_expansion"}
    ]"""
    parsed = bes._parse(raw)
    assert list(parsed) == [0]
    assert [c["event_type"] for c in parsed[0]] == [
        "acquisition_or_merger", "leadership_change", "plant_expansion"
    ], "every event from one URL must survive, not just the last"


def test_parse_still_handles_one_event_per_result():
    raw = """[
      {"index":0,"is_real_company_event":true,"event_type":"vendor_evaluation"},
      {"index":1,"is_real_company_event":false,"event_type":null}
    ]"""
    parsed = bes._parse(raw)
    assert len(parsed[0]) == 1 and len(parsed[1]) == 1
    assert parsed[1][0]["is_real_company_event"] is False


def test_parse_returns_empty_on_unparseable_response():
    """Must stay distinguishable from "zero events": _classify_chunk treats an
    empty parse as an LLM FAILURE, which is what stops a company being stamped
    researched-with-no-evidence when the model actually just misbehaved."""
    assert bes._parse("I could not complete that request.") == {}
    assert bes._parse("[ {unclosed") == {}


# --------------------------------------------------------------------------
# Bug 2: one real event stays one event, however many articles cover it
# --------------------------------------------------------------------------
def test_articles_sharing_one_event_collapse_to_a_single_event():
    """Three outlets on one earnings announcement -> ONE event carrying three
    corroborating sources. Corroboration raises confidence downstream; it must
    never add another scored event."""
    canon = ("Inseego", "reported", "Q2 2026 financial results")
    accepted = [
        _accepted(_cls(*canon, date="2026-08-06"), _evidence("https://seekingalpha.com/news/1")),
        _accepted(_cls(*canon, date="2026-08-13"), _evidence("https://www.fool.com/x")),
        _accepted(_cls(*canon, date="2026-08-06"), _evidence("https://wtop.com/y")),
    ]
    groups = bes._build_canonical_events(COMPANY_ID, accepted, NOW)
    assert len(groups) == 1, f"expected 1 canonical event, got {len(groups)}"
    only = next(iter(groups.values()))
    assert len(only["evidence"]) == 3, "all three sources must be retained as evidence"


def test_distinct_events_of_the_same_type_stay_separate():
    """The guard against over-merging. Same company, same event_type, same
    month - but genuinely different happenings, so they must NOT collapse."""
    accepted = [
        _accepted(
            _cls("Inseego", "reported", "Q2 2026 financial results"),
            _evidence("https://seekingalpha.com/news/1"),
        ),
        _accepted(
            _cls("Inseego", "cut", "300 manufacturing jobs"),
            _evidence("https://seekingalpha.com/news/2"),
        ),
    ]
    groups = bes._build_canonical_events(COMPANY_ID, accepted, NOW)
    assert len(groups) == 2, "unrelated same-type events must not be merged"


def test_same_event_split_across_types_is_not_merged():
    """An earnings call that also discusses an acquisition yields two events
    from ONE url - they share a source but are different happenings, so both
    must survive with their own scores."""
    url = "https://www.fool.com/earnings/call-transcripts/x"
    accepted = [
        _accepted(_cls("Inseego", "reported", "Q2 2026 financial results"), _evidence(url)),
        _accepted(
            _cls("Inseego", "agreed to acquire", "Nokia FWA business",
                 event_type="acquisition_or_merger", date="2026-04-30"),
            _evidence(url, published="2026-04-30T00:00:00"),
        ),
    ]
    groups = bes._build_canonical_events(COMPANY_ID, accepted, NOW)
    assert len(groups) == 2
    assert {g["event_type"] for g in groups.values()} == {
        "operational_inefficiency", "acquisition_or_merger"
    }


# --------------------------------------------------------------------------
# The taxonomy gap that sent real signals to base_strength 0
# --------------------------------------------------------------------------
def test_acquisition_and_leadership_types_are_scorable():
    """Both were missing from BASE_STRENGTH, so the model - told by the prompt
    that acquisitions and new senior leaders ARE acceptable events - had
    nowhere to put them and fell back to company_identity_update, which scores
    0. Inseego's revenue-doubling Nokia acquisition scored literally nothing."""
    from app.core import scoring_config as cfg

    for event_type in ("acquisition_or_merger", "leadership_change"):
        assert event_type in cfg.BASE_STRENGTH, f"{event_type} missing from the taxonomy"
        assert cfg.BASE_STRENGTH[event_type] > 0, f"{event_type} must not score 0"
    assert cfg.BASE_STRENGTH["company_identity_update"] == 0, (
        "company_identity_update is the deliberate zero bucket - if this ever "
        "becomes non-zero, rebrands and address changes start scoring as intent"
    )


def test_prompt_exposes_every_scorable_event_type():
    """_build_prompt derives its allowed event_type list from
    BASE_STRENGTH.keys(), which is why adding a type to scoring_config is the
    whole fix. This asserts that wiring, so a future refactor to a hardcoded
    list cannot silently strand new types."""
    from app.core import scoring_config as cfg
    from app.services.offering_profile_service import XSPARKS_FALLBACK_PROFILE

    prompt = bes._build_prompt(
        {"company_name": "X", "company_domain": "x.com", "industry": "Manufacturing"},
        XSPARKS_FALLBACK_PROFILE, [], NOW,
    )
    missing = [t for t in cfg.BASE_STRENGTH if t not in prompt]
    assert not missing, f"event types unreachable by the model: {missing}"
