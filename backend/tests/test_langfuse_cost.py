from types import SimpleNamespace
import re

from app.services.langfuse_cost import MODEL_MATCH_PATTERN, cost_usd, usage_tokens


def test_usage_tokens_reads_pydantic_model_dump_not_dict():
    """openai>=2 usage objects expose tokens via model_dump(), not __dict__."""

    class Usage:
        def model_dump(self):
            return {"prompt_tokens": 1200, "completion_tokens": 80}

    assert usage_tokens(Usage()) == (1200, 80)


def test_usage_tokens_reads_plain_dict_and_namespace():
    assert usage_tokens({"prompt_tokens": 10, "completion_tokens": 2}) == (10, 2)
    assert usage_tokens(SimpleNamespace(prompt_tokens=4, completion_tokens=6)) == (4, 6)
    assert usage_tokens(None) == (0, 0)


def test_cost_usd_uses_gemini_flash_rates():
    input_cost, output_cost, total = cost_usd(1_000_000, 1_000_000)
    assert input_cost == 0.30
    assert output_cost == 2.50
    assert total == 2.80


def test_model_match_pattern_covers_proxy_aliases():
    matcher = re.compile(MODEL_MATCH_PATTERN)
    assert matcher.match("gemini-flash-latest")
    assert matcher.match("gemini-1.5-flash-latest")
    assert matcher.match("gemini-1.5-flash")
    assert matcher.match("gemini/gemini-flash-latest")
    assert not matcher.match("gemini-2.5-flash")
    assert not matcher.match("gemini-flash-lite-latest")
