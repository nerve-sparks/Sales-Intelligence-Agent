"""Header-agnostic spreadsheet ingest (table_mapper).

Guards the failure that motivated the module: uploading a 1,009-row conference
attendee list produced ZERO companies, finished in 60ms and reported
"Complete" with no warning, because excel_pipeline requires both
`ZoomInfo Company ID` and `Company Name` on every row and silently `continue`s
past anything else.

The most important test here is the LAST one: a real ZoomInfo export must keep
taking the original untouched path, because that path has already ingested
thousands of companies and must not regress.
"""

import io

import openpyxl

from app.services import table_mapper as tm


def _xlsx(sheets: dict[str, list[list]]) -> bytes:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(title=name)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# --------------------------------------------------------------------------
# Column resolution
# --------------------------------------------------------------------------
def test_resolves_alternative_header_names():
    """The AI4 file used Organisation/Designation/Name where ZoomInfo uses
    Company Name/Job Title/First Name."""
    resolved = tm.resolve_columns(
        ["S.No.", "Name", "Designation", "Organisation", "Linkedin", "Employees"]
    )
    assert resolved["company_name"] == "Organisation"
    assert resolved["job_title"] == "Designation"
    assert resolved["full_name"] == "Name"
    assert resolved["employees"] == "Employees"


def test_more_specific_alias_wins():
    """A sheet with both must resolve to the company's site, not a personal
    one - aliases are ordered most-specific-first for exactly this."""
    resolved = tm.resolve_columns(["Website", "Company Website"])
    assert resolved["website"] == "Company Website"


def test_header_matching_ignores_case_and_punctuation():
    assert tm.resolve_columns(["COMPANY_NAME"])["company_name"] == "COMPANY_NAME"
    assert tm.resolve_columns(["e-mail address"])["email"] == "e-mail address"


# --------------------------------------------------------------------------
# Identity synthesis - the schema requires BIGINT NOT NULL ids
# --------------------------------------------------------------------------
def test_synthetic_id_is_stable_and_fits_signed_bigint():
    """Stability is what makes re-uploading a sheet update rows instead of
    duplicating them; the bound is what keeps it insertable at all."""
    first = tm.synthetic_bigint("company", "acme.com")
    assert first == tm.synthetic_bigint("company", "acme.com")
    assert first != tm.synthetic_bigint("company", "other.com")
    assert 0 < first < 2**63


def test_legal_suffixes_do_not_split_one_company_in_two():
    assert tm.normalize_company_name("Acme, Inc.") == tm.normalize_company_name("Acme Inc")
    assert tm.normalize_company_name("Acme Holdings Ltd") == tm.normalize_company_name("Acme")


# --------------------------------------------------------------------------
# Domain recovery - research skips any company with a NULL domain
# --------------------------------------------------------------------------
def test_domain_recovered_from_work_email():
    assert tm.domain_from_email("Alexander@tacnode.io") == "tacnode.io"


def test_personal_email_never_becomes_a_company_domain():
    """An attendee list is full of these. Treating gmail.com as the company
    domain would send every such row to research as the same 'company'."""
    for address in ("a@gmail.com", "b@yahoo.co.in", "c@outlook.com", "d@icloud.com"):
        assert tm.domain_from_email(address) is None
    assert tm.domain_from_email("not-an-email") is None
    assert tm.domain_from_email(None) is None


def test_website_column_preferred_over_email_domain():
    cols = tm.resolve_columns(["Company Name", "Website", "Email Address"])
    row = {"Company Name": "Acme", "Website": "https://www.acme.com/about", "Email Address": "x@other.io"}
    assert tm.company_identity(row, cols) == ("Acme", "acme.com")


# --------------------------------------------------------------------------
# End-to-end
# --------------------------------------------------------------------------
def test_reads_every_sheet_not_just_the_active_one():
    """The AI4 workbook had eleven sheets and only the active one was read, so
    most of the file was invisible."""
    content = _xlsx({
        "Meetings": [["Name", "Designation", "Company Name"], ["A B", "CTO", "Acme"]],
        "Data Master": [["Name", "Designation", "Organisation"], ["C D", "CIO", "Globex"]],
    })
    rows, report = tm.to_canonical_rows("multi.xlsx", content)
    assert {r["Company Name"] for r in rows} == {"Acme", "Globex"}
    assert len(report["sheets"]) == 2


def test_finds_the_header_row_below_a_title_row():
    """Exported sheets routinely open with a title or blank line; reading row 1
    as the header would make every column unrecognisable."""
    content = _xlsx({
        "S": [["AI4 Event Attendees 2026"], [], ["Name", "Designation", "Organisation"],
              ["A B", "CTO", "Acme"]],
    })
    rows, _ = tm.to_canonical_rows("titled.xlsx", content)
    assert len(rows) == 1 and rows[0]["Company Name"] == "Acme"


def test_emits_the_bracket_accessed_keys_the_pipeline_requires():
    """zoominfo_mapper reads these four with row["..."] rather than .get(), so
    a missing key is a KeyError mid-ingest, not a null."""
    content = _xlsx({"S": [["Name", "Designation", "Organisation"], ["A B", "CTO", "Acme"]]})
    rows, _ = tm.to_canonical_rows("x.xlsx", content)
    for key in tm._REQUIRED_KEYS:
        assert key in rows[0], f"{key} must be present for excel_pipeline"


def test_rows_without_a_company_are_counted_not_silently_dropped():
    content = _xlsx({
        "S": [["Name", "Designation", "Organisation"],
              ["A B", "CTO", "Acme"],
              ["C D", "CIO", None]],
    })
    rows, report = tm.to_canonical_rows("x.xlsx", content)
    assert len(rows) == 1
    assert report["rows_without_company"] == 1
    assert any("no company name" in w for w in tm.report_warnings(report))


def test_unreadable_file_produces_an_explicit_warning():
    """The original bug: total-loss ingest was indistinguishable from success."""
    content = _xlsx({"S": [["colA", "colB"], [1, 2]]})
    rows, report = tm.to_canonical_rows("junk.xlsx", content)
    assert rows == []
    assert any("no readable table" in w for w in tm.report_warnings(report))


def test_missing_domain_is_warned_because_research_will_skip_it():
    content = _xlsx({"S": [["Name", "Designation", "Organisation"], ["A B", "CTO", "Acme"]]})
    _rows, report = tm.to_canonical_rows("x.xlsx", content)
    assert report["companies_without_domain"] == 1
    assert any("cannot be researched" in w for w in tm.report_warnings(report))


def test_same_company_across_sheets_collapses_to_one_id():
    content = _xlsx({
        "A": [["Name", "Organisation", "Email Address"], ["A B", "Acme, Inc.", "a@acme.com"]],
        "B": [["Name", "Organisation", "Email Address"], ["C D", "Acme Inc", "c@acme.com"]],
    })
    rows, report = tm.to_canonical_rows("x.xlsx", content)
    assert len({r["ZoomInfo Company ID"] for r in rows}) == 1
    assert report["companies"] == 1 and report["contacts"] == 2


# --------------------------------------------------------------------------
# No regression on the existing ZoomInfo path
# --------------------------------------------------------------------------
def test_real_zoominfo_export_is_routed_to_the_untouched_path():
    """The guard that matters most. A file carrying ZoomInfo's own identity
    column must keep using zoominfo_mapper - that path already ingested
    thousands of companies and this module must not intercept it."""
    zi_rows = [{"ZoomInfo Company ID": 123456789, "Company Name": "Acme", "Website": "acme.com"}]
    assert tm.looks_like_zoominfo_export(zi_rows) is True

    flexible_rows = [{"Organisation": "Acme", "Name": "A B"}]
    assert tm.looks_like_zoominfo_export(flexible_rows) is False
    assert tm.looks_like_zoominfo_export([]) is False


# --------------------------------------------------------------------------
# PostgreSQL bind-parameter limit
# --------------------------------------------------------------------------
def test_insert_chunks_stay_under_the_postgres_parameter_limit():
    """A multi-row INSERT spends one bind parameter per column per row, and
    PostgreSQL allows at most 65535 in one prepared statement.

    Ingesting a real 2,573-company / 8,338-contact spreadsheet needed 84,909
    and 116,732 respectively and asyncpg failed with a multi-megabyte dump of
    every placeholder. The limit was unreachable while only ZoomInfo exports
    could be ingested; making arbitrary spreadsheets ingestable exceeded it on
    both tables at once.

    Asserted against the live column counts, so adding a column to either
    model cannot silently shrink the margin back to breaking point."""
    from app.services import excel_pipeline as ep
    from app.services import zoominfo_mapper as zm

    company_params = ep.COMPANY_INSERT_CHUNK * len(zm.COMPANY_COLUMNS)
    dm_params = ep.DM_INSERT_CHUNK * len(zm.DECISION_MAKER_COLUMNS)

    assert company_params < ep.PG_MAX_BIND_PARAMS, (
        f"company insert would send {company_params} parameters"
    )
    assert dm_params < ep.PG_MAX_BIND_PARAMS, f"contact insert would send {dm_params} parameters"
    assert ep.COMPANY_INSERT_CHUNK > 0 and ep.DM_INSERT_CHUNK > 0
    # 32767, not PostgreSQL's documented 65535: asyncpg counts parameters in a
    # signed int16. Sizing to 65535 passes an "under the limit?" check and
    # still fails at runtime, which is how the first fix here went wrong.
    assert ep.PG_MAX_BIND_PARAMS == 32_767, (
        "asyncpg caps query arguments at 32767, half the documented PostgreSQL limit"
    )


def test_synthetic_ids_survive_the_pipeline_int_parser_exactly():
    """table_mapper's ids are ~19 digits and form half the (organisation_id,
    zi_company_id) unique key. zoominfo_mapper.parse_int used int(float(v)),
    which rounds above 2^53 - 3508682770938109839 became ...952 - silently
    corrupting company identity on every non-ZoomInfo upload."""
    from app.services import zoominfo_mapper as zm

    for parts in (("company", "tacnode.io"), ("company", "acme.com"), ("contact", "a@acme.com")):
        generated = tm.synthetic_bigint(*parts)
        assert generated > 2**53, "test is meaningless unless the id exceeds float precision"
        assert zm.parse_int(generated) == generated
        assert zm.parse_int(str(generated)) == generated

    # Excel still hands back "1.0"/1.0 for whole numbers - must keep working.
    assert zm.parse_int("1.0") == 1
    assert zm.parse_int(42.0) == 42
    assert zm.parse_int("") is None and zm.parse_int(None) is None


def test_companies_are_not_marked_out_of_business_by_default():
    """build_company_row treats anything but "Yes" in ZoomInfo's certification
    column as OUT_OF_BUSINESS. An ordinary spreadsheet has no such column, so
    every company from one was being stored as closed."""
    content = _xlsx({"S": [["Name", "Designation", "Organisation"], ["A B", "CTO", "Acme"]]})
    rows, _ = tm.to_canonical_rows("x.xlsx", content)
    assert rows[0]["Certified Active Company"] == "Yes"
