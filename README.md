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

Public routes are under `/api/v1`. Old WhatsApp, static storage and whiteboard-lab endpoints are not mounted. Model selection is deployment configuration; voice preferences are learner-specific. The prototype modules are retained for reference but are not the production API.

## Limits

English demonstration voice; one recording processed at a time; a small anonymous pilot; configurable upload and inference allowances. A passed question is labelled “Passed this check,” not mastery. Failed verification never makes a recording ready. Supplementary answers are labelled as not verified against the recording. Real model quality, CPU capacity, TLS, budget coverage and public reachability must be checked on the actual deployment.

### Deferred prototype code

The release builds only the active app routes and adaptive learning components. Unmounted prototype components remain for reference; `frontend/package.prototype.json` records their previous dependency manifest. Avatar, WhatsApp, and general whiteboard routes are disabled.

## Qwen for local reasoning

Set `LLM_PROVIDER=qwen`, `LLM_MODEL` to your enabled Qwen model, `LLM_BASE_URL` to your Alibaba compatible endpoint, and `LLM_API_KEY` in private `.env`. The adapter disables thinking, requests JSON for structured tasks, validates the returned model identity, and retains the generation allowance. Restart the API and worker after changing provider settings. Use `TTS_PROVIDER=disabled` without AWS speech access; text lessons and original recording playback still work.

### Kimi through Alibaba Model Studio

Use `LLM_PROVIDER=modelstudio`, `LLM_MODEL=kimi-k3`, and your workspace-specific Singapore compatible endpoint in `LLM_BASE_URL`, retaining `LLM_API_KEY`. Kimi requests use non-thinking structured output and temperature 0. Configure input/output reservation rates for the selected model; the supplied Kimi rates are $3/$15 per million tokens. Local reservations conservatively account for paid-equivalent usage even with free quota. They do not control Alibaba’s Free Quota Only setting or guarantee remaining provider quota. Restart both API and worker to load changes.

## Transcript checkpoints

Successful speech-to-text output is committed to the private `adaptive_transcript_cache` database table before lesson generation starts. Retries reuse its timestamped segments without downloading media or running Whisper again. Changing the reasoning model does not invalidate transcription; changing the recording object, Whisper model, or transcription settings does. Empty, incomplete or invalid transcripts are not reused. Database backups include these checkpoints. A worker that was already running before this change must finish and be restarted to use it; earlier unsaved transcripts cannot be recovered from memory after a failed process.

## Content suitability and planner repair

Coverage analysis looks for actual explanations, examples or instructional steps across the recording. Short informal tutorials qualify; incidental technical mentions and task notes alone may not. When the analysis cannot identify enough educational content, the recording reaches `insufficient_content`: the original media and saved transcript remain available, and no lesson or prerequisites are fabricated. This is a model assessment, not proof that the material has no educational value.

Before evidence review, generated plans are checked against the exact eligible prerequisite IDs, transcript segment IDs, unique checkpoints and quiz/phase associations. Invalid plans get one correction with explicit validation feedback and the valid IDs. A second invalid result fails visibly. References are never silently dropped or replaced, and corrected plans still undergo evidence review. A lesson can have no prerequisite gaps. Restart the worker after code changes; an already-running Python process retains its imported compiler.

### Retry accounting and upload ceiling

Compatible providers (including Kimi) reserve one attempt immediately before each request. SDK retries are disabled; the application performs up to `LLM_MAX_RETRIES` additional attempts, reserving each separately. Successful responses reconcile the estimate using reported prompt/completion tokens and configured rates, even if subsequent lesson validation fails. Missing usage or ambiguous failures retain their estimates. Cache hits do not reserve new inference usage. Historical reservations are unchanged. These are local cost estimates, not a provider billing statement; configured prices and external provider limits still apply.

The Next.js and Caddy upload ceilings are 262144000 bytes (250 MiB), matching the current local API allowance. The API may enforce a smaller configured limit. Rebuild/restart the frontend and reload Caddy after changing proxy limits; restart the API and processing worker to load accounting changes.
