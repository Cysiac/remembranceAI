# syntax=docker/dockerfile:1.7
# Memorial AI worker — FastAPI sidecar that runs the persona-build pipeline.
#
# Usage:
#   docker build -t memorial-worker -f apps/worker/Dockerfile apps/worker
#   docker run --rm -p 8000:8000 --env-file apps/worker/.env memorial-worker
#
# Multi-stage so the final image stays small and doesn't ship pip's wheel cache.

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System packages we actually need:
#   - build-essential is required to compile a few wheels (mail-parser deps).
#   - curl is used by container healthchecks (Fly/Railway both probe via HTTP,
#     but `curl` is handy for `docker exec` debugging).
#   - libmagic1 is what `mail-parser` reaches for at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        libmagic1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY . .

# Run as a non-root user so the platform's hardened defaults don't trip up
# (Fly + Railway both run as root by default; this is belt-and-suspenders).
RUN useradd --create-home --uid 10001 worker \
    && chown -R worker:worker /app
USER worker

EXPOSE 8000

# Healthcheck pings /healthz — Fly + Railway both honour this.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8000/healthz || exit 1

# `$PORT` is set by the platform (Fly, Railway, Render). Default to 8000 for
# local docker runs.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
