# Blindspot Edu

Learn the prerequisite your lecture assumed, then return to the lesson with evidence.

The adaptive release connects transcript coverage, optional prerequisite checks, supplementary teaching, server-graded reassessment and saved progress. It preserves the dark/burgundy visual identity while replacing the prototype workspace's hard-coded content. This repository does not itself prove a live deployment or student learning outcomes.

## Local development

Use Python 3.12, Node 22+ and FFmpeg (including ffprobe). If you already have `.env`, merge the new settings into it; do not overwrite existing credentials or database configuration. The copy command below is for a fresh setup.

```bash
python3.12 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In a second terminal, load the same environment and start processing:

```bash
. .venv/bin/activate
python -m backend.app.adaptive.worker
```

In a third terminal:

```bash
cd frontend
npm ci
npm run dev
```

Visit http://localhost:3000. Local startup needs no cloud credentials, but dynamic reasoning/narration requires the explicitly configured provider. Set a private `PILOT_INVITE_CODE` before uploading. Local media is private and served only through authorized routes. There is intentionally no automatically fabricated demo lecture.

Choose `STORAGE_BACKEND=local|s3|r2` explicitly. Production uses S3 and an EC2 role. Set `LLM_PROVIDER=bedrock` with an account-verified `BEDROCK_MODEL_ID`; `openai` is an explicit rollback option. Set `TTS_PROVIDER=polly` for narration or `disabled` for text-only local testing. No provider switch occurs silently.

## Prepare an honest sample

Obtain processing and public-playback permission. Record your own material or use a permitted recording. `fixtures/demo-script.txt` is an original development script, not a university recording or pilot evidence.

```bash
python -m scripts.admin import-recording /path/to/permitted.wav --title 'Course sample' --permission-note 'Describe actual processing permission'
python -m scripts.admin review RECORDING_ID
python -m scripts.admin publish-sample RECORDING_ID --permission-note 'Describe actual public playback permission' --reviewed
```

Wait for the worker to finish before review. Inspect every timestamp, explanation and answer before publishing. Public sample content is shared, while learner state remains separate. Existing legacy data is preserved; export it with `python -m scripts.admin export-legacy legacy.json` and re-import original media for adaptive processing.

## Tests and deployment

```bash
python -m pytest
cd frontend
npm run typecheck
npm run build
```

See [deployment](deploy/README.md), [release gates](docs/RELEASE_PLAN.md), [pilot protocol](docs/PILOT_PROTOCOL.md), [architecture](docs/ARCHITECTURE.md), and [submission draft](docs/SUBMISSION_DRAFT.md).

Public routes are under `/api/v2`. Old lecture/session, WhatsApp, static storage and whiteboard-lab endpoints are not mounted. Model selection is deployment configuration; voice preferences are learner-specific. The prototype modules are retained for reference but are not the production API.

## Limits

English demonstration voice; one recording processed at a time; a small anonymous pilot; configurable upload and inference allowances. A passed question is labelled “Passed this check,” not mastery. Failed verification never makes a recording ready. Supplementary answers are labelled as not verified against the recording. Real model quality, CPU capacity, TLS, budget coverage and public reachability must be checked on the actual deployment.

### Deferred prototype code

The release builds only the active app routes and adaptive learning components. Unmounted prototype components remain for reference; `frontend/package.prototype.json` records their previous dependency manifest. Avatar, WhatsApp, and general whiteboard routes are disabled.
