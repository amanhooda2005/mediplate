"""MediPlate web server: JSON API under /api and the built website at /."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select

from . import __version__, knowledge
from .auth import hash_password
from .config import get_settings
from .db import User, init_engine
from .routers import admin, auth, foods, labs, logs, meta, plans, profile

log = logging.getLogger("mediplate")


def seed_admin() -> None:
    from .db import _Session  # created by init_engine
    s = get_settings()
    with _Session() as db:
        exists = db.execute(select(User).where(func.lower(User.email) == s.admin_email.lower())).scalar_one_or_none()
        if exists is None:
            db.add(User(email=s.admin_email.lower(), name="Admin", password_hash=hash_password(s.admin_password),
                        role="admin", language="en"))
            db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_engine()
    knowledge.get()        # fail fast if the pipeline has not been run
    seed_admin()
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="MediPlate API", version=__version__, lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "input"
        text = str(first.get("msg", "Invalid input")).removeprefix("Value error, ")
        return JSONResponse(status_code=422, content={"detail": f"{field}: {text}"})

    @app.exception_handler(knowledge.KnowledgeError)
    async def _knowledge(_: Request, exc: knowledge.KnowledgeError):
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    for r in (auth.router, meta.router, profile.router, labs.router, plans.router, foods.router, logs.router,
              admin.router):
        app.include_router(r)

    @app.get("/api/health")
    def health() -> dict:
        k = knowledge.get()
        return {"status": "ok", "version": __version__, "dishes": len(k.dishes), "foods": len(k.foods)}

    dist: Path = s.frontend_dist
    if dist.exists() and (dist / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            if full_path.startswith("api/"):
                return JSONResponse(status_code=404, content={"detail": "Not found"})
            candidate = (dist / full_path).resolve()
            if full_path and candidate.is_file() and dist.resolve() in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")
    else:
        @app.get("/", include_in_schema=False)
        def no_frontend() -> dict:
            return {"message": "MediPlate API is running. Build the website with `npm run build` in frontend/."}
    return app


app = create_app()
