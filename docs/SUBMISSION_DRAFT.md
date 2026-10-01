# Blindspot Edu — Hackathon submission guide

**Updated:** September 30, 2026

This is the current submission guide. Use its body in Builder Center and attach the selected evidence below. Technical runbooks and dated development records are supporting material. This file does not itself publish or submit a project.

**Builder Center title:** Blindspot Edu — Learn the steps your lecture assumes
**Description:** Turn a lecture recording into an evidence-linked learning path. Blindspot checks possible missing prerequisites, teaches the step a learner needs, and returns them to the source.
**Category and lane:** #social-good (Education), #community
**Live app:** https://blindspot-edu.online
**Repository:** https://github.com/U7ama/blindspot-edu — currently private; the builder plans to make this same repository public at submission. Add its link to Builder Center after confirming logged-out access. The unchanged Lecture 09 video is included in this repository at `assets/CS501_Lecture09_Falcon_A_and_EAGLE.mp4`.

## Builder Center body — first-person draft

My brother studies Software Engineering. He often asks me about concepts he did not fully understand in class. Sometimes the explanation was brief; sometimes the lecturer assumed students already knew the basics. Later he asks me to explain the missing step. I heard similar problems from other students. A recording preserves the lecture, but replaying it does not always reveal *which prerequisite* is causing the confusion. That experience led me to build Blindspot Edu.

Blindspot takes a permitted audio or video lecture and turns it into a guided lesson connected to the original recording. It identifies what the lecturer explained, checks possible missing prerequisites against the entire transcript, and labels a possible gap as an inference rather than claiming the teacher definitely skipped it. The learner answers a diagnostic question. If they need help, Blindspot gives a focused explanation and worked example, asks a different follow-up question, and returns them to the lesson. They can inspect the supporting excerpt and timestamp at any point. Progress records the checks a learner has passed; a correct answer alone does not establish broad mastery.

I started with file and supported-link uploads. When I let students try the app, they asked for a way to capture a lecture while they were in class. I added browser-based audio and video recording, with a local preview before upload. That request made the product more useful in the setting where the problem actually happens. Students also asked for completion notifications because transcription and AI lesson preparation take time. I added optional email, browser, spoken, and in-app alerts so they can leave the processing screen and know when their lesson is ready. Three students and one software engineer later shared feedback: Hammad described catching up after missing or arriving late to class; Hashim used a class recording to prepare afterward; Farhan valued explanations generated for the actual video; and Khawar said it helped him learn new skills. These are their reported experiences, paraphrased with permission, not measured gains in grades or study time.

**How I went from idea to a shipped app.** I used both Codex and Antigravity while building Blindspot, alternating planning and implementation with review. I followed the AWS Agent Toolkit setup prompt and connected both agents to AWS through MCP. The AWS Skills guided service-specific work, and actual MCP calls let the agents inspect or operate the running resources. I saved the successful tool calls and matching AWS console screens as connection evidence. During development, I noticed one agent sometimes drifted back to generic CLI commands after several local tasks. I added project workflow rules to make the AWS MCP path explicit for agent-managed resource work, then checked the resulting tool calls. That was a practical lesson in keeping an agent-assisted deployment auditable, not a claim that the hackathon requires every AWS call to use MCP.

The first version could transcribe a lecture and outline a lesson. Real recordings exposed harder problems. A large video upload reset the Next.js proxy until I fixed the request path. A generated plan once referenced a prerequisite ID that did not exist, so validation now prevents that lesson from being published as verified. I also changed the learning flow so detecting a possible gap actually changes what the student is taught. Lecture excerpts and AI-added explanations have distinct labels, and missing evidence is not replaced with a made-up timestamp. Each fix came from testing the working app, reviewing the result, and redeploying.

**What is running on AWS.** CloudFormation defines the infrastructure. An EC2 t3.medium runs the Next.js web app, FastAPI API, CPU Whisper transcription, and a separate processing worker. Private recordings, generated audio, and database backups use Amazon S3. Systems Manager supports remote operations; Amazon Polly provides optional narration; Amazon SES sends a one-time email when a learner requests a completion alert. The app is public at **https://blindspot-edu.online**, and a permission-approved sample can be tried without creating an account.

I planned to use Amazon Bedrock for lesson reasoning. On September 28, AWS Support completed its review and could not approve Amazon Nova Lite and Titan Text Embeddings V2 access for my account in us-east-1 at this time. Support explained that access depends on factors including payment history and account usage patterns. I had a newly created account; the response did not identify account age alone as the reason or promise an approval date. The live app therefore uses **Qwen 3.7 Flash through an external Model Studio API** for concept extraction and lesson generation. A Bedrock adapter exists, but Bedrock is **not** serving this demonstration. I will switch only after access is available and the model passes the same lesson-quality, evidence, latency, and cost checks. AWS remains the live hosting, storage, narration, email, and operations platform for this entry.

**Try the learning journey.** Open the public Lecture 19 computer architecture sample in the app. Follow the guided phases, inspect an inferred prerequisite beside its lecture evidence, choose an incorrect diagnostic answer, read the supplementary explanation and worked example, and answer the different follow-up question. The lesson resumes at the relevant phase. You can also type a question in your own words and use Listen for narration. For an already processed recording, the processing screen explicitly reviews saved steps; it does not imply a fresh 50-minute transcription finished in seconds.

Blindspot began with my brother asking for help with one unclear concept. It is now a working AWS app shaped by students using recordings in class. The next step is broader course testing and better evaluation of whether the explanations improve learning over time. The current evidence is a usable public app, an inspectable source-linked learning flow, authentic coding-agent AWS calls, and feedback from four early users.

## What judges can try

1. Open [the live lecture library](https://blindspot-edu.online/workspace) without signing in.
2. Choose the public Lecture 19 computer architecture sample.
3. Open phase two and its “Behavioral vs structural RTL descriptions” prerequisite check.
4. Inspect the lecture evidence, answer the diagnostic incorrectly, and read the supplementary explanation and worked example.
5. Answer the different follow-up question and see the lesson resume with “Passed this check.”
6. Explore the question input, transcript, evidence notebook, concept map, and optional narration.

Fresh uploads require an invitation. Judges can complete the public sample without one. For the optional upload demonstration, use [the supplied Lecture 09 video](../assets/CS501_Lecture09_Falcon_A_and_EAGLE.mp4) and paste [the local judge upload instructions](hackathon/judge-upload-instructions.md) into Builder Center: that Git-ignored block contains the actual invitation code and explains the same-repository lecture download. The public repository version of this guide intentionally omits the code.

Before submission, commit and push the included asset, make the existing repository public, verify the [Lecture 09 download](https://github.com/U7ama/blindspot-edu/raw/refs/heads/main/assets/CS501_Lecture09_Falcon_A_and_EAGLE.mp4), and check that the code unlocks uploads in a fresh browser on the live app. The download URL uses the requested GitHub `main` branch; verify that branch contains the asset before publication. Use the unchanged original recording for saved-lesson reuse; download and upload still depend on network speed.

## Architecture and active providers

| Component | Actual role |
|---|---|
| Next.js + FastAPI | Web interface and authorized API on EC2 |
| Whisper, CPU | Speech-to-text for uploaded audio/video |
| SQLite, WAL mode | Lessons, learner progress, jobs, transcript/model caches, and usage accounting |
| Qwen 3.7 Flash, external Model Studio API | Active concept extraction, prerequisite analysis, and lesson reasoning |
| CloudFormation | Infrastructure as code for the AWS deployment |
| EC2 t3.medium, us-east-1 | Web application, API, and separate processing worker |
| Private S3 | Recordings, generated audio, and database backups |
| Systems Manager | Agent-managed remote deployment and operations |
| Polly | Optional in-app neural narration; Stephen generative voice for the submitted video |
| SES | Requested one-time lesson-completion email |
| Bedrock | Implemented adapter, inactive; access request was not approved at this time |

See [the technical architecture](ARCHITECTURE.md) and [recorded deployment details](hackathon/18-deployed-architecture.md). Resource statuses in screenshots are dated observations, not a fresh uptime check.

## Connection and deployment proof to attach

Include successful agent tool calls with the returned AWS result, then matching AWS console evidence. Skills and configuration screenshots explain setup; the actual MCP calls demonstrate account connectivity.

| Evidence | File |
|---|---|
| Codex AWS MCP execution | [Codex tool call](hackathon/deployment-evidence/03-codex-aws-mcp.png) |
| Antigravity AWS MCP execution | [Antigravity tool call](hackathon/deployment-evidence/01-antigravity-aws-mcp.png) |
| Corresponding AWS action | [Systems Manager console history](hackathon/deployment-evidence/07-aws-console-ssm-history.png) |
| Infrastructure stack | [CloudFormation console](hackathon/deployment-evidence/12-aws-cloudformation.png) |
| AWS compute and media | [EC2 console](hackathon/deployment-evidence/13-aws-ec2-console.png), [S3 console](hackathon/deployment-evidence/14-aws-s3-console.png) |
| Bedrock decision, September 28 | [Support response](hackathon/deployment-evidence/18-bedrock-access-decision-20260928.png) |

The [full evidence catalog](hackathon/17-agent-aws-evidence.md) retains additional Skills, service, and structured-result records. Attach images directly to Builder Center; local relative links are not accessible to judges there. Never attach API/AWS credentials, cookies, or signed URLs. The invitation code is deliberately shared in the Builder Center judge instructions; keep it out of screenshots and public Git history.

## Student feedback and permissions

Three university students and one software engineer tested the app. These are paraphrases of their feedback, shared with permission:

| Person | Role | Feedback |
|---|---|---|
| M Hammad | Software Engineering student | Helped him catch up on concepts after missing class or arriving late, without rewatching a long lecture. |
| Hashim | Software Engineering student | Recording a class lecture helped him prepare afterward and understand the material. |
| Farhan | Computer Science student | Explanations generated for his actual lecture helped clarify concepts. |
| Khawar | Software engineer | Helped him learn new skills. |

All four reported that it helped their learning. These reports describe their experiences; no score, retention, or time-saving improvement was measured. Students requested in-class recording and completion notifications, which shaped the implemented product.

[Permission and attribution record](hackathon/11-lecture-permission.md) · [Feedback record](hackathon/12-pilot-results.md). The builder confirmed permission for all photos and videos included in the demonstration.

## Final video

The approved version is **5:18**, with synchronized Amazon Polly Stephen generative narration. It covers the problem, complete learning journey, agent toolkit usage, matching AWS deployment evidence, and classroom feedback.

- Local video: `/home/usama/Videos/hackathon_videos/blindspot-demo-polly-synced.mp4`
- Script: [final synchronized narration](hackathon/26-story-video-voiceover.md)
- Public video URL: **add after upload and logged-out playback verification**.

The spoken statement that Bedrock was unavailable remains accurate. The written submission records the later completed support review. Keep the approved video unchanged unless its hosted playback reveals a problem.

## Final publication checklist

- [x] App deployed on AWS; deployment and connection evidence collected.
- [x] Both agents' actual MCP execution evidence collected.
- [x] Actual services and active Qwen provider documented.
- [x] Student feedback and public-use permissions recorded.
- [x] Final narrated video reviewed and approved by the builder.
- [ ] Host the approved video and add its public link above and in Builder Center.
- [ ] Commit/push the included Lecture 09 asset, make the existing repository public at submission, and verify the MP4 download while logged out.
- [ ] Paste the actual invitation code from the Git-ignored judge instructions into Builder Center and test it against the live upload flow.
- [ ] Confirm eligibility, original/unpublished-before-entry status, and hackathon registration.
- [ ] Publish the project under the hackathon with the live endpoint, attached evidence, and exactly `#social-good` and `#community`.
- [ ] Confirm the project appears in “Your project” as published, not only saved as a draft.
- [ ] Check the submitted project, video, and complete public sample journey while logged out.
- [ ] Keep the application reachable during judging and monitor remaining costs; the builder's credits expire October 31.

Submission deadline: **October 2, 2026, 11:59 PM PDT**, equivalent to **October 3, 11:59 AM Pakistan time**. Target October 1. [Official hackathon rules](https://builder.aws.com/build/hackathons/e83e84e5-4f4c-383b-bbe9-4a15ac195d55/zero-to-shipped?tab=rules).

## Reading map

The [main README](../README.md) is the public entry point for judges: it includes the story, demo instructions, AWS and Agent Toolkit usage, active provider, student feedback, and verification. This draft supplies the Builder Center body and publication checklist; its private attachments are uploaded separately to Builder Center. Developers can use the [deployment runbook](../deploy/README.md), [architecture](ARCHITECTURE.md), and [release verification](hackathon/14-release-verification.md). Retained deployment, compiler-repair, and YouTube-import records describe dated observations; they do not supersede the active configuration. Obsolete feature plans and superseded video scripts have been removed from this documentation tree.
