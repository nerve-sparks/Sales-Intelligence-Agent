"""Domain enrichment from web search.

Most of these are NEGATIVE tests, deliberately. A missing domain costs the
company its buying-evidence score and is visibly incomplete; a WRONG domain
sends research after a different company and attaches confidently wrong
evidence to a real prospect, which nothing downstream can detect. So the bar is
"never write a domain we are not sure of", and that is what is guarded here.

Live validation when this was built: 6 of 8 real company names resolved at
confidence 1.00, and both refusals were correct - "Premier Coil Solutions"
scored 'coilsolutions.com' at 0.70 and rejected it, the true domain being
premiercoil.com.
"""

from app.services import company_enrichment as ce


def _results(*urls) -> list[dict]:
    return [{"link": u, "position": i} for i, u in enumerate(urls)]


# --------------------------------------------------------------------------
# Accepting the right answer
# --------------------------------------------------------------------------
def test_exact_name_match_resolves():
    domain, confidence, _ = ce.resolve_domain("Tacnode", _results("https://tacnode.io/"))
    assert domain == "tacnode.io"
    assert confidence >= ce.MIN_DOMAIN_CONFIDENCE


def test_legal_suffix_does_not_block_the_match():
    domain, _, _ = ce.resolve_domain("Acme, Inc.", _results("https://www.acme.com/about"))
    assert domain == "acme.com"


def test_subdomain_and_path_are_reduced_to_the_registrable_domain():
    domain, _, _ = ce.resolve_domain("Strive Health", _results("https://careers.strivehealth.com/jobs/1"))
    assert domain == "strivehealth.com"


def test_two_part_public_suffix_is_preserved():
    """acme.co.uk must not be truncated to co.uk."""
    assert ce._registrable("https://www.acme.co.uk/x") == "acme.co.uk"


# --------------------------------------------------------------------------
# Refusing the wrong answer - the tests that matter
# --------------------------------------------------------------------------
def test_directories_never_win_however_highly_they_rank():
    """A search for a small private company returns LinkedIn, Crunchbase and
    ZoomInfo above its own site nearly every time."""
    domain, _, _ = ce.resolve_domain(
        "Acme",
        _results(
            "https://www.linkedin.com/company/acme",
            "https://www.crunchbase.com/organization/acme",
            "https://www.zoominfo.com/c/acme/12345",
            "https://acme.com",
        ),
    )
    assert domain == "acme.com", "the company's own site must win over directories"


def test_unrelated_domain_is_never_guessed():
    """The single most dangerous case: a top result with no relationship to the
    name. Returning it would attach another company's news to this prospect."""
    domain, confidence, reason = ce.resolve_domain(
        "Summit Partners", _results("https://randomvendor.io", "https://en.wikipedia.org/wiki/Summit")
    )
    assert domain is None
    assert confidence == 0.0
    assert "no candidate matched" in reason


def test_partial_match_below_the_floor_is_refused():
    """Real case: 'Premier Coil Solutions' vs coilsolutions.com. Plausible,
    shares tokens, and wrong - the true domain is premiercoil.com."""
    domain, confidence, reason = ce.resolve_domain(
        "Premier Coil Solutions", _results("https://coilsolutions.com")
    )
    assert domain is None
    assert 0 < confidence < ce.MIN_DOMAIN_CONFIDENCE
    assert "below the" in reason


def test_only_directory_results_reports_why():
    domain, _, reason = ce.resolve_domain(
        "Obscure Co", _results("https://www.linkedin.com/company/obscure", "https://www.owler.com/x")
    )
    assert domain is None
    assert "excluded" in reason


def test_directory_subdomains_are_also_excluded():
    assert ce._is_excluded("uk.linkedin.com")
    assert ce._is_excluded("linkedin.com")
    assert not ce._is_excluded("linkedinsights.com"), "substring alone must not exclude"


# --------------------------------------------------------------------------
# Scoring behaviour
# --------------------------------------------------------------------------
def test_rank_is_a_tiebreak_not_a_substitute_for_name_match():
    """Rank mostly reflects site authority, so a directory listing for a
    50-person company outranks the company itself. A first-place unrelated
    domain must still score zero."""
    assert ce.score_domain_candidate("Acme", "unrelated.io", 0) == 0.0
    strong_but_last = ce.score_domain_candidate("Acme", "acme.com", 5)
    assert strong_but_last >= ce.MIN_DOMAIN_CONFIDENCE


def test_abbreviated_descriptor_resolves():
    """Real case: 'Luminar Technologies' -> luminartech.com. Length coverage
    alone scores this 0.58 and refuses it, but the label is the distinctive
    first word plus an abbreviation of the rest."""
    assert ce.score_domain_candidate("Luminar Technologies", "luminartech.com", 0) >= ce.MIN_DOMAIN_CONFIDENCE


def test_shared_first_word_alone_is_not_enough():
    """The guard on the abbreviation rule. Both halves must correspond -
    'Summit Partners' and summitventures.com share 'summit', but 'ventures'
    does not abbreviate 'partners'."""
    for name, candidate in [
        ("Summit Partners", "summitventures.com"),
        ("Apex Partners", "apexventures.com"),
        ("Core Health", "coredigital.com"),
    ]:
        assert ce.score_domain_candidate(name, candidate, 0) < ce.MIN_DOMAIN_CONFIDENCE, name


def test_short_first_word_cannot_anchor_an_abbreviation():
    """'Acme', 'Apex', 'Core' collide across unrelated companies, so a short
    anchor is refused even when the remainder would abbreviate. A conservative
    miss by design."""
    assert not ce._is_abbreviated_descriptor("Acme Solutions", "acmesol")
    assert ce._is_abbreviated_descriptor("Luminar Technologies", "luminartech")


def test_query_uses_location_to_disambiguate_generic_names():
    query = ce._build_query("Apex", "Austin", "United States")
    assert "Apex" in query and "Austin" in query
    assert "Apex" in ce._build_query("Apex", None, None)


def test_empty_results_are_handled():
    domain, confidence, _ = ce.resolve_domain("Acme", [])
    assert domain is None and confidence == 0.0


# --------------------------------------------------------------------------
# Firmographics (industry / revenue / ownership…)
# --------------------------------------------------------------------------
def test_normalize_industry_maps_aliases_to_zoominfo_labels():
    assert ce.normalize_industry_label("Financial Services") == "Finance"
    assert ce.normalize_industry_label("fintech") == "Finance"
    assert ce.normalize_industry_label("Software") == "Software"
    assert ce.normalize_industry_label("SaaS") == "Software"


def test_parse_usd_amount_reads_common_phrases():
    assert ce.parse_usd_amount(56_000_000_000) == 56_000_000_000
    assert ce.parse_usd_amount("$56B") == 56_000_000_000
    assert ce.parse_usd_amount("2.3 million") == 2_300_000
    assert ce.parse_usd_amount("n/a") is None


def test_firmographic_updates_only_fill_null_columns():
    """Spreadsheet values must win - enrichment never overwrites a filled field."""
    company = type("C", (), {
        "primary_industry": None,
        "industries": None,
        "employee_count": 10000,
        "employee_range": "10K+",
        "revenue_usd": None,
        "revenue_range": None,
        "founded_year": None,
        "ownership_type": None,
        "city": None,
        "state": None,
        "country": None,
        "continent": None,
        "total_funding_amount": None,
        "recent_funding_amount": None,
        "recent_funding_date": None,
        "company_funding": None,
    })()
    updates = ce.firmographic_updates(company, {
        "primary_industry": "Financial Services",
        "industries": ["Banking", "Payments"],
        "employee_count": 999,
        "employee_range": "1-10",
        "revenue_usd": "$50B",
        "founded_year": "1850",
        "ownership_type": "public",
        "city": "New York",
        "state": "NY",
        "country": "United States",
        "total_funding_usd": None,
    })
    assert updates["primary_industry"] == ["Finance"]
    assert "Finance" in updates["industries"]
    assert "employee_count" not in updates, "must not overwrite existing headcount"
    assert "employee_range" not in updates
    assert updates["revenue_usd"] == 50_000_000_000
    assert updates["founded_year"] == "1850"
    assert updates["ownership_type"] == "public"
    assert updates["city"] == "New York"
    assert updates["country"] == "United States"
    assert updates["continent"] == "North America"


def test_needs_firmographic_enrichment_when_industry_missing():
    company = type("C", (), {
        "primary_industry": None,
        "industries": None,
        "employee_count": 100,
        "employee_range": "51-200",
        "revenue_usd": 1,
        "revenue_range": None,
        "founded_year": "2000",
        "ownership_type": "private",
        "city": "Austin",
        "country": "United States",
        "total_funding_amount": None,
        "recent_funding_amount": None,
        "recent_funding_date": None,
    })()
    assert ce.needs_firmographic_enrichment(company) is True
    company.primary_industry = ["Software"]
    company.industries = ["Software"]
    assert ce.needs_firmographic_enrichment(company) is False
