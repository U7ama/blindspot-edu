# Blindspot Edu — learning the step your lecture assumed

Category: #social-good (Education). Lane: #community.

## Problem and audience

A recording preserves what was said, but a student can remain stuck on a prerequisite the instructor assumed. The first intended users are the builder's brother and university classmates. Add their actual, permission-approved observations here after the pilot; do not invent quotes or impact claims.

## What the app does

Blindspot transcribes a recording, checks possible omissions against coverage across the lecture, and offers optional prerequisite checks before dependent phases. A wrong answer leads to an explanation, worked example and different application question. It saves the learner's place and keeps supporting excerpts separate from supplementary teaching.

## Three-minute demonstration

- 0:00–0:25: Show the student problem and open a permission-approved sample.
- 0:25–0:55: Show an assumed prerequisite and inspect its real source excerpt.
- 0:55–1:25: Answer a diagnostic incorrectly and open the short remedial lesson.
- 1:25–1:55: Apply the idea to a different question and show “Passed this check.”
- 1:55–2:20: Resume the original phase, inspect the evidence, and demonstrate refresh/resume.
- 2:20–2:45: Explain actual AWS architecture and the coding agent's role.
- 2:45–3:00: Present measured pilot results and limitations.

## Architecture and implementation

Current production architecture: AWS EC2 runs Next.js, FastAPI, one durable processing worker and local CPU Whisper; private S3 stores media and Amazon Polly generates narration. Pedagogical reasoning currently uses Alibaba Cloud Model Studio (Qwen 3.7 Flash) through an external API. An Amazon Bedrock adapter is implemented but is not active. A Bedrock switch depends on usable account access and passing the same lesson-quality, evidence, latency and cost checks. The database tracks evidence IDs, learner progress, idempotent grading and generation allowances. Prototype WhatsApp and general-purpose whiteboard APIs are not part of the public release.

## Evidence to attach

- [ ] Live AWS URL and logged-out sample instructions
- [ ] Redacted coding-agent AWS-console connection proof
- [ ] Verified deployed architecture and provider configuration
- [ ] Development account of specific agent-assisted changes and tests
- [ ] Actual pilot methods, count, paired outcomes and limitations
- [ ] Public recording permission and approved quotations
- [ ] Eligibility and originality confirmation

Known limits: small pilot, English demo narration, one processing worker, anonymous accounts bound to browser cookies, AI inference can be wrong, and a passed check is not a mastery claim. Saved sample lessons are cached and must be described accurately.
