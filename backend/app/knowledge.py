"""Loads the pipeline outputs (foods, dishes, rules, messages, models) once and
serves fast lookups to the engine. Call `reload()` after re-running the
pipeline to pick up new data without restarting the server."""
from __future__ import annotations

import json
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib

from .config import get_settings


class KnowledgeError(RuntimeError):
    pass


@dataclass
class Knowledge:
    foods: dict[str, dict]
    dishes: dict[str, dict]
    rules: dict
    messages: dict[str, dict[str, str]]
    manifest: dict
    heart_model: Any
    heart_meta: dict
    glucose_model: Any = None
    tag_members: dict[str, set[str]] = field(default_factory=dict)
    medicine_by_id: dict[str, dict] = field(default_factory=dict)

    @property
    def zones(self) -> dict:
        return self.rules["regions"]["zones"]

    @property
    def states(self) -> dict[str, str]:
        return self.rules["regions"]["states"]


_lock = threading.Lock()
_knowledge: Knowledge | None = None


def _read(path: Path):
    if not path.exists():
        raise KnowledgeError(f"{path.name} not found. Run `python pipeline/run_all.py` first.")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load(data_dir: Path | None = None, models_dir: Path | None = None) -> Knowledge:
    s = get_settings()
    data_dir = data_dir or s.data_dir
    models_dir = models_dir or s.models_dir
    foods = {f["code"]: f for f in _read(data_dir / "foods.json")}
    dishes = {d["id"]: d for d in _read(data_dir / "dishes.json")}
    rules = _read(data_dir / "rules.json")
    messages = _read(data_dir / "messages.json")
    manifest = _read(data_dir / "manifest.json")
    heart_path = models_dir / "m1_heart_risk.joblib"
    if not heart_path.exists():
        raise KnowledgeError("M1 heart model missing. Run the pipeline.")
    heart_model = joblib.load(heart_path)
    heart_meta = _read(models_dir / "m1_heart_risk.json")
    glucose_model = None
    if (models_dir / "m2_glucose.joblib").exists():
        glucose_model = joblib.load(models_dir / "m2_glucose.joblib")
    k = Knowledge(foods=foods, dishes=dishes, rules=rules, messages=messages, manifest=manifest,
                  heart_model=heart_model, heart_meta=heart_meta, glucose_model=glucose_model)
    k.tag_members = {t: set(codes) for t, codes in rules["food_tags"].items()}
    k.medicine_by_id = {m["id"]: m for m in rules["medicines"]}
    return k


def get() -> Knowledge:
    global _knowledge
    if _knowledge is None:
        with _lock:
            if _knowledge is None:
                _knowledge = load()
    return _knowledge


def reload() -> Knowledge:
    global _knowledge
    with _lock:
        _knowledge = load()
    return _knowledge


# ---------------------------------------------------------------- messages
_PLACEHOLDER = re.compile(r"\{(\w+)\}")


def render(key: str, params: dict | None = None, lang: str = "en") -> str:
    """Render a message in a language. Params whose value starts with '@' are
    themselves message keys (e.g. '@n_sodium_mg') and are translated too."""
    k = get()
    entry = k.messages.get(key)
    if entry is None:
        return key
    text = entry.get(lang) or entry.get("en", key)
    params = params or {}

    def sub(m: re.Match) -> str:
        v = params.get(m.group(1), m.group(0))
        if isinstance(v, str) and v.startswith("@"):
            return render(v[1:], None, lang)
        return str(v)

    return _PLACEHOLDER.sub(sub, text).strip()


def msg(key: str, **params) -> dict:
    """A message object sent to the client: key + params (for translation in
    the browser) + the English text (for logs, admin and fallbacks)."""
    return {"key": key, "params": params, "text": render(key, params, "en")}
