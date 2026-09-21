# ---- build the website ----
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- API + website ----
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    MEDIPLATE_DATABASE_URL=sqlite:////data/mediplate.db \
    MEDIPLATE_FRONTEND_DIST=/app/frontend/dist
WORKDIR /app
COPY backend/requirements.txt backend/requirements-postgres.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt -r backend/requirements-postgres.txt
COPY pipeline/ pipeline/
COPY backend/ backend/
COPY --from=web /web/dist frontend/dist
RUN mkdir -p /data
WORKDIR /app/backend
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
