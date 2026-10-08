FROM python:3.11-slim

# Install SUMO, system build tools, and OpenCV dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    sumo \
    sumo-tools \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV SUMO_HOME=/usr/share/sumo
ENV SUMO_BINARY=sumo
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy project files
COPY pyproject.toml .
COPY packages/ packages/
COPY backend/ backend/
COPY scripts/ scripts/

# Install internal packages and dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    -e packages/shared \
    -e packages/sumo-engine \
    -e packages/adaptive-policy \
    -e packages/cv-pipeline \
    -e packages/carla-bridge \
    -e backend \
    ultralytics

EXPOSE 8000

CMD ["sh", "-c", "python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
