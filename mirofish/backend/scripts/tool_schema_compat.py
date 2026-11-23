"""Make camel/OASIS tool schemas acceptable to strict OpenAI-compatible APIs.

OASIS registers no-argument actions (e.g. ``do_nothing``) whose schema camel
emits as ``{"properties": {}, "required": [], ...}``. Groq's validator rejects
that with HTTP 400 ("'required' present but 'properties' is missing"), so
every agent call that offers the tool fails. Dropping the empty ``required``
is equivalent JSON Schema and is accepted by both OpenAI and Groq.

Call ``install()`` once in each simulation subprocess before agents are built.
"""
import copy
import functools
from typing import Any, Dict, Optional


def sanitize_tool_schema(schema: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of an OpenAI tool schema without an empty ``required``
    when the parameters object has no properties. Other schemas are returned
    unchanged (as a copy)."""
    result = copy.deepcopy(schema)
    params = (result.get("function") or {}).get("parameters")
    if not isinstance(params, dict):
        return result
    if not params.get("properties") and params.get("required") == []:
        del params["required"]
    return result


def install(tool_cls: Optional[type] = None) -> None:
    """Wrap ``tool_cls.get_openai_tool_schema`` (default: camel FunctionTool)
    so every schema it returns is sanitized. Safe to call more than once."""
    if tool_cls is None:
        from camel.toolkits import FunctionTool
        tool_cls = FunctionTool

    original = tool_cls.get_openai_tool_schema
    if getattr(original, "_groq_compat", False):
        return

    @functools.wraps(original)
    def get_openai_tool_schema(self, *args, **kwargs):
        return sanitize_tool_schema(original(self, *args, **kwargs))

    get_openai_tool_schema._groq_compat = True
    tool_cls.get_openai_tool_schema = get_openai_tool_schema
