"""Matching companies against the tenant's AI-identified competitor list
(Organisation.competitors). Pure functions, no I/O.

Deliberately strict: exact (or subdomain) domain match, or exact normalised
name match - never fuzzy or substring, so "Acme" never matches "Acme
Logistics" and notacme.com never matches acme.com. A missed competitor just
gets proposed/shown like any company; a false match would silently hide a
real lead from ICP lead generation.
"""

import re
from dataclasses import dataclass, field

from app.services.zoominfo_mapper import normalize_domain as _zi_normalize_domain

MAX_COMPETITORS = 15

# Prompt rule shared by the Offering Profile sync and the onboarding prefill.
# Separate from alternative_solutions (which stay categories, never names):
# these are real companies, used only to keep competitors out of ICP lead
# generation and to fetch competitor news.
NAMED_COMPETITORS_RULE = (
    f"named_competitors lists up to {MAX_COMPETITORS} REAL, well-known companies that sell "
    "substantially the same offerings to the same kind of buyers (true competitors), each with its "
    "main website domain if known. Only include companies you are confident exist and compete; "
    "return [] when unsure. Never put these names into alternative_solutions."
)

_LEGAL_SUFFIXES = {
    "inc", "incorporated", "llc", "ltd", "limited", "plc", "corp", "corporation", "co", "company",
    "gmbh", "ag", "sa", "bv", "nv", "pvt", "private", "pte", "srl", "spa", "oy", "ab", "as",
}


def normalize_domain(value) -> str | None:
    """Lowercase host without scheme, www., path or port."""
    domain = _zi_normalize_domain(value)
    if not domain:
        return None
    domain = domain.split(":")[0].strip(".")
    return domain or None


def normalize_name(value) -> str | None:
    """Lowercase, punctuation stripped, trailing legal suffixes removed."""
    if not value:
        return None
    words = re.sub(r"[^a-z0-9 ]+", " ", str(value).lower()).split()
    while len(words) > 1 and words[-1] in _LEGAL_SUFFIXES:
        words.pop()
    return " ".join(words) or None


def clean_competitors(raw, limit: int = MAX_COMPETITORS) -> list[dict]:
    """An LLM's company list -> [{name, domain}], de-duplicated by domain
    (else name), capped at `limit`. Junk entries are dropped."""
    out: list[dict] = []
    seen: set[str] = set()
    for item in raw if isinstance(raw, list) else []:
        if isinstance(item, str):
            item = {"name": item}
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        domain = normalize_domain(item.get("domain"))
        if not name and not domain:
            continue
        key = domain or normalize_name(name)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append({"name": name or domain, "domain": domain})
        if len(out) >= limit:
            break
    return out


@dataclass
class CompetitorIndex:
    domains: dict[str, dict] = field(default_factory=dict)
    names: dict[str, dict] = field(default_factory=dict)

    def __bool__(self) -> bool:
        return bool(self.domains or self.names)

    def match(self, name=None, domain=None) -> dict | None:
        """The competitor entry this company is, or None."""
        d = normalize_domain(domain)
        if d:
            if d in self.domains:
                return self.domains[d]
            for comp_domain, entry in self.domains.items():
                if d.endswith("." + comp_domain):
                    return entry
        n = normalize_name(name)
        if n and n in self.names:
            return self.names[n]
        return None


def build_index(entries) -> CompetitorIndex:
    index = CompetitorIndex()
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        d = normalize_domain(entry.get("domain"))
        n = normalize_name(entry.get("name"))
        if d:
            index.domains.setdefault(d, entry)
        if n:
            index.names.setdefault(n, entry)
    return index


def competitor_names(entries) -> list[str]:
    return [str(e.get("name")) for e in entries or [] if isinstance(e, dict) and e.get("name")]
