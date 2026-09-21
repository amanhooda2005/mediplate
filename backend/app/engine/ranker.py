"""M3 - Meal ranker (content-based, learns online from each patient's logs).

Every logged meal teaches the ranker: eating a dish is a small positive signal,
liking it a strong one, skipping it negative, disliking it strongly negative.
Signals are spread over the dish's main ingredients, so disliking bitter-gourd
poriyal also lowers other bitter-gourd dishes. Region match is applied by the
optimizer on top of this score.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from .. import knowledge

SIGNAL = {"liked": 3.0, "ate": 0.5, "skipped": -1.0, "disliked": -4.0}
MAX_BONUS = 30.0


@dataclass
class Preferences:
    dish_score: dict[str, float] = field(default_factory=dict)
    liked: set[str] = field(default_factory=set)
    disliked: set[str] = field(default_factory=set)

    def bonus(self, dish_id: str) -> float:
        return self.dish_score.get(dish_id, 0.0)


def signal_of(status: str, rating: int | None) -> list[str]:
    signals = []
    if status in ("ate", "skipped"):
        signals.append(status)
    if rating == 1:
        signals.append("liked")
    elif rating == -1:
        signals.append("disliked")
    return signals


def learn(logs: list[dict]) -> Preferences:
    """logs: dicts with dish_id, status (ate|skipped|swapped), rating (-1|0|1)."""
    k = knowledge.get()
    direct: dict[str, float] = defaultdict(float)
    ingredient: dict[str, float] = defaultdict(float)
    prefs = Preferences()
    for log in logs:
        dish = k.dishes.get(log.get("dish_id") or "")
        if dish is None:
            continue
        for s in signal_of(log.get("status", ""), log.get("rating")):
            direct[dish["id"]] += SIGNAL[s]
            for ki in dish["key_ingredients"]:
                ingredient[ki["code"]] += SIGNAL[s] * ki["share"]
        if log.get("rating") == 1:
            prefs.liked.add(dish["id"])
        elif log.get("rating") == -1:
            prefs.disliked.add(dish["id"])
    if not direct and not ingredient:
        return prefs
    for did, dish in k.dishes.items():
        score = 6.0 * direct.get(did, 0.0)
        score += sum(3.0 * ingredient.get(ki["code"], 0.0) * ki["share"] for ki in dish["key_ingredients"])
        if score:
            prefs.dish_score[did] = max(-MAX_BONUS, min(MAX_BONUS, score))
    return prefs
