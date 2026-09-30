# Deployment Guide — DigitalOcean

This guide covers how SIGNAL (Sales Intelligence Agent) is containerised, deployed to a DigitalOcean droplet, and redeployed automatically through CI/CD. It runs from a fresh server to automatic deploys on every push.

| | |
|---|---|
| Server | DigitalOcean droplet, Ubuntu, IP `168.144.88.232` |
| Login user | `root` |
| Repo on server | `/root/Sales-Intelligence-Agent` |
| Repo | `github.com/nervesparksdev05/Sales-Intelligence-Agent` |
| Deploy branch | `main` |

## Contents

1. [Architecture](#1-architecture)
2. [Dockerisation (backend, Postgres, pgAdmin)](#2-dockerisation-backend-postgres-pgadmin)
3. [Frontend with PM2](#3-frontend-with-pm2)
4. [Prepare the droplet](#4-prepare-the-droplet-one-time)
5. [Get the code onto the server](#5-get-the-code-onto-the-server-one-time)
6. [Environment files](#6-environment-files-one-time)
7. [First start](#7-first-start-one-time)
8. [CI/CD with GitHub Actions](#8-cicd-with-github-actions)
9. [How login works](#9-how-login-works)
10. [Operations](#10-operations)
11. [Open items / known issues](#11-open-items--known-issues)

---

## 1. Architecture

```
                       DigitalOcean droplet (168.144.88.232)
 ┌──────────────────────────────────────────────────────────────────────┐
 │                                                                      │
 │  PM2                                  Docker Compose                 │
 │  ┌──────────────────┐                 ┌───────────────────────────┐  │
 │  │ signal-frontend  │   API calls     │ backend   :8175 (FastAPI) │  │
 │  │ :4173 (static    │ ──────────────► │ migrate   (runs, exits)   │  │
 │  │  Vite build)     │                 │ db        :5433 (Postgres)│  │
 │  └──────────────────┘                 │ pgadmin   :5050           │  │
 │                                       └─────────────┬─────────────┘  │
 └─────────────────────────────────────────────────────┼────────────────┘
                                                       │ login / refresh
                                                       ▼
                                          auth.nervesparks.com (auth gateway)
```

| Service | Runs with | Port (host) | Purpose |
|---|---|---|---|
| `backend` | Docker | 8175 | FastAPI API |
| `migrate` | Docker | — | Runs `alembic upgrade head`, then exits |
| `db` | Docker | 5433 → 5432 | PostgreSQL 16; data in the `postgres_data` volume |
| `pgadmin` | Docker | 5050 | DB admin UI |
| `signal-frontend` | PM2 | 4173 | Serves the built frontend (`frontend/dist`) |

### Files involved

| File | What it does |
|---|---|
| `backend/Dockerfile` | Backend image (Python 3.11, uvicorn on 8175) |
| `backend/.dockerignore` | Keeps `venv/`, `.env`, `secrets/`, `tests/` and data files out of the image |
| `docker-compose.yml` | Defines `db`, `migrate`, `backend` and `pgadmin` |
| `docker/pgadmin/servers.json` | Pre-registers the `db` server in pgAdmin |
| `.env` (root, not in git) | Docker Compose settings: DB credentials and ports |
| `frontend/ecosystem.config.cjs` | PM2 config: static server for `dist/` in SPA mode |
| `frontend/package.json` → `npm run deploy` | Build, then `pm2 startOrReload`, then `pm2 save` |
| `.github/workflows/backend.yml` | Backend auto-deploy |
| `.github/workflows/frontend.yml` | Frontend CI and auto-deploy |

---

## 2. Dockerisation (backend, Postgres, pgAdmin)

The backend, the database and pgAdmin all run as Docker containers managed by one `docker-compose.yml`. A single command starts the whole backend stack, migrations included:

```bash
docker compose up -d --build
```

### 2.1 `backend/Dockerfile`

```dockerfile
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

# Migrations are applied by the `migrate` service in docker-compose.yml
# before this container starts.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8175"]
```

| Line | Why |
|---|---|
| `python:3.11-slim` | Same Python version as local development; slim keeps the image small |
| `PYTHONUNBUFFERED=1` | Logs appear immediately in `docker compose logs` |
| `COPY requirements.txt` → `pip install` → `COPY . .` | Dependencies sit in their own cached layer, so a code-only change rebuilds in seconds |
| `mkdir -p /app/static` | Uploaded logos go here; a volume keeps them across rebuilds |
| `--host 0.0.0.0` | Listens on every interface so Docker's port mapping reaches it |
| No `alembic` in `CMD` | Migrations run in the separate `migrate` service (section 2.4) |

The same image is used for two services: `backend`, which runs the default `CMD` (uvicorn), and `migrate`, which overrides the command with `alembic upgrade head`.

### 2.2 `backend/.dockerignore`

```
venv/
.venv/
__pycache__/
*.py[cod]
.pytest_cache/
.env
.env.*
secrets/
static/
tests/
*.xlsx
*.csv
*.log
Dockerfile
.dockerignore
```

These are excluded from the image for three reasons:
- **Secrets:** `.env` and `secrets/` are passed in at runtime through `env_file`; they're never built into the image.
- **Local-only folders:** the Windows `venv/` wouldn't work inside Linux anyway.
- **Size:** tests, data exports and caches just make the image bigger.

### 2.3 `docker-compose.yml`: services

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: signal-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-signal_user}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-signal_password}
      POSTGRES_DB: ${POSTGRES_DB:-signal}
    ports:
      - "${POSTGRES_HOST_PORT:-5433}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  migrate:
    build:
      context: ./backend
    container_name: signal-migrate
    command: ["alembic", "upgrade", "head"]
    env_file:
      - ./backend/.env
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-signal_user}:${POSTGRES_PASSWORD:-signal_password}@db:5432/${POSTGRES_DB:-signal}
    volumes:
      - ./backend/alembic:/app/alembic
    restart: "no"
    depends_on:
      db:
        condition: service_healthy

  backend:
    build:
      context: ./backend
    container_name: signal-backend
    restart: unless-stopped
    env_file:
      - ./backend/.env
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-signal_user}:${POSTGRES_PASSWORD:-signal_password}@db:5432/${POSTGRES_DB:-signal}
    ports:
      - "${BACKEND_HOST_PORT:-8175}:8175"
    volumes:
      - backend_static:/app/static
    depends_on:
      db:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: signal-pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL:-admin@example.com}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_DEFAULT_PASSWORD:-admin}
      PGADMIN_CONFIG_SERVER_MODE: "False"
      PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED: "False"
    ports:
      - "${PGADMIN_HOST_PORT:-5050}:80"
    volumes:
      - pgadmin_data:/var/lib/pgadmin
      - ./docker/pgadmin/servers.json:/pgadmin4/servers.json:ro
    depends_on:
      - db

volumes:
  postgres_data:
  backend_static:
  pgadmin_data:
```

**`db`: PostgreSQL 16**
- The user, password and database name come from the root `.env`, falling back to the defaults shown.
- It's published on host port **5433**, so it doesn't clash with a native Postgres on 5432. Inside Docker, other containers reach it as `db:5432`.
- A `pg_isready` healthcheck lets the other services wait until the database really accepts connections.
- Data lives in the `postgres_data` named volume, so it survives restarts and rebuilds.

**`migrate`: one-shot migration job**
- Built from the same backend image, but it runs `alembic upgrade head` and exits with code `0`.
- It starts only after `db` is healthy.
- `backend/alembic/` is mounted from the repo, so new migration files apply without an image rebuild.
- `restart: "no"` stops it looping after it finishes. `Exited (0)` in `docker compose ps -a` is the **expected** state.

**`backend`: FastAPI API**
- It reads every app secret from `backend/.env` through `env_file`.
- `environment.DATABASE_URL` **overrides** the value in `backend/.env`, so the container always talks to the `db` container, never to `localhost`. Your `backend/.env` keeps its local value for non-Docker runs.
- It starts only when `db` is healthy **and** `migrate` completed successfully, so the API never runs against an out-of-date schema.
- Uploaded files are kept in the `backend_static` volume.

**`pgadmin`: database admin UI**
- It runs in desktop mode (`SERVER_MODE=False`), so there's no login screen.
- `servers.json` pre-registers the **SIGNAL (docker)** server (host `db`, port 5432). You're asked for the DB password on first connect.
- Because there's no login, **don't expose port 5050 publicly** (sections 4.4 and 10.3).

### 2.4 Startup order

```
docker compose up -d
      │
      ▼
   db starts ──► healthcheck: pg_isready ──► healthy
      │
      ▼
   migrate: alembic upgrade head ──► Exited (0)        (non-zero → backend is NOT started)
      │
      ▼
   backend: uvicorn :8175
   pgadmin: :5050
```

Every `docker compose up` repeats this, so **migrations are always applied automatically** before the API starts.

### 2.5 Configuration: which `.env` does what

| File | Read by | Contains |
|---|---|---|
| `.env` (repo root) | Docker Compose, for `${VAR:-default}` substitution | `POSTGRES_*`, `PGADMIN_*`, `*_HOST_PORT` |
| `backend/.env` | The backend and migrate containers (`env_file`) | App secrets: LLM, auth gateway, scraper, you.com, Langfuse |

Both files are gitignored. Full templates are in [section 6](#6-environment-files-one-time).

### 2.6 Volumes

| Volume | Mounted at | Holds |
|---|---|---|
| `postgres_data` | `/var/lib/postgresql/data` in `db` | All database data |
| `backend_static` | `/app/static` in `backend` | Uploaded organisation logos |
| `pgadmin_data` | `/var/lib/pgadmin` in `pgadmin` | pgAdmin settings and saved passwords |

`docker compose down` keeps the volumes. `docker compose down -v` **deletes them**, and all data with them.

### 2.7 Running the stack locally (Windows, Docker Desktop)

```powershell
docker compose up -d --build     # start everything
docker compose ps -a             # status
docker compose logs -f backend   # follow API logs
docker compose down              # stop (keeps data)
```

| URL | What |
|---|---|
| http://localhost:8175/docs | Backend API (Swagger) |
| http://localhost:5050 | pgAdmin |
| `localhost:5433` | Postgres, for DBeaver or psql; user `signal_user`, database `signal` |

### 2.8 When to rebuild

| You changed | Run |
|---|---|
| Python code or `requirements.txt` | `docker compose up -d --build` |
| Added a migration file only | `docker compose up -d` (the alembic folder is mounted) |
| `backend/.env` | `docker compose up -d` (the container is recreated with the new env) |
| DB user or password in the root `.env` | Only applies to a **new** volume: `docker compose down -v` (deletes data) |

---

## 3. Frontend with PM2

The frontend is a Vite + React single-page app. It's built into static files (`frontend/dist`), which PM2's built-in static server serves.

### 3.1 `frontend/ecosystem.config.cjs`

```js
module.exports = {
  apps: [
    {
      name: "signal-frontend",
      script: "serve",
      cwd: __dirname,
      env: {
        PM2_SERVE_PATH: "./dist",
        PM2_SERVE_PORT: process.env.FRONTEND_PORT || 4173,
        PM2_SERVE_SPA: "true",
        PM2_SERVE_HOMEPAGE: "/index.html",
      },
    },
  ],
};
```

- `script: "serve"` uses PM2's static file server, so no extra package is needed.
- `PM2_SERVE_SPA` + `PM2_SERVE_HOMEPAGE` send unknown paths to `index.html`, so refreshing on `/dashboard` doesn't return 404.
- The port defaults to **4173**; override it with the `FRONTEND_PORT` environment variable.
- The `.cjs` extension is needed because `package.json` has `"type": "module"`.

### 3.2 `npm run deploy`

```json
"deploy": "npm run build && pm2 startOrReload ecosystem.config.cjs && pm2 save"
```

1. `npm run build` runs `tsc -b && vite build` and produces `dist/`.
2. `pm2 startOrReload` starts the app the first time, and reloads it after that.
3. `pm2 save` saves the process list, so `pm2 startup` restores it after a reboot.

`VITE_*` variables are **built into the bundle at build time**. After changing `frontend/.env`, run `npm run deploy` again; `pm2 restart` alone won't pick up the change.

---

## 4. Prepare the droplet (one time)

```bash
ssh root@168.144.88.232
```

### 4.1 System packages and Git

```bash
apt update && apt upgrade -y
apt install -y git curl
```

### 4.2 Docker and Docker Compose

```bash
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version
```

### 4.3 Node.js (via nvm) and PM2

The frontend deploy workflow loads nvm from `~/.nvm`, so install Node with nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 24
node -v && npm -v

npm install -g pm2
pm2 -v
```

### 4.4 Firewall

```bash
ufw allow OpenSSH
ufw allow 8175/tcp   # backend API
ufw allow 4173/tcp   # frontend
ufw enable
ufw status
```

> **Don't expose 5050 (pgAdmin) or 5433 (Postgres) publicly.** pgAdmin has no login screen, so anyone who can reach 5050 can open the database. Docker writes its own iptables rules, so a published port can stay reachable **even when `ufw` blocks it**. Block 5050 and 5433 in a **DigitalOcean Cloud Firewall** (Networking → Firewalls), and use an SSH tunnel to reach them (section 10.3).

---

## 5. Get the code onto the server (one time)

### 5.1 Deploy key, for a private repo

This lets the server `git pull` from GitHub:

```bash
ssh-keygen -t ed25519 -C "server-deploy-key" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Add the printed key in GitHub: repo → **Settings → Deploy keys → Add deploy key**, read-only.

### 5.2 Clone

```bash
cd ~
git clone git@github.com:nervesparksdev05/Sales-Intelligence-Agent.git
cd Sales-Intelligence-Agent
git checkout main
pwd   # /root/Sales-Intelligence-Agent
```

---

## 6. Environment files (one time)

All three are gitignored. Create them by hand on the server; **CI/CD never touches them.**

### 6.1 Root `.env`: Docker Compose settings

`/root/Sales-Intelligence-Agent/.env`

```env
# --- Postgres ---
POSTGRES_USER=signal_user
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=signal
POSTGRES_HOST_PORT=5433

# --- Backend ---
BACKEND_HOST_PORT=8175

# --- pgAdmin ---
PGADMIN_DEFAULT_EMAIL=admin@example.com
PGADMIN_DEFAULT_PASSWORD=<strong-password>
PGADMIN_HOST_PORT=5050
```

> Postgres reads `POSTGRES_USER` and `POSTGRES_PASSWORD` **only when it first creates the database**. Set strong values **before** the first `docker compose up`.

### 6.2 `backend/.env`: app secrets

`/root/Sales-Intelligence-Agent/backend/.env`. Copy it from a teammate or a secret store; never commit it.

```env
APP_ENV=production
LOG_LEVEL=INFO

# Only used when running the backend WITHOUT Docker. Docker Compose
# overrides this to point at the `db` container automatically.
DATABASE_URL=postgresql+asyncpg://postgres:<password>@localhost:5432/signal

# LLM
LLM_API_KEY=...
LLM_MODEL=gemini-2.5-flash
DEEPSEEK_API_KEY=...
OLLAMA_BASE_URL=http://124.123.18.150:11434/v1
OLLAMA_MODEL=qwen3:14b

# NervesParks auth gateway (the backend proxies login and verifies JWTs)
AUTH_GATEWAY_BASE_URL=https://auth.nervesparks.com
AUTH_GATEWAY_PREFIX=/api/v1/auth
AUTH_JWKS_URL=https://auth.nervesparks.com/api/v1/auth/.well-known/jwks.json
MAIN_AUTH_ISSUER=auth-gateway
MAIN_AUTH_AUDIENCE=auth-gateway-access
MAIN_AUTH_JWKS_CACHE_TTL_SECONDS=300
# AUTH_TENANT_ID=default          # optional; sent as tenant_id on register

# Scraper
SCRAPER_SERVICE_URL=http://124.123.18.150:9090/nexus-api
SCRAPER_API_KEY=...

# Web research
YOU_API_KEY=...

# Langfuse
LANGFUSE_SECRET_KEY=...
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_BASE_URL=https://langfuse.nervesparks.com
```

Don't put the Docker settings (`POSTGRES_*`, `PGADMIN_*`, `BACKEND_HOST_PORT`) here. They belong in the root `.env` only.

### 6.3 `frontend/.env`: build-time settings

`/root/Sales-Intelligence-Agent/frontend/.env`

```env
VITE_API_BASE_URL=http://168.144.88.232:8175
```

- Include the `:8175` port unless a reverse proxy such as nginx serves the API on port 80.
- `VITE_AUTH_GATEWAY_BASE_URL` and `VITE_AUTH_GATEWAY_PREFIX` are no longer used, because login goes through the backend.

---

## 7. First start (one time)

### 7.1 Backend, database, pgAdmin

```bash
cd /root/Sales-Intelligence-Agent
docker compose up -d --build
docker compose ps -a
```

Expected:

```
signal-db        Up (healthy)
signal-migrate   Exited (0)       <- normal: it's a one-shot job
signal-backend   Up
signal-pgadmin   Up
```

Verify:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8175/docs   # 200
docker compose logs migrate --tail 20
docker compose logs backend --tail 20
```

### 7.2 Frontend

```bash
cd /root/Sales-Intelligence-Agent/frontend
npm install
npm run deploy
pm2 ls                                                                     # signal-frontend: online
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4173/            # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4173/dashboard   # 200 (SPA fallback)

pm2 startup systemd     # restart PM2 on reboot (as root this installs directly)
pm2 save
```

The app is now at `http://168.144.88.232:4173`.

---

## 8. CI/CD with GitHub Actions

After the one-time setup, **every push to `main` deploys automatically**. There's one workflow per part of the app, and each runs only when its own files change.

### 8.1 Pipeline overview

```
 Developer pushes / merges to main
            │
            ▼
 ┌─────────────────────────── GitHub Actions ───────────────────────────┐
 │                                                                      │
 │  Changed backend/**, docker-compose.yml, docker/** ?                 │
 │     └─► backend.yml ─► deploy ─────────────────────┐                 │
 │                                                    │                 │
 │  Changed frontend/** ?                             │                 │
 │     └─► frontend.yml ─► build (lint, tsc, vite) ─► deploy            │
 │                                                    │                 │
 │         (both deploy jobs share the concurrency group                │
 │          "deploy-production" → never run at the same time)           │
 └────────────────────────────────────────────────────┼─────────────────┘
                                                      │ SSH (appleboy/ssh-action)
                                                      ▼
                         Droplet: /root/Sales-Intelligence-Agent
                         backend  → git pull → docker compose build → up -d
                         frontend → git pull → npm install → npm run deploy
```

| Workflow | Triggers | Jobs | What it deploys |
|---|---|---|---|
| `backend.yml` | push to `main` changing `backend/**`, `docker-compose.yml`, `docker/**`, or the workflow file; manual | `deploy` | Rebuilds and restarts the Docker stack (migrations included) |
| `frontend.yml` | push or PR changing `frontend/**` or the workflow file; manual | `build`, then `deploy` (`main` only) | Rebuilds `dist/`, reloads PM2 |

### 8.2 SSH access for GitHub Actions (one time)

GitHub Actions logs into the droplet with an SSH key. Run on the server:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions -N ""
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_actions        # copy the whole output, including BEGIN/END lines
```

- The key has no passphrase (`-N ""`) because Actions can't type one.
- The public key goes into `authorized_keys` so it can log in; the private key goes to GitHub.

### 8.3 GitHub repository secrets (one time)

In the repo, go to **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `SSH_HOST` | `168.144.88.232` |
| `SSH_USER` | `root` |
| `SSH_PRIVATE_KEY` | output of `cat ~/.ssh/github_actions` |
| `SSH_PORT` | optional; only if SSH isn't on 22 |

Optional **repository variable** (Variables tab): `VITE_API_BASE_URL`. It's used only for the CI build check in `frontend.yml`. The real server build reads `frontend/.env` on the server.

The repo path `/root/Sales-Intelligence-Agent` is written directly into both workflows.

### 8.4 `.github/workflows/backend.yml`

```yaml
name: Backend

on:
  push:
    branches: [main]
    paths:
      - "backend/**"
      - "docker-compose.yml"
      - "docker/**"
      - ".github/workflows/backend.yml"
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    steps:
      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          port: ${{ secrets.SSH_PORT || 22 }}
          script: |
            set -e
            cd /root/Sales-Intelligence-Agent
            git pull origin main
            docker compose build
            docker compose up -d
            docker image prune -f
            docker compose ps
```

| Step | What happens on the server |
|---|---|
| `set -e` | Stops at the first failing command, so the job goes red |
| `git pull origin main` | Fetches the new code |
| `docker compose build` | Rebuilds the backend image (cached layers make code-only changes fast) |
| `docker compose up -d` | Recreates changed containers: `db` stays up with its data, `migrate` applies new migrations, then `backend` restarts |
| `docker image prune -f` | Removes old unused images so the disk doesn't fill up |
| `docker compose ps` | Prints container status into the Actions log |

- `workflow_dispatch` adds a **Run workflow** button in the Actions tab for manual deploys.
- If a migration fails, `migrate` exits non-zero and the backend doesn't restart onto a broken schema. Check `docker compose logs migrate`.

### 8.5 `.github/workflows/frontend.yml`

```yaml
name: Frontend

on:
  push:
    paths:
      - "frontend/**"
      - ".github/workflows/frontend.yml"
  pull_request:
    paths:
      - "frontend/**"
      - ".github/workflows/frontend.yml"
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
      - name: Install dependencies
        run: npm install
      - name: Lint
        run: npm run lint
        continue-on-error: true
      - name: Typecheck and build
        run: npm run build
        env:
          VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL || 'http://localhost:8175' }}

  deploy:
    needs: build
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    steps:
      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          port: ${{ secrets.SSH_PORT || 22 }}
          script: |
            set -e
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
            cd /root/Sales-Intelligence-Agent
            git fetch origin main
            git checkout main
            git pull --ff-only origin main
            cd frontend
            npm install
            npm run deploy
            pm2 ls
```

**`build` job (CI).** It runs on GitHub's machines for every push and PR that touches the frontend:

| Step | Why |
|---|---|
| `npm install` | `package-lock.json` is gitignored, so `npm ci` can't be used |
| `npm run lint` | Reported, but **not blocking** (`continue-on-error`) until the 5 existing lint errors are fixed |
| `npm run build` | `tsc -b` + `vite build`; **a type error fails the pipeline and blocks the deploy** |

**`deploy` job (CD).** It runs only on a **push to `main`** and only after `build` passes:

| Step | Why |
|---|---|
| Load `nvm.sh` | Non-interactive SSH doesn't load `~/.bashrc`, so without it `node`, `npm` and `pm2` aren't found |
| `git checkout main` + `git pull --ff-only` | Updates the code; `--ff-only` refuses to merge if the server has diverged, rather than creating a merge commit |
| `npm install` | Picks up new dependencies |
| `npm run deploy` | Build, then PM2 reload, then `pm2 save` |
| `pm2 ls` | Prints process status into the Actions log |

### 8.6 Release flow, day to day

```bash
# on your machine
git checkout main
git pull
# ...make changes, commit...
git push origin main          # ← triggers the relevant workflow(s)
```

Then:

1. Open the repo's **Actions** tab and watch the **Backend** or **Frontend** run.
2. Check the job's log. The last lines show `docker compose ps` or `pm2 ls` from the server.
3. Check the live site: `http://168.144.88.232:8175/docs` and `http://168.144.88.232:4173`.

A PR to `main` runs the frontend `build` job as a check, but doesn't deploy until it's merged.

### 8.7 Manual deploy and rollback

- **Re-run a deploy without a code change:** Actions → **Backend** or **Frontend** → **Run workflow**, then choose `main`.
- **Roll back:** revert the bad commit on `main` and push. CI deploys the reverted code:

```bash
git revert <bad-commit-sha>
git push origin main
```

  Avoid `git checkout <old-sha>` directly on the server: the next CI run would fail or overwrite it.

- **A migration can't be undone by reverting code.** To go back a migration, run on the server: `docker compose run --rm migrate alembic downgrade -1`.

### 8.8 CI/CD troubleshooting

| Symptom in the Actions log | Cause and fix |
|---|---|
| `ssh: handshake failed` / `unable to authenticate` | `SSH_PRIVATE_KEY` is incomplete (include the BEGIN/END lines), or the public key isn't in `/root/.ssh/authorized_keys` |
| `dial tcp ...:22: i/o timeout` | Firewall blocks SSH, or `SSH_HOST`/`SSH_PORT` is wrong |
| `cd: /root/Sales-Intelligence-Agent: No such file` | The repo isn't cloned at that path (section 5.2) |
| `git pull` asks for credentials or fails | The server's deploy key isn't added to the GitHub repo (section 5.1) |
| `Not possible to fast-forward` | Someone edited files on the server. Run `git status` there and discard or commit those changes |
| `npm: command not found` / `pm2: command not found` | Node isn't installed through nvm in `/root/.nvm` (section 4.3) |
| Backend deploy is green but the API is down | `docker compose logs migrate` (migration failed?) and `docker compose logs backend` |
| Frontend `build` job fails | A TypeScript error. Run `npx tsc -b` locally |
| Workflow didn't run at all | The push didn't touch that workflow's `paths`, or it wasn't on `main` (backend deploys only from `main`) |

---

## 9. How login works

The browser only talks to our backend. The backend forwards auth calls to the NervesParks gateway.

```
Browser ──POST /auth/login────► backend :8175 ──► auth.nervesparks.com/api/v1/auth/login
        ◄── tokens / error ─────                ◄──
Browser ──GET /companies (Bearer token)──► backend verifies JWT via JWKS + checks membership
```

| Endpoint (backend) | Forwards to gateway | Notes |
|---|---|---|
| `POST /auth/login` | `/login` | email + password |
| `POST /auth/register` | `/register` | Backend adds `tenant_id` (`AUTH_TENANT_ID`, or `default`) |
| `POST /auth/refresh` | `/refresh` | Frontend calls it silently when a request returns 401 |
| `POST /auth/logout` | `/logout` | Frontend clears the local session regardless of the result |
| `GET /auth/me` | — | Protected; resolves the caller's user, organisation and workspace |

- The gateway's responses (status and JSON) are passed through unchanged.
- Gateway timeouts return 504, and an unreachable gateway or a gateway 5xx returns 502. The frontend treats both as "service unavailable" and **doesn't** log the user out.
- Code: `backend/app/services/auth_gateway.py`, `backend/app/routes/auth.py`, `frontend/src/lib/gatewayAuth.ts`.

---

## 10. Operations

### 10.1 Everyday commands (on the server)

```bash
cd /root/Sales-Intelligence-Agent

# Status
docker compose ps -a
pm2 ls

# Logs
docker compose logs -f backend
docker compose logs migrate
pm2 logs signal-frontend

# Restart
docker compose restart backend
pm2 restart signal-frontend

# Manual redeploy (same as CI)
git pull origin main
docker compose up -d --build
cd frontend && npm install && npm run deploy
```

### 10.2 Database migrations

- **Applying:** automatic, through the `migrate` service on every `docker compose up`, including every CI backend deploy.
- **Creating a new migration:** do this locally, not in the container. Run it from `backend/`, pointed at a database that's at `head`:

```powershell
$env:DATABASE_URL="postgresql+asyncpg://signal_user:signal_password@localhost:5433/signal"
alembic revision --autogenerate -m "describe change"
```

  Commit the new file in `backend/alembic/versions/` and push to `main`. CI applies it.

- **Current revision:** `docker compose exec backend alembic current`
- **A failed migration** makes `migrate` exit non-zero, so `backend` doesn't start. Inspect it with `docker compose logs migrate`.

### 10.3 Accessing pgAdmin and Postgres safely

From your own machine, open an SSH tunnel:

```bash
ssh -L 5050:localhost:5050 -L 5433:localhost:5433 root@168.144.88.232
```

- **pgAdmin:** browse to `http://localhost:5050`. **SIGNAL (docker)** is already listed; use the `POSTGRES_PASSWORD` from the root `.env`.
- **SQL client:** connect to `localhost:5433`, user `signal_user`, database `signal`.

### 10.4 Backups

```bash
# Backup
docker compose exec -T db pg_dump -U signal_user -d signal -Fc > ~/signal_$(date +%F).dump

# Restore into the running DB
docker compose exec -T db pg_restore -U signal_user -d signal --clean --if-exists < ~/signal_YYYY-MM-DD.dump
```

### 10.5 Reset the database (deletes all data)

```bash
docker compose down -v        # removes the postgres_data, backend_static and pgadmin_data volumes
docker compose up -d --build  # fresh DB, migrations re-run
```

### 10.6 Troubleshooting (runtime)

| Symptom | Check |
|---|---|
| `backend` won't start | `docker compose logs migrate`; a migration probably failed |
| `signal-migrate Exited (1)` | Migration error or wrong DB credentials in the root `.env` |
| Frontend loads but every API call fails | `VITE_API_BASE_URL` in `frontend/.env` (then rebuild), firewall port 8175, CORS (section 11) |
| Refreshing a page returns 404 | `PM2_SERVE_SPA` in `ecosystem.config.cjs` |
| Everyone logged out when the gateway blips | Shouldn't happen; 502/504 keep the session. Check `docker compose logs backend` |

---

## 11. Open items / known issues

1. **CORS blocks the deployed frontend.** `backend/app/main.py` only allows `http://localhost:*` and `http://127.0.0.1:*`. A frontend opened at `http://168.144.88.232:4173` or a domain is blocked by the browser, **including login**. The allowed origins need to be configurable, e.g. a `CORS_ALLOW_ORIGINS` setting in `backend/.env`.
2. **pgAdmin and Postgres ports:** `docker-compose.yml` publishes 5050 and 5433 on all interfaces, and pgAdmin has no login screen. Block them with a DigitalOcean Cloud Firewall, or bind them to localhost (`"127.0.0.1:5050:80"`, `"127.0.0.1:5433:5432"`).
3. **Gateway logout returns `403 CSRF token missing`.** This is gateway behaviour and happens when it's called directly too. Users are still logged out locally; revoking the token on the gateway side needs the gateway's CSRF requirements.
4. **Frontend lint is not blocking yet.** 5 existing unused-variable errors. Once they're fixed, remove `continue-on-error: true` in `frontend.yml`.
5. **No `package-lock.json` in git** (it's in the root `.gitignore`), so installs use `npm install` instead of `npm ci`. Committing the lockfile would make builds reproducible.
6. **No tests run before a backend deploy.** `backend.yml` deploys directly. The 151-test suite needs only a Postgres and no API keys, and could be added back as a gate.
7. **No HTTPS or domain yet.** Put nginx or Caddy in front of ports 4173 and 8175 with a TLS certificate once a domain is assigned, then update `VITE_API_BASE_URL` and CORS.
