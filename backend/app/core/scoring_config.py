"""Single source of truth for every constant in the evidence-based scoring
pipeline (brief sections 12-19). Deliberately one module, not values
scattered across services, so the formula is auditable and tunable in one
place.

The pipeline answers "which uploaded companies have real, current buying
potential for XSparks AI solutions" via:

    Lead Score = clamp(Buying Evidence + Contact Access - Negative Penalty, 0, 100)

Revenue / employee count / funding are deliberately ABSENT from Lead Score -
they only ever feed Expected Deal Value (DEAL_VALUE_BANDS). No ICP, no gates,
no D1-D7.
"""

SCORE_VERSION = 2
SCORE_FORMULA_VERSION = "trigger-v2"

# ---------------------------------------------------------------------------
# Base strengths per event type (brief section 12). 0-100. The intrinsic
# "how much does this event mean" before any relevance/freshness/etc. decay.
#
# trigger-v2 recalibration: v1 rewarded ONLY active-buying signals (RFP,
# procurement, pilot) and treated growth/change events (funding, expansion,
# hiring, tech mandates) as near-noise, so real companies capped ~41. For an
# AI solutions/consulting partner, a change/growth trigger IS a prospecting
# moment (fresh budget, a new leader's agenda, scaling pain), so those event
# types are raised to legitimate mid-strength here. Active-buying signals stay
# highest - the ranking order is preserved, only the floor is lifted.
# ---------------------------------------------------------------------------
BASE_STRENGTH = {
    "rfp_published": 80,
    "procurement_process": 75,
    "vendor_replacement": 75,
    "vendor_evaluation": 70,
    "active_pilot": 65,
    "explicit_ai_budget": 65,
    "ai_transformation_program": 60,
    "ai_pilot_announced": 60,
    "technology_budget": 55,
    "new_tech_mandate": 55,                # v1 40 - a tech mandate is a real trigger
    "explicit_ai_tool_adoption": 50,
    "relevant_ai_hiring": 50,              # v1 35 - building an AI team = active intent
    "plant_expansion": 50,                 # v1 40 - expansion = scaling pain + budget
    # M&A: post-deal integration is real, budgeted work for a solutions partner -
    # consolidating systems, migrating data, reconciling two tech stacks. Same
    # tier as plant_expansion for the same reason (scaling pain + fresh mandate).
    #
    # Added because the extraction prompt explicitly tells the LLM that "a
    # funding round, new senior leader, acquisition/merger, expansion, or
    # significant hiring IS an acceptable event", but the taxonomy had no bucket
    # for two of those five. With nowhere to put an acquisition the model fell
    # back to company_identity_update, which is base 0 - so Inseego's
    # revenue-DOUBLING Nokia acquisition (Nokia taking an ~11% stake) scored
    # literally nothing, while the same company's earnings miss scored 45 as an
    # operational_inefficiency. Confirmed reproducible on a single extraction
    # call, not a one-off.
    "acquisition_or_merger": 50,
    # A new CTO/CIO/CDO/Chief AI officer arrives with a mandate and a budget -
    # one of the strongest prospecting moments there is. Sits at funding's tier
    # rather than M&A's because it signals intent without necessarily carrying
    # integration work with it. An irrelevant appointment (new CMO, new CFO)
    # gets discounted by xsparks_relevance rather than needing its own type.
    "leadership_change": 45,
    "funding_without_buying_evidence": 45, # v1 20 - capital raised = budget + modernise mandate
    "operational_inefficiency": 45,
    "quality_control_problem": 45,
    "supply_chain_disruption": 45,
    "regulatory_compliance_pressure": 45,  # v1 35 - compliance pressure drives AI/automation spend
    "labour_shortage": 40,
    "generic_technology_assessment": 25,   # v1 15
    "company_identity_update": 0,
}
DEFAULT_BASE_STRENGTH = 20  # v1 15 - unknown/other event type

# ---------------------------------------------------------------------------
# XSparks relevance (brief section 12). The LLM returns a 0-1 float; these are
# the anchor interpretations used when building the extraction prompt and for
# documenting what the number means. Used as-is (already 0-1) as a multiplier.
# ---------------------------------------------------------------------------
XSPARKS_RELEVANCE_ANCHORS = {
    1.00: "Direct, explicit match to an XSparks solution",
    0.85: "Strong adjacent AI/data/automation need",
    0.65: "Operational pain addressable by XSparks, OR a growth/change trigger "
          "(funding, new senior leader, acquisition, expansion, major hiring)",
    0.35: "Weak or indirect relevance",
    0.00: "Truly irrelevant to XSparks",
}

# ---------------------------------------------------------------------------
# Freshness factor by age of the event (brief section 12). Days -> multiplier.
# Evaluated as: first band whose upper bound the age falls under.
# ---------------------------------------------------------------------------
FRESHNESS_BANDS = [
    (30, 1.00),
    (90, 0.90),
    (180, 0.75),
    (365, 0.55),
    (545, 0.35),
]
FRESHNESS_OLDER = 0.00  # older than the last band
FRESHNESS_UNKNOWN_DATE = 0.45

# ---------------------------------------------------------------------------
# Source quality (brief section 12). Multiplier by source_type.
# ---------------------------------------------------------------------------
SOURCE_QUALITY = {
    "official": 0.95,          # official procurement / regulatory source
    "reputable_independent": 0.90,
    "company_press": 0.82,     # company website or press release
    "industry_publication": 0.80,
    "aggregator": 0.60,
    "unknown": 0.50,
}
DEFAULT_SOURCE_QUALITY = 0.50

# ---------------------------------------------------------------------------
# Status factor (brief section 12). Multiplier by event status.
# ---------------------------------------------------------------------------
STATUS_FACTOR = {
    "active": 1.00,        # active / evaluating / in procurement
    "announced": 0.90,     # announced / planned
    "exploring": 0.65,
    "speculative": 0.45,
    "completed_follow_on": 0.30,  # completed with follow-on need
    "completed_irrelevant": 0.00,
}
DEFAULT_STATUS_FACTOR = 0.65

# ---------------------------------------------------------------------------
# Buying Evidence Score (brief section 13). Only the strongest three
# INDEPENDENT events contribute, at these weights; capped at 80.
#
# trigger-v2: v1 weights [1.0, 0.35, 0.15] made all but the single top event
# almost irrelevant, so a company with several genuine buying signals scored
# barely above one with a single event. A breadth of independent signals is a
# stronger lead, so the 2nd/3rd events now carry real weight.
# ---------------------------------------------------------------------------
EVIDENCE_WEIGHTS = [1.00, 0.60, 0.40]  # v1 [1.00, 0.35, 0.15]
BUYING_EVIDENCE_CAP = 80

# ---------------------------------------------------------------------------
# Contact Access Score (brief section 14). Scored ONCE per company using only
# the single strongest reachable contact - never summed across contacts.
# ---------------------------------------------------------------------------
CONTACT_ACCESS = {
    "economic_buyer_verified_email": 20,
    "relevant_exec_verified_email": 15,
    "relevant_contact_no_email": 8,   # phone / linkedin but no verified email
    "generic_company_contact": 3,
    "none": 0,
}

# Economic-buyer / relevant roles (brief section 14). Matched case-insensitively
# as substrings against a contact's job title.
ECONOMIC_BUYER_TITLES = [
    "ceo", "chief executive",
    "coo", "chief operating",
    "cto", "chief technology",
    "cio", "chief information",
    "chief ai", "chief data", "chief digital",
]
RELEVANT_EXEC_TITLES = [
    "vp operations", "vp technology", "vp data", "vp automation",
    "vice president",
    "transformation",
    "it director", "operations director", "director of it", "director of operations",
    "procurement",
    "head of data", "head of ai", "head of technology",
]

# ---------------------------------------------------------------------------
# Negative event penalties (brief section 15). Each UNIQUE negative event
# contributes once; total capped at 100.
# ---------------------------------------------------------------------------
NEGATIVE_PENALTY = {
    "vendor_selected": 70,
    "relevant_project_completed": 60,
    "project_cancelled": 100,
    "severe_financial_distress": 50,
    "strong_contradictory_signal": 20,
}
NEGATIVE_PENALTY_CAP = 100
DEFAULT_NEGATIVE_PENALTY = 20

# ---------------------------------------------------------------------------
# Sales classifications (brief section 17). Labels only - never gates. Every
# company is scored and displayed regardless of band.
#
# trigger-v2 band recalibration: these are ORDINAL labels for a rep working a
# scored sheet top-down ("who do I call first"), not absolute truth-claims.
# The v1 bands (Sales Ready 85 / High Priority 70 / Warm 50 / Monitor 30) were
# round numbers that, against the real score distribution, almost never fired
# the top labels - the strongest genuinely-active companies (real acquisition
# + funding + launches + a reachable economic buyer) land ~65-77, so "Sales
# Ready" at 85 essentially never triggered and a rep's best leads read only
# "High Priority"/"Warm". The raw evidence score stays untouched and honest;
# only the band thresholds move, calibrated to the distribution actually
# observed across live DeepSeek scoring runs, so the top tier of a realistic
# uploaded sheet is labelled the way a rep would truly treat it:
#   Sales Ready   (65+) - call today; strong active/multi-signal + reachable
#   High Priority (50+) - call this week; several real signals or a strong one
#   Warm          (35+) - worth a call; genuine but lighter signal
#   Monitor       (20+) - keep an eye; minimal signal
#   Low Priority  (0+)  - little/no current evidence
# ---------------------------------------------------------------------------
SALES_STATUS_BANDS = [
    (65, "Sales Ready"),
    (50, "High Priority"),
    (35, "Warm"),
    (20, "Monitor"),
    (0, "Low Priority"),
]

# A commercial-viability flag only - does NOT stop scoring or display.
COMMERCIAL_VIABILITY_THRESHOLD_USD = 15_000

# ---------------------------------------------------------------------------
# Confidence (brief section 18). Separate from Lead Score. A low score must
# NOT imply low confidence; no evidence -> "Insufficient Evidence".
# ---------------------------------------------------------------------------
CONFIDENCE_LABELS = [
    (0.80, "High"),
    (0.60, "Medium"),
    (0.00, "Low"),
]
CONFIDENCE_INSUFFICIENT = "Insufficient Evidence"
CONFIDENCE_CORROBORATION_BONUS_CAP = 0.10

# ---------------------------------------------------------------------------
# Expected Deal Value (brief section 19). Cold-start revenue-capacity bands.
# (revenue_upper_bound_usd, min_usd, max_usd) - first band the revenue is under.
# ---------------------------------------------------------------------------
DEAL_VALUE_BANDS = [
    (25_000_000, 15_000, 40_000),
    (100_000_000, 25_000, 75_000),
    (250_000_000, 50_000, 150_000),
    (500_000_000, 75_000, 250_000),
    (1_000_000_000, 100_000, 400_000),
    (float("inf"), 150_000, 750_000),
]
# Unknown revenue -> most conservative band.
DEAL_VALUE_UNKNOWN_REVENUE_BAND = (15_000, 40_000)

# Funding may move EDV up at most one band, and only when recent + materially
# relevant to tech/AI/automation/data/ops transformation (brief section 19).
FUNDING_RECENT_DAYS = 545
FUNDING_MAX_BAND_BUMP = 1

# Capturable share of an explicitly-identified public AI/procurement budget -
# never assume the whole budget is XSparks' (brief section 19).
PUBLIC_BUDGET_CAPTURABLE_SHARE = 0.10
