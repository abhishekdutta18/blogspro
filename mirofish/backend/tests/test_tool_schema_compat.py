"""Tests for scripts/tool_schema_compat.py (Groq-compatible tool schemas)."""
import copy
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))

from tool_schema_compat import install, sanitize_tool_schema  # noqa: E402


def _tool(parameters):
    return {"type": "function",
            "function": {"name": "t", "description": "d", "strict": True, "parameters": parameters}}


def test_drops_empty_required_when_properties_empty():
    schema = _tool({"properties": {}, "type": "object", "additionalProperties": False, "required": []})

    result = sanitize_tool_schema(schema)

    assert "required" not in result["function"]["parameters"]
    assert result["function"]["parameters"]["properties"] == {}


def test_does_not_mutate_input():
    schema = _tool({"properties": {}, "type": "object", "required": []})
    original = copy.deepcopy(schema)

    sanitize_tool_schema(schema)

    assert schema == original


def test_keeps_required_when_properties_present():
    params = {"type": "object", "properties": {"post_id": {"type": "integer"}}, "required": ["post_id"]}
    schema = _tool(params)

    result = sanitize_tool_schema(schema)

    assert result["function"]["parameters"]["required"] == ["post_id"]


def test_ignores_schema_without_parameters():
    schema = {"type": "function", "function": {"name": "t"}}

    assert sanitize_tool_schema(schema) == schema


def test_install_wraps_schema_method_once():
    class FakeTool:
        def get_openai_tool_schema(self):
            return _tool({"properties": {}, "type": "object", "required": []})

    install(FakeTool)
    install(FakeTool)

    params = FakeTool().get_openai_tool_schema()["function"]["parameters"]
    assert "required" not in params
    assert getattr(FakeTool.get_openai_tool_schema, "_groq_compat", False)
