# Blindspot Edu: AI Agent & Operator Runbook

This document contains exact operational commands, architecture constraints, and troubleshooting steps so any AI agent or developer can manage, restart, and verify the servers and daemons easily.

---

## 1. System Architecture & Port Map

| Component | Working Directory | Runtime / Command | Port / Target | Health Check / Verification |
| :--- | :--- | :--- | :--- | :--- |
| **FastAPI Backend** | `.` (repo root) | `./.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload` | `http://127.0.0.1:8000` | `curl -s http://127.0.0.1:8000/health`<br>Expect: `{"status":"ok","release":"adaptive-v1"}` |
| **Adaptive Worker** | `.` (repo root) | `./.venv/bin/python -u -m backend.app.adaptive.worker` | Background polling daemon | Inspect SQLite `adaptive_jobs` or run `pytest` |
| **Next.js Frontend** | `frontend/` | `npm start` (or `npm run dev`) | `http://localhost:3000` | `curl -s http://localhost:3000 \| grep -i "blindspot"` |
| **Automated Tests** | `.` (repo root) | `./.venv/bin/python -m pytest tests/` | N/A | Run the current suite; see the readiness review |

---

## 2. Strict Project Rules & Invariants

1. **NO CLOUD DEPLOYMENTS**:
   - **Never** run `cdk deploy`, `aws` resource creation commands, or deploy infrastructure to AWS. Zero live cloud spend is a strict constraint. All execution is local.
2. **STRICT `/api/v1` ROUTING**:
   - All backend endpoints are mounted under `/api/v1` (e.g. `/api/v1/recordings`, `/api/v1/health`, etc.).
   - `/api/v2` is completely deprecated and unmounted. Do not reintroduce `/api/v2`.
3. **RSC TOKEN SAFETY**:
   - Design tokens (`button`, `secondary`, `panel`) are exported from `frontend/src/lib/ui-tokens.ts`.
   - Never export string constants used by Server Components from `"use client"` files (which Next.js RSC replaces with throw-proxy functions).
4. **PERSISTENT DURABLE CACHES**:
   - Audio transcripts are cached by SHA-256 fingerprint in `adaptive_transcript_cache`.
   - LLM structured reasoning is cached by SHA-256 fingerprint in `adaptive_llm_cache`.
   - Database is SQLite at `./blindspot.db` running in WAL mode.
5. **PREFER AWS MCP OVER CLI**:
   - For all AWS operations, status checks, CloudFormation inspections, instance health queries, S3 listings, and cloud management, always prefer the configured **AWS MCP Server** (`aws-mcp` tools, e.g. `aws___run_script` with `call_boto3`) rather than running shell CLI commands.
   - Use the shell CLI only for operations strictly requiring local host disk filesystem access (such as uploading local source files to S3).


---

## 3. How to Start All 3 Daemons (Step-by-Step)

### Step 1: Start FastAPI Backend
```bash
# In repo root (/home/usama/Documents/blindspot-edu)
./.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
*Verify:*
```bash
curl http://127.0.0.1:8000/health
# Output: {"status":"ok","release":"adaptive-v1"}
```

### Step 2: Start the Adaptive Worker Daemon
```bash
# In repo root (/home/usama/Documents/blindspot-edu)
./.venv/bin/python -u -m backend.app.adaptive.worker
```
*Logs indicate:*
`Adaptive worker daemon started with SQLite WAL mode. Polling for jobs...`

### Step 3: Build & Start Next.js Frontend
```bash
# In frontend directory (/home/usama/Documents/blindspot-edu/frontend)
cd frontend
npm run build
npm start
```
*Verify:*
```bash
curl -I http://localhost:3000
# Output: HTTP/1.1 200 OK
```
*(For active frontend development with hot-reload, run `npm run dev` instead).*

---

## 4. How to Check Status or Restart Existing Daemons

### Find running processes:
```bash
ps aux | grep -E "uvicorn|adaptive.worker|next-server|next dev"
```

### Stop / Kill running daemons cleanly:
```bash
pkill -f "uvicorn backend.main:app"
pkill -f "backend.app.adaptive.worker"
pkill -f "next-server"
pkill -f "next dev"
```

---

## 5. Running Automated Verification & Tests

### Run Pytest Suite:
```bash
./.venv/bin/python -m pytest tests/
# Expected: all tests pass; count changes as coverage grows.
```

### Run Frontend Typecheck & Build:
```bash
cd frontend && npm run typecheck && npm run build
# Expected: Compiled successfully with zero TypeScript or route errors.
```

### Automated Visual Verification with Playwright:
```bash
./.venv/bin/python -c "
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome')
        page = await browser.new_page()
        await page.goto('http://localhost:3000')
        print('Page loaded successfully:', await page.title())
        await browser.close()

asyncio.run(main())
"
```

---

## 6. Key File Reference

- **Backend Entrypoint**: `backend/main.py`
- **Adaptive API Router**: `backend/app/adaptive/api.py` (mounted at `/api/v1`)
- **Adaptive Models & SQLite Caches**: `backend/app/adaptive/models.py`
- **Worker Daemon**: `backend/app/adaptive/worker.py`
- **Frontend App Entry**: `frontend/src/app/page.tsx`
- **Interactive Workspace**: `frontend/src/components/adaptive/LearningWorkspace.tsx`
- **Shared Shell & Sticky Header**: `frontend/src/components/adaptive/Shell.tsx`
- **Modern Theme Dropdown**: `frontend/src/components/adaptive/ThemePicker.tsx`
- **Contact Footer**: `frontend/src/components/adaptive/Footer.tsx`
- **Design Tokens**: `frontend/src/lib/ui-tokens.ts`
- **Global Styles & Micro-keyframes**: `frontend/src/app/globals.css`
