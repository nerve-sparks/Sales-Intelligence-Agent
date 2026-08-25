"""Industry -> sector rollup.

Company.primary_industry holds ZoomInfo's own industry label. There are 20
distinct values in the live data, and they are too granular to filter or
segment on directly - "Software" alone is 5,936 of 8,101 classified companies,
so an industry filter built straight on that column is one huge bucket plus
nineteen slivers.

Sectors group them into a spread a person can actually navigate, and give the
Dashboard globe and Enterprise List a filter dimension that partitions the book
meaningfully.

Single source of truth: the API returns sector names with their counts, so the
frontend never carries a second copy of this mapping that could drift.
"""

# Sector -> the primary_industry values that roll into it. Every one of the 20
# live values is assigned; sector_for() falls back to UNCLASSIFIED so a new
# ZoomInfo label appearing later is visible rather than silently dropped.
SECTOR_INDUSTRIES: dict[str, tuple[str, ...]] = {
    "Technology": ("Software", "Media & Internet", "Telecommunications"),
    "Industrials": ("Manufacturing", "Construction", "Transportation"),
    "Financial Services": ("Finance", "Insurance"),
    "Healthcare": ("Hospitals & Physicians Clinics", "Healthcare Services"),
    "Consumer": ("Retail", "Hospitality", "Consumer Services"),
    "Energy & Resources": ("Energy, Utilities & Waste", "Minerals & Mining", "Agriculture"),
    "Business Services": ("Business Services",),
    "Real Estate": ("Real Estate",),
    "Education": ("Education",),
    "Diversified": ("Holding Companies & Conglomerates",),
}

UNCLASSIFIED = "Unclassified"

# Display order for the filter menu: broadest first so the list reads like the
# book of business rather than alphabetically.
SECTOR_ORDER: tuple[str, ...] = (
    "Technology", "Industrials", "Business Services", "Financial Services",
    "Consumer", "Healthcare", "Energy & Resources", "Real Estate",
    "Education", "Diversified", UNCLASSIFIED,
)

_INDUSTRY_TO_SECTOR: dict[str, str] = {
    industry.lower(): sector
    for sector, industries in SECTOR_INDUSTRIES.items()
    for industry in industries
}


def sector_for(industry: str | None) -> str:
    """Sector for one industry label. UNCLASSIFIED covers both a missing
    industry (the ~2,500 companies from spreadsheets with no industry column)
    and an unrecognised one - both are real states a filter should be able to
    show, not silently omit."""
    if not industry:
        return UNCLASSIFIED
    return _INDUSTRY_TO_SECTOR.get(str(industry).strip().lower(), UNCLASSIFIED)


def sector_for_company(primary_industry, industries=None) -> str:
    """Sector from a Company's array columns. primary_industry wins; industries
    is the fallback, since spreadsheet ingest populates that one."""
    for source in (primary_industry, industries):
        if source:
            first = source[0] if isinstance(source, (list, tuple)) else source
            sector = sector_for(first)
            if sector != UNCLASSIFIED:
                return sector
    return UNCLASSIFIED
