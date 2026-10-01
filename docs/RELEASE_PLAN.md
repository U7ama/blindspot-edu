# Release and judging operations

Current submission status and publication tasks are maintained in [the submission guide](SUBMISSION_DRAFT.md). Permission and student feedback are recorded there and in its supporting records. This checklist describes checks to run, not results already established.

## Before publishing or replacing a release

- Confirm eligibility, originality, and the live URL in the Builder Center submission.
- Run backend tests, frontend typecheck, and frontend build after relevant code changes.
- Test the public sample while logged out: source playback, incorrect diagnostic, supplementary teaching, different reassessment, return to the lesson, backward navigation, and refresh.
- Check two learners cannot access each other's private recordings or progress.
- Verify the submitted demo asset downloads unchanged, the judge invitation works on production, and claimed cache reuse actually matches the saved recording.
- Review the selected evidence and active inference provider. Qwen is active; Bedrock is inactive and its requested access was not approved at this time.
- Back up the database before migrations or deployment; retain rollback artifacts. Record restore-test results separately.

## Through judging

Keep the public application reachable and review failed jobs, disk use, provider allowances, and AWS charges daily. Preserve the working sample during provider failures or when dynamic allowances are exhausted. Budget alerts and local generation estimates are not spending caps. The builder's $50 credits expire October 31.

Benchmark the proposed upload workload on the actual host before increasing duration or concurrency. Measure memory, CPU credits, processing time, and sample responsiveness with concurrent learners; successful health responses alone do not establish capacity. Do not silently increase infrastructure cost.

Retain accurate content labels and assessment status: “Passed this check” reports the individual check, not mastery. Record broader learning evaluation as future work unless actual comparable measurements are available.
