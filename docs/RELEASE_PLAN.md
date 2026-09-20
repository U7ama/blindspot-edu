# Release gates and operator tasks

The implementation does not establish recording permission, pilot results, deployment availability or hackathon eligibility. These require external evidence.

## Before publishing

- Select the brother's course and recording language.
- Obtain permission to process recordings and separate permission for public playback.
- Review the full rules, residence/age/employment eligibility and original-publication requirements.
- Confirm remaining AWS credit, expiry and covered services in Billing.
- Confirm hostname ownership and DNS access.
- Capture redacted proof of the coding agent's AWS-console connection. CLI identity alone is not proof of the required console connection.
- Run local tests, frontend build, AWS adapter smoke checks and a human review of every demo citation/question.
- Deploy early and benchmark the host before opening participant uploads.

## Delivery schedule

| Dates | Exit condition |
|---|---|
| Sept 19–20 | Course/permissions, 5–8 participants, credits and AWS access verified; three reviewed fixtures |
| Sept 21–23 | Integrity/security fixes and initial public deployment; first complete prerequisite journey |
| Sept 24–26 | AWS adapter validation, whole-lecture verification, resume/navigation and reassessment |
| Sept 27–29 | Student pilot, second lecture, actual latency and cost checks |
| Sept 30 | Feature freeze, ten clean demo runs and recorded demonstration |
| Oct 1 | Submit public URL, exactly #social-good and #community, evidence and project write-up |
| Oct 2–23 | Daily availability/error/spend checks; essential fixes only |

## Release checks

Run `python -m pytest`, `npm run typecheck` and `npm run build`. Then test real Bedrock/Polly calls, permitted recording upload, source playback, an incorrect diagnostic, remediation, a different reassessment, backward navigation and refresh. Repeat ten times. Simulate two independent browsers and verify private recording isolation.

Run the transcription benchmark on the actual host with five sample learners. Record peak memory, worker recovery and CPUCreditBalance; health checks are insufficient to establish full journey capacity. Rehearse database restoration using scripts/backup.py. Disable uploads if the host cannot maintain interactive responsiveness; do not silently increase spend.

Budget target: $40 infrastructure + $6 variable services + $4 reserve through Oct 23, subject to verified regional costs and credit terms. Include IPv4, disk, backups, transfer, hostname and existing consumption. Budget alerts are not hard caps. The application's inference ledger reserves conservatively before provider calls and persists across restarts. Do not lower configured pricing bounds below the selected provider's rates. Reserves do not include hosting charges.

The current release supports English narration. Other lecture languages require transcription and content evaluation before making support claims. No learner state is called mastery; `passed_check` only means the associated question was answered correctly.
