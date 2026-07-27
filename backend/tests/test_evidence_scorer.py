"""Unit tests for the evidence-based scoring invariants (brief section 33).

Dependency-free (plain asserts) so it runs with just the venv:
    venv/Scripts/python.exe tests/test_evidence_scorer.py

Covers the non-negotiable properties: dedup collapses multiple articles into
one event, the 1/0.35/0.15 weighting, contact access scored once, revenue/
funding never touch Lead Score (only Expected Deal Value), penalty-once, cancel
-to-zero, every company scored, no-evidence -> Insufficient (not Low), low score
!= low confidence, and the exact status boundaries.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import evidence_scorer as es  # noqa: E402
from app.services import buying_event_service as bes  # noqa: E402

PASS = 0
FAIL = 0


def check(name, cond):
    global PASS, FAIL
    if cond:
        PASS += 1
    else:
        FAIL += 1
        print(f"  FAIL: {name}")


# --- Buying Evidence: weights 1, 0.35, 0.15; cap 80; only top 3 ---
check("weights 1/0.35/0.15", es.buying_evidence_score([40, 20, 10]) == round(40 + 7 + 1.5, 2))
check("cap 80", es.buying_evidence_score([80, 80, 80]) == 80)
check("4th event does not inflate", es.buying_evidence_score([40, 20, 10]) == es.buying_evidence_score([40, 20, 10, 10, 10]))
check("no events -> 0", es.buying_evidence_score([]) == 0)

# --- Contact access: strongest once, never summed ---
check("economic buyer + email = 20", es.contact_access_score([{"job_title": "Chief Executive Officer", "email": "a@b.com"}]) == 20)
check("two contacts not summed", es.contact_access_score([{"job_title": "CEO", "email": "a@b.com"}, {"job_title": "CTO", "email": "c@d.com"}]) == 20)
check("relevant exec + email = 15", es.contact_access_score([{"job_title": "VP Operations", "email": "a@b.com"}]) == 15)
check("relevant no email = 8", es.contact_access_score([{"job_title": "VP Operations", "phone": "123"}]) == 8)
check("generic = 3", es.contact_access_score([{"job_title": "Analyst"}]) == 3)
check("none = 0", es.contact_access_score([]) == 0)

# --- Negative: once, cap 100 ---
check("vendor selected once = 70", es.negative_penalty([70]) == 70)
check("negatives cap 100", es.negative_penalty([70, 60]) == 100)
check("cancelled = 100", es.negative_penalty([100]) == 100)

# --- Final score + clamp ---
check("61+15-0 = 76", es.final_lead_score(61, 15, 0) == 76)
check("cancelled to zero", es.final_lead_score(45, 0, 100) == 0)
check("clamp upper 100", es.final_lead_score(80, 30, 0) == 100)

# --- Revenue / funding NOT in Lead Score (not even inputs) ---
import inspect  # noqa: E402
sig = inspect.signature(es.final_lead_score)
check("lead score has no revenue/funding param", set(sig.parameters) == {"evidence", "contact", "penalty"})

# --- Revenue DOES change EDV; funding bumps at most one band ---
check("EDV rev 10M = 15k-40k", (es.expected_deal_value(10_000_000)["min"], es.expected_deal_value(10_000_000)["max"]) == (15000, 40000))
check("EDV rev 300M = 75k-250k", (es.expected_deal_value(300_000_000)["min"], es.expected_deal_value(300_000_000)["max"]) == (75000, 250000))
check("relevant funding bumps one band", (es.expected_deal_value(300_000_000, funding_is_recent_and_relevant=True)["min"], es.expected_deal_value(300_000_000, funding_is_recent_and_relevant=True)["max"]) == (100000, 400000))
check("EDV unknown revenue basis", es.expected_deal_value(None)["basis"] == "revenue_capacity_band_unknown_revenue")

# --- Confidence: no events -> Insufficient (not Low); low score != low confidence ---
check("no events -> Insufficient", es.confidence([])[1] == "Insufficient Evidence")
# A single realistic-match source at a low event_score is NOT low confidence
# (the invariant) - it lands Medium here, never Low/Insufficient.
strong_low = es.confidence([{"extraction_confidence": 0.95, "source_quality": 0.9, "published_at": datetime.now(timezone.utc), "event_score": 5, "is_negative": False, "company_match": 0.8, "source_count": 1}])
check("strong evidence at low score is not Low/Insufficient", strong_low[1] in ("High", "Medium"))
# High match + corroborating sources -> High.
high = es.confidence([{"extraction_confidence": 0.95, "source_quality": 0.95, "published_at": datetime.now(timezone.utc), "event_score": 60, "is_negative": False, "company_match": 0.95, "source_count": 3}])
check("high match + corroboration -> High", high[1] == "High")
# Corroboration comes from EXTRA sources on the same event (item 17), not event count.
one_multi = es.confidence([{"extraction_confidence": 0.8, "source_quality": 0.8, "published_at": datetime.now(timezone.utc), "event_score": 50, "is_negative": False, "company_match": 0.9, "source_count": 4}])
one_single = es.confidence([{"extraction_confidence": 0.8, "source_quality": 0.8, "published_at": datetime.now(timezone.utc), "event_score": 50, "is_negative": False, "company_match": 0.9, "source_count": 1}])
check("extra sources raise confidence", (one_multi[0] or 0) > (one_single[0] or 0))

# --- Status boundaries exactly at 29/30/49/50/69/70/84/85 ---
boundaries = {85: "Sales Ready", 84: "High Priority", 70: "High Priority", 69: "Warm", 50: "Warm", 49: "Monitor", 30: "Monitor", 29: "Low Priority", 0: "Low Priority"}
for s, expected in boundaries.items():
    check(f"status({s}) == {expected}", es.sales_status(s) == expected)

# --- Freshness: unknown date uses the configured factor, not 0 ---
now = datetime.now(timezone.utc)
check("unknown date freshness = 0.45", bes.freshness_factor(None, now) == 0.45)
check("fresh event freshness = 1.0", bes.freshness_factor(now - timedelta(days=5), now) == 1.0)
check("old event freshness = 0.0", bes.freshness_factor(now - timedelta(days=900), now) == 0.0)

# --- Canonicalisation: same real event -> same key; 3 articles collapse to 1 ---
cid = "00000000-0000-0000-0000-000000000001"
ev = {"event_type": "rfp_published", "canonical_subject": "acme corp", "canonical_action": "published rfp", "canonical_object": "ai platform"}
edate = datetime(2026, 1, 15, tzinfo=timezone.utc)
k1 = bes.canonical_key(cid, ev, edate)
k2 = bes.canonical_key(cid, dict(ev), datetime(2026, 1, 28, tzinfo=timezone.utc))  # same month
check("same event same month -> same key", k1 == k2)
k3 = bes.canonical_key(cid, {**ev, "event_type": "vendor_evaluation"}, edate)
check("different event type -> different key", k1 != k3)

# Three articles about one event -> one canonical event (dedup)
accepted = []
for i, domain in enumerate(["reuters.com", "prnewswire.com", "industryweek.com"]):
    accepted.append({
        "event_type": "rfp_published",
        "relevance": 0.9,
        "cls": {"event_type": "rfp_published", "event_status": "active", "event_date": "2026-01-15",
                "extraction_confidence": 0.9, "xsparks_relevance": 0.9, "is_negative": False,
                "canonical_subject": "acme corp", "canonical_action": "published rfp", "canonical_object": "ai platform",
                "event_category": "buying_stage", "event_summary": "RFP", "best_offering": "AI Agents", "relevance_reason": "r"},
        "evidence": {"url": f"https://{domain}/x", "source_type": "reputable_independent", "published_date": "2026-01-15", "title": "RFP"},
    })
groups = bes._build_canonical_events(cid, accepted, now)
check("3 articles -> 1 canonical event", len(groups) == 1)
only = next(iter(groups.values()))
check("canonical event keeps all 3 sources", len(only["evidence"]) == 3)

print(f"\n{PASS} passed, {FAIL} failed")
if __name__ == "__main__":
    sys.exit(1 if FAIL else 0)
