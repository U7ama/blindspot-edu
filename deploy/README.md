# Deployment runbook

> **AI-agent operations:** The CLI examples below document manual setup. For Blindspot Edu agent-managed AWS resource operations, use the configured AWS MCP tools as specified in `AGENTS.md`. The official AWS login and Agent Toolkit setup commands remain CLI-based.


The CloudFormation template alone is not evidence of a live deployment; the current production deployment is documented in `docs/hackathon/18-deployed-architecture.md`. Before changing or adding infrastructure, recheck remaining credit, expiry, service eligibility, regional pricing, and hostname cost. Keep receipts in private operator records.

## Preflight and infrastructure

Use Python 3.12, AWS CLI v2 and a current cfn-lint. From the project root:

```bash
python -m scripts.aws_preflight
cfn-lint deploy/stack.yaml
aws cloudformation validate-template --template-body file://deploy/stack.yaml
```

Run cfn-guard with your account's baseline rules and CloudFormation account-aware validation before deploying. Capture results separately: local schema validation is not a security or deployment-readiness certificate. Confirm CloudTrail coverage for deployment actions. Check the AMI SSM parameter in the selected region; the template targets x86 Ubuntu 24.04.

Once cost and prerequisite gates pass:

```bash
aws cloudformation deploy --template-file deploy/stack.yaml --stack-name blindspot-pilot --capabilities CAPABILITY_IAM --parameter-overrides BudgetEmail=YOUR_APPROVED_ALERT_EMAIL
aws cloudformation describe-stacks --stack-name blindspot-pilot --query 'Stacks[0].Outputs'
```

The template intentionally exposes 80/443 for the requested public app; no SSH, database, API or Next.js port is exposed. Port 80 is only for certificate issuance and redirect. Stateful resources are retained: deleting the stack does not remove them or stop their costs. Budget alerts are monthly; track combined September/October cost against the $50 project allowance separately.

Point the approved hostname at the output IP. Use Systems Manager to administer the host. Do not embed AWS keys; the instance role grants scoped S3/Bedrock access and Polly synthesis.

## Application installation

Copy the reviewed release to `/opt/blindspot` using your authenticated deployment channel. Create an unprivileged `blindspot` user and `/var/lib/blindspot`, owned by that user. Install Python 3.12, FFmpeg, Node 22 or later, and Caddy from their documented official distribution channels.

```bash
cd /opt/blindspot
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd frontend
npm ci
npm run build
# npm run build already copies standalone assets through postbuild.
```

Build frontend assets locally or during a maintenance interval if the small host cannot build while serving the app. The checked systemd files expect Node at `/usr/bin/node`; verify this path on the host.

Create `/etc/blindspot.env`, readable only by root and the blindspot group, using `.env.example` and these deployment values:

```dotenv
APP_ENV=production
APP_ORIGIN=https://blindspot-edu.online
PUBLIC_APP_URL=https://blindspot-edu.online
DATA_DIR=/var/lib/blindspot/private
DATABASE_URL=sqlite:////var/lib/blindspot/blindspot.db
AWS_REGION=us-east-1
STORAGE_BACKEND=s3
S3_BUCKET_NAME=STACK_MEDIA_BUCKET
LLM_PROVIDER=modelstudio
LLM_MODEL=qwen3.7-flash
LLM_BASE_URL=YOUR_VALIDATED_COMPATIBLE_ENDPOINT
LLM_API_KEY=SET_PRIVATELY
LLM_TIMEOUT=300
LLM_MAX_RETRIES=3
TTS_PROVIDER=polly
PILOT_INVITE_CODE=GENERATE_A_PRIVATE_RANDOM_CODE
HF_HOME=/var/lib/blindspot/models
AI_TOTAL_ALLOWANCE_USD=500
AI_LEARNER_ALLOWANCE_USD=100
AI_DAILY_CALL_LIMIT=2000
LLM_INPUT_USD_PER_MILLION=0.10
LLM_OUTPUT_USD_PER_MILLION=0.50
NOTIFICATION_EMAIL_PROVIDER=ses
SES_REGION=us-east-1
SES_FROM_EMAIL=notifications@blindspot-edu.online
SES_REPLY_TO_EMAIL=usamaaslam8726@gmail.com
```

The allowance and reservation-rate values above match the working development configuration so older $6/$1 caps do not unexpectedly interrupt long lesson generation. They are cumulative local estimates, not a price quote or AWS credit balance. The $500/$100 allowances and 2,000 calls/day exceed the $50 AWS budget and do not cap AWS hosting or guarantee provider quota. Verify provider rates, then set and record production-specific limits explicitly; do not copy development settings wholesale.

Copy `deploy/systemd/*` to `/etc/systemd/system`. Copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`. It defaults to `blindspot-edu.online`; an optional `APP_HOSTNAME` override must be supplied to the Caddy service itself, not just the app environment. Never copy the pilot invitation code into frontend environment variables.

Initialize the database and prefetch Whisper as the application user with the service environment loaded. Then enable/start `blindspot-api`, `blindspot-worker`, `blindspot-web`, `blindspot-backup.timer` and Caddy. Configure journald to cap retention at seven days and disk usage at 100 MB. The API uses a single worker because the deployment's durable state resides in SQLite; do not scale this template horizontally without redesigning coordination.

## Public sample and launch

Use `python -m scripts.admin import-recording` on a permission-approved recording; run the worker. Inspect `review` output, verify all evidence and answers, and use `publish-sample --reviewed --permission-note ...` only after actual review and public-playback permission. Pre-generate the sample's phase/remediation narration using the app so the main journey remains available without fresh speech calls.

Run all release checks in `docs/RELEASE_PLAN.md`. Test TLS, signed media URLs, five simultaneous learners, an upload during interaction, restart recovery and backup restoration on the host. Use `python -m scripts.benchmark permitted.wav --base-url http://127.0.0.1:8000` to collect transcription/health data, alongside full browser journeys. Monitor CPUCreditBalance and peak memory; Standard CPU mode may throttle sustained transcription.

## Rollback and daily operation

Back up the database before replacing a release. Retain the prior application directory and environment configuration. Do not restore an old database over newly collected student records just to revert code. New tables are additive; old tables are preserved. On provider errors preserve the saved lesson; any change to the advertised AWS provider path requires an explicit updated deployment record.

Review health, failed jobs, conservative inference reservations, disk space and account charges daily through judging. Do not interpret successful health checks as proof that tutoring works. Keep logs free of raw transcripts and student answers. Release budget alarms and public IP do not stop costs automatically. Reassess hosting after Oct 23; do not automatically shut down before judging completes.

## Cloudflare domain: blindspot-edu.online

Recommended initial path: Cloudflare **DNS-only** A record → stack Elastic IP → Caddy HTTPS → Next.js / FastAPI. No Cloudflare Worker, Pages deployment, Route 53 hosted zone or load balancer is required. Wrangler login alone neither changes DNS nor proves DNS-edit permission.

1. Review the existing apex records before changing them. Record prior values for rollback; preserve MX/TXT email records. Do not create a duplicate/conflicting A, AAAA or CNAME record.
2. After the AWS host is provisioned and the application installed, set the apex A record (`@`) to stack output `PublicIp`, DNS-only (grey cloud). Do not retain an apex AAAA pointing elsewhere. This template does not allocate IPv6.
3. Keep public ports 80/443 reachable for certificate issuance and HTTPS. API 8000 and frontend 3000 stay on loopback. Use SSM for administration.
4. Validate and reload Caddy: `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`, then `sudo systemctl reload caddy`. Caddy obtains a publicly trusted certificate. Check DNS/CAA restrictions if issuance fails.
5. Use exactly `https://blindspot-edu.online` for APP_ORIGIN and PUBLIC_APP_URL. The optional www hostname is not configured; do not advertise it without adding DNS, TLS and an apex redirect.
6. Verify `curl --fail https://blindspot-edu.online/health`, then use a logged-out browser to test the sample, cookie persistence, media seeking, an invited upload and completion. Health alone does not validate the learning flow.
7. Capture AWS resource details, the matching DNS record and public URL for the evidence package. Never include credentials or signed media links.

### Optional Cloudflare proxy

Start DNS-only to preserve large uploads and simplify TLS troubleshooting. Cloudflare Free/Pro proxy limits are documented as 100 MB per request; the app's Caddy/Next upper ceiling is 250 MiB and the API's effective MAX_UPLOAD_BYTES may differ. The initial deployment should keep MAX_UPLOAD_BYTES=104857600 unless a different limit is explicitly selected and benchmarked. DNS-only avoids imposing a second edge upload limit.

If orange-cloud proxying is later enabled:
- Use **Full (strict)** with a valid origin certificate, never Flexible.
- Reconcile the actual zone request limit with MAX_UPLOAD_BYTES and verify an upload near that boundary. For larger uploads, retain DNS-only or implement separately authorized direct-to-S3 uploads; raising Caddy's limit cannot raise Cloudflare's limit.
- Bypass edge caching for `/api/*`, `/workspace*` and `/settings*`; never apply Cache Everything to personalized routes. API responses receive `private, no-store` from Caddy.
- Verify certificate renewal and check that redirects/challenges do not block the API or certificate challenge path.
- Do not trust client-supplied CF-Connecting-IP headers without a deliberately configured trusted-proxy boundary.

Official references: [Cloudflare upload limits](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/), [Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/), [Caddy environment defaults](https://caddyserver.com/docs/caddyfile/concepts#environment-variables).

## Provider and remaining deployment gates

The environment above keeps the active Qwen provider and AWS Polly. Bedrock is inactive: AWS Support could not approve the requested Nova Lite/Titan access at this time after its September 28 review. Revisit a migration only after usable access and quality/cost validation. To retain the working Model Studio provider, configure LLM_PROVIDER, LLM_MODEL, LLM_BASE_URL and LLM_API_KEY privately from the validated current setup; do not upload the development .env wholesale or expose keys to the frontend. Validate the chosen provider before switching.

Completion email remains disabled in the local example; the deployed SES identity and production-access evidence are recorded in [the deployment architecture](../docs/hackathon/18-deployed-architecture.md). The CloudFormation template includes ses:SendEmail permission with a FromAddress condition for notifications@${AppHostname}. Before enabling SES, verify the domain/sender in the intended region, confirm that the deployed role has this policy, and test recipient restrictions and delivery. Do not claim email is operational before this is complete.

The template provisions infrastructure only: installation, data/sample migration, model download, SSM connectivity, domain cutover, backup restore, actual regional cost/credit verification and the 4 GB host load test remain launch gates. Retained resources continue costing money after stack deletion. These instructions describe setup and checks; they do not report a new deployment. Use the dated deployment records and current health checks to distinguish completed work from an installation checklist.
