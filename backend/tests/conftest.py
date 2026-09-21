import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

_tmp = tempfile.mkdtemp(prefix="mediplate-test-")
os.environ["MEDIPLATE_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["MEDIPLATE_SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"
os.environ["MEDIPLATE_FRONTEND_DIST"] = f"{_tmp}/no-dist"

from app import knowledge  # noqa: E402


@pytest.fixture(scope="session")
def k():
    return knowledge.get()


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app
    with TestClient(app) as c:
        yield c


BASE_PROFILE = {
    "age": 55, "sex": "male", "height_cm": 168, "weight_kg": 74, "waist_cm": 92, "activity": "light",
    "state": "Tamil Nadu", "diet_type": "veg", "no_beef": True, "no_pork": False, "allergies": [],
    "diseases": {}, "medicines": [], "smoker": False, "family_history_heart": False,
    "family_history_diabetes": 0, "exercise": "some",
}


def profile(**over):
    p = {**BASE_PROFILE, **over}
    p["diseases"] = over.get("diseases", {})
    return p
