"""Evaluates the small condition language used in the rule files."""
from __future__ import annotations

from typing import Any, Protocol


class HasFields(Protocol):
    def field(self, name: str) -> Any: ...


def _compare(actual: Any, op: str, expected: Any) -> bool:
    if actual is None:
        return False
    try:
        if op == "==":
            return actual == expected
        if op == "!=":
            return actual != expected
        if op == ">":
            return actual > expected
        if op == ">=":
            return actual >= expected
        if op == "<":
            return actual < expected
        if op == "<=":
            return actual <= expected
        if op == "in":
            return actual in expected
    except TypeError:
        return False
    raise ValueError(f"unknown operator {op}")


def holds(rule: dict, ctx: HasFields) -> bool:
    """True when all `when` conditions hold and at least one `when_any`
    condition holds (each part is optional)."""
    for c in rule.get("when") or []:
        if not _compare(ctx.field(c["field"]), c["op"], c["value"]):
            return False
    any_list = rule.get("when_any")
    if any_list:
        return any(_compare(ctx.field(c["field"]), c["op"], c["value"]) for c in any_list)
    return True
