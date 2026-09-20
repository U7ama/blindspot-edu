# Deployment runbook

This configuration is not evidence of a live deployment. Do not provision until remaining credit/expiry/service eligibility, regional pricing and the hostname are verified. Keep a receipt of those checks in private operator records.

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
cp -a public .next/standalone/public
mkdir -p .next/standalone/.next
cp -a .next/static .next/standalone/.next/static
```

Build frontend assets locally or during a maintenance interval if the small host cannot build while serving the app. The checked systemd files expect Node at `/usr/bin/node`; verify this path on the host.

Create `/etc/blindspot.env`, readable only by root and the blindspot group, using `.env.example` and these deployment values:

```dotenv
APP_ENV=production
APP_ORIGIN=https://YOUR_HOSTNAME
DATA_DIR=/var/lib/blindspot/private
DATABASE_URL=sqlite:////var/lib/blindspot/blindspot.db
AWS_REGION=us-east-1
STORAGE_BACKEND=s3
S3_BUCKET_NAME=STACK_MEDIA_BUCKET
LLM_PROVIDER=bedrock
BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0
TTS_PROVIDER=polly
PILOT_INVITE_CODE=GENERATE_A_PRIVATE_RANDOM_CODE
HF_HOME=/var/lib/blindspot/models
AI_TOTAL_ALLOWANCE_USD=6
AI_LEARNER_ALLOWANCE_USD=1
```

Copy `deploy/systemd/*` to `/etc/systemd/system`. Configure Caddy from `deploy/Caddyfile`, replacing `{$APP_HOSTNAME}` with the approved hostname (or supply that variable to Caddy's service). Never copy the pilot invitation code into frontend environment variables.

Initialize the database and prefetch Whisper as the application user with the service environment loaded. Then enable/start `blindspot-api`, `blindspot-worker`, `blindspot-web`, `blindspot-backup.timer` and Caddy. Configure journald to cap retention at seven days and disk usage at 100 MB. The API uses a single worker because the deployment's durable state resides in SQLite; do not scale this template horizontally without redesigning coordination.

## Public sample and launch

Use `python -m scripts.admin import-recording` on a permission-approved recording; run the worker. Inspect `review` output, verify all evidence and answers, and use `publish-sample --reviewed --permission-note ...` only after actual review and public-playback permission. Pre-generate the sample's phase/remediation narration using the app so the main journey remains available without fresh speech calls.

Run all release checks in `docs/RELEASE_PLAN.md`. Test TLS, signed media URLs, five simultaneous learners, an upload during interaction, restart recovery and backup restoration on the host. Use `python -m scripts.benchmark permitted.wav --base-url http://127.0.0.1:8000` to collect transcription/health data, alongside full browser journeys. Monitor CPUCreditBalance and peak memory; Standard CPU mode may throttle sustained transcription.

## Rollback and daily operation

Back up the database before replacing a release. Retain the prior application directory and environment configuration. Do not restore an old database over newly collected student records just to revert code. New tables are additive; old tables are preserved. On provider errors preserve the saved lesson; any change to the advertised AWS provider path requires an explicit updated deployment record.

Review health, failed jobs, conservative inference reservations, disk space and account charges daily through judging. Do not interpret successful health checks as proof that tutoring works. Keep logs free of raw transcripts and student answers. Release budget alarms and public IP do not stop costs automatically. Reassess hosting after Oct 23; do not automatically shut down before judging completes.
