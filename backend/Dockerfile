FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first so this layer is cached across code-only changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Uploaded assets (organisation logos) are written here; mounted as a volume
# in docker-compose.yml so they survive container rebuilds.
RUN mkdir -p /app/static

EXPOSE 8175

# Apply pending migrations, then start the API.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8175"]
