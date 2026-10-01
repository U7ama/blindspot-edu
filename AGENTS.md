# AI Agent Instructions for Blindspot Edu

This is the project's agent and operator guide. Frontend changes also follow `frontend/AGENTS.md` and the bundled Next.js documentation.

## Blindspot operational scope

Blindspot Edu is a live AWS application. For this project's agent-initiated AWS resource work, use the configured AWS MCP tools and relevant installed AWS skills. Do not silently switch to AWS CLI or local `boto3` scripts for resource operations. If MCP is unavailable, report the blocker. This policy does not prohibit local builds/tests, the application's runtime AWS SDK calls, or the CLI-based login and toolkit setup steps in AWS's official setup guide. Presigned URLs and secret values must not appear in logs or hackathon evidence.

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance

- Where these AWS rules conflict with the project's own instructions, the
  project's instructions take precedence.
- For agent-initiated AWS resource operations (S3, EC2, SSM, CloudFormation,
  Polly, Bedrock, etc.), use the AWS MCP Server (`aws-mcp` tools, e.g.
  `aws___run_script` with `call_boto3`, `aws___get_presigned_url`).
- Do not run `aws` CLI commands or ad-hoc local Python `boto3` scripts to
  manage Blindspot AWS resources. AWS's official CLI-based login and Agent
  Toolkit setup/verification steps are the exception.
- For local file uploads to S3: Obtain a presigned upload URL via MCP
  (`aws___get_presigned_url`) and upload via curl, or use MCP S3 tools.
- MANDATORY: Before starting any AWS task, identify and load the relevant AWS skill
  (e.g., `aws-sdk-python-usage`, `aws-deployment`, `aws-serverless`, `aws-security`)
  and strictly follow its guidance.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
- If that skill or `asm-exec` is unavailable in the active environment, do not fetch a secret value or invent a replacement flow; report the missing prerequisite.
<!-- END AWS Agent Toolkit rules -->

## Working application and checks

- Backend: `backend/main.py`, adaptive API in `backend/app/adaptive/api.py`. Application routes use `/api/v1`; health is `/health` (outside the API prefix). Do not reintroduce `/api/v2` or legacy whiteboard/WhatsApp routes.
- Worker: `backend/app/adaptive/worker.py`. SQLite uses WAL mode; transcript and structured reasoning caches persist in the database. Preserve recordings, learner progress, caches and existing legacy tables.
- Frontend: Next.js App Router and `frontend/src/components/adaptive/`. Shared server-compatible design tokens live in `frontend/src/lib/ui-tokens.ts`; do not export them from a client component. Preserve the current themes, animations and learning flow.
- Keep `.env`, credentials, presigned URLs and private submission records out of Git and logs. No secret values are needed to remove an unused environment entry.
- Do not deploy or push without task authorization. Back up before destructive source cleanup or database changes.

### Local commands

Run from the repository root in separate terminals:

```bash
./.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
./.venv/bin/python -u -m backend.app.adaptive.worker
```

Run from `frontend/`:

```bash
npm run build
npm start
```

For frontend development use `npm run dev`. Production startup uses the standalone server; the build prepares its public assets. Verify the API with `curl --fail http://127.0.0.1:8000/health`.

Checks from the repository root:

```bash
./.venv/bin/python -m pytest tests/
```

Checks from `frontend/`:

```bash
npm test
npm run typecheck
npm run build
```

Use the existing deployment scripts and `deploy/README.md` for host setup, backups and recovery. When restarting a local service, identify and stop only that service's process; do not use broad process-kill patterns.
