# Blindspot Edu
### MVP Blueprint & Team Execution Plan
**Prepared for:** AWS Zero to Shipped Hackathon (2026) — AWS Builder Center
**Team size:** 4 — Frontend, Backend, AI/Planning, AI Orchestrator
**Last updated:** September 2026

> The name doubles as the product's core promise: surfacing the blind spots a lecture leaves behind — the things it mentioned but never fully explained.

---

## 1. Executive Summary

The insight behind this product is a real, personally-felt problem: recorded lectures are not the same thing as *being taught*. A lecture is a linear, one-take performance — if the instructor skips a step, speaks too fast, or assumes prior knowledge you don't have, the recording just sits there, unhelpful, and you're stuck re-listening to 50 minutes to find the 90 seconds that mattered.

**Blindspot Edu turns a passive recording into an active teacher.** You upload a lecture (audio). The system first *understands* it — what topics it covers, in what order, and how well each one is actually explained. It then *plans* how to teach that material properly, breaking it into a sequence of digestible phases. A voice-based AI agent then teaches you phase by phase, the way a good TA would in office hours — and if you ever want to verify "is this really what the professor said, and where," it jumps you straight to that timestamp in the original recording. Where the lecture itself left gaps, the system builds a connected concept graph so you can see what's related and worth exploring further.

This is not a transcription tool and not a generic "chat with your PDF" tool. The two things that make it distinct are (1) **traceability** — every taught concept links back to a verifiable timestamp in the source, and (2) **pedagogical planning** — content is re-sequenced and re-taught, not just summarized.

**Current build decisions (locked in):**
- **Product name:** Blindspot Edu
- **Platform:** web app (not mobile) — fastest path to a working hackathon demo
- **Language:** English only for the MVP. Multilingual delivery (Urdu, Punjabi, Farsi, etc.) is a real, intentional part of the long-term vision, but it's explicitly a *later-phase* feature, not a hackathon deliverable
- **AI stack sequencing:** The team is building the full pipeline on a modular adapter pattern, using high-speed OpenAI-compatible APIs and open-source models for development, with direct migration hooks to AWS Native services (**Amazon Bedrock**, **Amazon S3**, and **Amazon Polly**) — see §7 for how adapters keep infrastructure transitions seamless.

This document cuts the full vision down to a buildable MVP, proposes a cloud-ready stack that deploys cleanly to AWS, lays out the repository structure to start from on day one, and splits the work evenly across the four roles.

---

## 2. The Problem

- **Lectures are linear and irreversible.** If you didn't understand something the first time, your only tool is scrubbing through a timeline blind.
- **Explanatory gaps are common**, especially outside well-resourced institutions — instructors skip steps assuming context the student doesn't have, and there's no built-in way to fill that gap without a second, better source.
- **Revision is manual and slow.** Making notes, building a study plan, and testing yourself are three separate chores students do badly under time pressure, or skip entirely.
- **There's no way to verify AI-generated help against the source.** Any AI tutor that just "explains the topic" from general knowledge risks teaching something that doesn't match what was actually said in *this* lecture. Traceability back to the original audio is what makes the tool trustworthy for coursework, not just generically educational.

## 3. Product Vision & Differentiation

There are adjacent tools worth being aware of — note-taking/transcription apps, "chat with your document" tools, AI audio-summarizers, and AI tutoring chatbots. As far as we're aware, none of them combine all of the following in one product, which is where Blindspot Edu's white space is:

| Capability | Typical transcription/notes app | Typical AI tutor chatbot | **Blindspot Edu** |
|---|---|---|---|
| Turns a *specific* recording into structured teaching content | No (just text) | No (generic knowledge) | **Yes** |
| Teaches in ordered phases, not a wall of text | No | Sometimes | **Yes** |
| Every explanation traceable to a source timestamp | No | No | **Yes** |
| Fills gaps the source material left out, visibly (graph) | No | No | **Yes** |
| Delivers the lesson by voice | No | Rarely | **Yes** |

The pitch in one line: **"Your lecture recording, taught properly — with receipts."**

## 4. Core User Journey (End State Vision)

1. **Upload** — student uploads a recorded lecture (audio file).
2. **Understand** — the system transcribes it and builds a **Central Knowledge Base**: a searchable, timestamped record of everything said.
3. **Plan** — an AI planning pass reads the transcript and produces a **Learning Plan**: an ordered set of phases/topics, each with a clear teaching objective, plus a list of concepts that were *mentioned but under-explained*.
4. **Teach** — a voice agent teaches the plan phase by phase, checking in as it goes.
5. **Verify** — at any point the student can ask *"where did you get that?"* — the system jumps to and plays the exact timestamp in the original recording.
6. **Fill gaps** — for concepts the lecture didn't fully explain, the system surfaces a **connected knowledge graph** of related material worth knowing.
7. **Practice** — the student can be quizzed (MCQs first; scenario-based as a stretch goal).
8. **Review** — auto-generated notes are available afterward as a compact artifact.
9. *(Later phase)* All of the above, in the student's chosen language, regardless of the language the original lecture was delivered in.

## 5. MVP Scope — What Actually Gets Built for the Hackathon

A hackathon build cannot do all of the above at production quality. The scope below is deliberately ruthless: it protects a single, complete, demo-able path over a longer list of half-finished features. **Treat it as the contract the whole team builds against.**

### 5.1 Must-Have (the demo golden path)

| # | Feature | Why it's in the MVP |
|---|---|---|
| 1 | Upload one lecture audio file | Entry point to everything; no MVP without it |
| 2 | Transcription with timestamps → Central Knowledge Base | Foundation for teaching, search, and traceability |
| 3 | AI-generated Learning Plan (ordered phases + short teaching script per phase) | This *is* the core value proposition — planning, not just summarizing |
| 4 | Voice agent teaches phase-by-phase, in English, with simple controls ("next," "explain again," "quiz me") | This is the "wow" moment of the demo |
| 5 | "Show me where you learned that" → jump/play the original timestamp | The single most differentiating, most memorable feature — protect this above all else |
| 6 | One quiz mode: MCQs generated from the transcript | Auto-gradable, fast to build, reliable live on stage (scenario-based mode is unpredictable to demo live) |

### 5.2 Should-Have (build if the golden path is done early)

- Auto-generated notes per phase (a formatted summary, exportable)
- Knowledge graph visualization for under-explained concepts
- Scenario-based quiz mode
- Free-text Q&A during a phase ("wait, why does that happen?") instead of only fixed commands

### 5.3 Later Phase (explicitly post-hackathon)

- Multilingual teaching output (Urdu first, then Punjabi/Farsi — pending a TTS/ASR coverage check for each, since not every language has confirmed voice-model support yet)
- Multi-lecture libraries / cross-course knowledge base
- Live/real-time classroom transcription (recorded uploads only, for now)
- Native mobile app

### 5.4 Explicitly Out of Scope (do not build these for the hackathon)

- Full user accounts, roles, or billing
- True real-time, barge-in speech-to-speech conversation (turn-based voice is fine, and is more reliable live on stage)
- Editing/correcting the AI's teaching plan through a UI (hardcode a "regenerate" button at most)

---

## 6. System Architecture

The system has two intelligence layers that map cleanly onto the AI/Planning and AI Orchestrator roles, sitting on top of a conventional web app:

- **Offline / planning pipeline** (AI/Planning owns this): runs once per uploaded lecture. Audio → transcript+timestamps → learning plan → gap list (knowledge graph seeds) → quiz bank. All of this is pre-computed and stored, not regenerated live.
- **Runtime / orchestration layer** (AI Orchestrator owns this): runs during the live teaching session. Reads the pre-computed plan, holds conversation state (which phase we're on, what's been asked), decides what to do next, and drives the voice output.

### 6.1 Component Responsibilities

| Component | Responsibility | Primary owner |
|---|---|---|
| Web client | Upload UI, phase-by-phase teaching screen, audio player with seek-to-timestamp, quiz UI, notes view, graph view | Frontend |
| API layer | REST/WebSocket endpoints, auth (minimal), request routing | Backend |
| Object storage | Stores raw lecture audio files | Backend |
| Database | Lectures, transcript chunks, learning plans, quiz results, graph nodes/edges | Backend |
| ASR service | Converts audio → timestamped transcript | AI/Planning |
| Planning LLM pass | Transcript → ordered phases + teaching scripts + gap list + quiz bank | AI/Planning |
| Vector index | Embeddings of transcript chunks, enables "when was X discussed" search | AI/Planning (build) + Backend (host) |
| Agent loop | Holds session state, decides next action, calls TTS/lookup tools | AI Orchestrator |
| TTS service | Converts teaching script → spoken audio | AI Orchestrator |

---

## 7. Tech Stack

Every AI-facing component below is built behind a small interface (an "adapter") from day one. This architecture enables local development while supporting zero-friction integration with AWS Native cloud services — see §7.3.

### 7.1 Frontend

| Layer | Choice | Why |
|---|---|---|
| Framework | React (Next.js) + Tailwind CSS | Fast to build, huge component ecosystem, easy to deploy to AWS Amplify |
| Audio player w/ seek | `wavesurfer.js` | Purpose-built for "jump to timestamp" interaction — directly supports Feature #5 |
| Live agent updates | WebSocket client | Streams the agent's teaching state/audio without polling |
| Knowledge graph view | `react-force-graph` or `vis-network` | Lightweight, no backend graph database needed |

### 7.2 Backend, AI/Planning & AI Orchestrator

Two columns below: what you're building **now** (for rapid local iteration), and what it connects to on **AWS Cloud**. Nothing in the cloud-native column requires touching frontend, database, or API code — only the adapter configuration changes.

| Layer | **Build now (Fast local dev / prototyping)** | **AWS Cloud Native (Production / Hackathon)** |
|---|---|---|
| API framework | FastAPI (Python) | Containerized on **AWS App Runner** or **AWS ECS Fargate** |
| Database | SQLite (local) / PostgreSQL | **Amazon RDS PostgreSQL** or **Aurora Serverless v2** |
| Object storage | Local disk / S3-compatible adapter | **Amazon S3** (via `boto3` client) |
| Vector search | `pgvector` extension | **Amazon OpenSearch Serverless** or RDS `pgvector` |
| Speech-to-text (timestamps) | Self-hosted **faster-whisper** (large-v3) | **Amazon Transcribe** (speech-to-text with word/segment timestamps) |
| Planning LLM (understand + sequence + quiz gen) | Groq LPU / OpenAI-compatible API | **Amazon Bedrock** (Anthropic Claude 3.5 Sonnet / Amazon Nova Pro) |
| Embeddings | `sentence-transformers` (`all-MiniLM-L6-v2`) | **Amazon Titan Text Embeddings V2** on Bedrock |
| Knowledge graph | `NetworkX` in Python — no separate graph database needed for MVP scale | — (unchanged; lightweight in-memory graph) |
| Text-to-speech | `edge-tts` / open-source neural TTS | **Amazon Polly** (neural voice synthesis) |
| Agent loop / orchestration | Plain Python state machine (dialogue state engine) | Containerized service on **AWS App Runner** |

### 7.3 Adapter Strategy — seamless transition to AWS Native Services

The architecture remains clean because each AI-facing file has one small, swappable core inside it, instead of vendor calls scattered all over the codebase. Concretely, inside each file under `backend/ai/`:

- Write one function that does the actual work today (e.g. `transcribe(audio_url)`, calling faster-whisper). Keep its inputs and outputs identical regardless of the underlying engine.
- For AWS services, plug into that same function interface (e.g. Amazon Bedrock or Amazon Transcribe) — nothing that calls the service elsewhere in the codebase has to change.
- **Normalize whatever a provider returns into one shared shape**, defined once in `backend/schemas.py`, before returning it — e.g. every transcription call returns the same `TranscriptSegment{start, end, text, speaker}` shape, regardless of which tool produced it.
- Object storage gets the same treatment: because `storage` uses `boto3`, switching between local disk, MinIO, and production Amazon S3 is purely an environment variable change.

This costs almost nothing extra today — it's just "keep the function's signature stable" — and it's what makes deploying live to AWS on **AWS App Runner** and **Amazon S3** immediate and rock-solid.

---

## 8. Repository Structure & Day-One Setup

Kept deliberately simple: two top-level code folders, not four. The team is working together rather than in strict lanes, so the structure follows *what's being built*, not *who's building it* — anyone can open `backend/` or `frontend/` and know where something lives.

```
blindspot-edu/
├── frontend/                # the web app (Next.js)
│   ├── app/                  # pages/routes
│   ├── components/           # upload, teaching screen, quiz, graph view
│   └── lib/                   # API client, WebSocket hook
│
├── backend/                 # API, database, and all AI logic together
│   ├── api/                  # routes: upload, lectures, quiz, search, ws
│   ├── models.py              # DB tables
│   ├── db.py                   # session + migrations
│   ├── storage.py               # local disk or Amazon S3 (via boto3)
│   ├── schemas.py                # canonical shapes everyone codes against
│   └── ai/
│       ├── transcription.py       # ASR: faster-whisper / Amazon Transcribe
│       ├── planning.py             # learning plan + quiz + gap generation
│       ├── graph.py                 # knowledge graph construction
│       ├── orchestrator.py           # live session agent loop + commands
│       └── tts.py                     # voice output: edge-tts / Amazon Polly
│
├── infra/
│   ├── docker-compose.yml    # local Postgres + MinIO/S3, so everyone's laptop matches
│   └── .env.example
│
├── docs/
│   ├── MVP_Blueprint_AI_Lecture_Companion.md
│   └── task.md
│
└── README.md
```

**Why this shape, specifically:**

- **Two top-level folders, not four** — `frontend/` and `backend/`. Whoever's free next picks up whatever task is next, without needing to know whose "territory" a folder belongs to.
- **`backend/ai/` holds every AI capability as one file each** — transcription, planning, graph, orchestrator, tts. Each file has a small swappable core (§7.3), so migrating to AWS Native services (Bedrock, Polly, Transcribe) means configuring one adapter file, not restructuring a folder tree.
- **`backend/schemas.py` is the single most important file in the repo** — the shared shapes both the API routes and the AI code use. It's the literal implementation of the "Interface Contract" table in §9.6. Agree on it together on day one, before writing pipeline code against it.
- **`infra/docker-compose.yml`** spins up Postgres + MinIO locally so everyone runs the identical environment without individually installing and configuring databases.
- Flat and shallow on purpose — a hackathon team needs to *find* things fast, not enforce enterprise conventions.

---

## 9. Team Roles & Responsibilities

The four roles are split so each owns one complete vertical slice of the system — no one is "just support" for someone else.

### 9.1 Frontend — "The person who makes the demo look like a real product"

**Mission:** Build the web experience end-to-end — from upload to the live teaching session to quiz and notes.

**Owns:**
- Upload screen (drag-and-drop audio, upload progress, basic validation)
- Lecture/Knowledge Base view: list of processed lectures, a search bar that queries the backend's "when was X discussed" endpoint
- Teaching session screen: current phase indicator, live transcript of what the agent is saying, playback controls, and the **"show me where you learned that"** button that seeks the embedded audio player to the returned timestamp
- Quiz UI (MCQ first; scenario-based UI if that mode gets built)
- Notes view and knowledge graph view (should-have)
- Responsive layout so the demo works cleanly on a laptop and a projector

**Depends on / consumes:** Backend's REST endpoints and WebSocket stream for live agent state.

### 9.2 Backend — "The person who makes everything else possible to plug into"

**Mission:** Own the data model, the API contract, storage, and infrastructure so the other three roles have something stable to build against from day one.

**Owns:**
- Database schema: lectures, transcript chunks, learning plans, phases, quiz questions/results, graph nodes/edges
- REST API: upload endpoint, lecture listing, learning-plan retrieval, quiz retrieval/submission, notes retrieval, search endpoint (wraps the vector index)
- WebSocket endpoint for the live teaching session
- Storage adapter (`backend/storage.py`) — local/MinIO now, one-line swap to OSS later
- Vector index hosting (`pgvector` now, Tablestore/OpenSearch later) and the query layer used by search + gap detection
- Background job handling for the (slow) transcription step, so upload doesn't block the UI
- `infra/docker-compose.yml` and environment setup — worth doing together in week one, since everyone depends on a working local environment

**Depends on / consumes:** AI/Planning's output schema (`backend/schemas.py`) and AI Orchestrator's runtime events.

### 9.3 AI / Planning — "The person who decides *what* gets taught, and in what order"

**Mission:** Turn a raw, messy lecture transcript into structured, sequenced, teachable content — the offline "compiler" step.

**Owns:**
- ASR integration in `backend/ai/transcription.py` (faster-whisper now, Amazon Transcribe ready)
- Prompt design and pipeline for the **Learning Plan generator**: transcript → ordered phases, each with a short teaching script and a difficulty/prerequisite note
- **Gap detection**: identifying concepts the lecture mentions but doesn't fully explain, which seed the knowledge graph
- **Knowledge graph construction**: extracting concept/relation pairs into nodes/edges for the Backend to store and Frontend to render
- **Quiz bank generation**: MCQs (and scenario-based questions if time allows), derived from the transcript and plan
- Embedding generation for transcript chunks, feeding the vector index that powers both search and gap detection
- Keeping every provider's raw output normalized into `backend/schemas.py`'s canonical shapes before anything downstream touches it

**Depends on / consumes:** Backend's storage layer (to read audio, write plans/quizzes/graph data).
**Hands off to:** AI Orchestrator (the finished Learning Plan JSON and quiz bank are what the Orchestrator teaches from at runtime).

### 9.4 AI Orchestrator — "The person who makes it feel like a live teacher, not a script reader"

**Mission:** Own the *live, interactive* teaching session — the runtime agent that a student actually talks to.

**Owns:**
- The **agent loop / dialogue state machine** in `backend/ai/orchestrator.py`: tracks which phase the session is on, what's already been covered, and what the student just asked for
- Command handling (within the same file): "next," "explain again," "show me where you learned that" (calls the search/timestamp logic), "quiz me," and free-form questions
- **Voice output pipeline** in `backend/ai/tts.py` (edge-tts now, Amazon Polly ready)
- Session state persistence, so a refreshed page or a reconnect doesn't lose the student's place
- Latency and reliability tuning for the live demo — this role is directly responsible for how smooth the on-stage demo feels

**Depends on / consumes:** AI/Planning's Learning Plan and quiz bank (read-only at runtime), Backend's WebSocket channel and timestamp-search endpoint.

### 9.5 Shared Responsibilities (split evenly, not owned by one person)

- Pitch deck and 3-minute demo video (everyone contributes their section)
- README / architecture diagram / "proof of deployment" writeup for submission
- End-to-end testing of the golden path (each person tests a version of the full flow, not just their own component)
- Demo rehearsal — at least one full run-through with the actual hardware/network the team will demo on

### 9.6 Interface Contract (so no one is blocked waiting on someone else)

| From → To | What gets passed | Format |
|---|---|---|
| Frontend → Backend | Audio file upload, quiz answers, search queries | HTTP requests |
| Backend → Frontend | Lecture list, learning plan, quiz results, notes, graph data | JSON over REST |
| Backend → AI Orchestrator | Live session events | WebSocket |
| AI Orchestrator → Frontend | Spoken audio stream + current phase state | WebSocket |
| AI/Planning → Backend | Learning plan JSON, quiz bank JSON, graph nodes/edges, embeddings | Written to DB/vector index directly, using `backend/schemas.py` shapes |
| AI Orchestrator → AI/Planning's output | Reads Learning Plan JSON | Read-only, via Backend's storage layer |

Agreeing on `backend/schemas.py` and the WebSocket event format on day one is the single highest-leverage thing this team can do.

---

## 10. Build Timeline & Milestones

The submission deadline for the **AWS Zero to Shipped Hackathon** is **October 2, 2026 at 11:59 PM PDT** (launched September 18, 2026).

| Phase | Relative share of remaining time | Focus |
|---|---|---|
| **1 — Foundation** | ~30% | `docker-compose` + DB schema + API skeleton (Backend); `backend/schemas.py` agreed by everyone; ASR pipeline working end-to-end on one test file (AI/Planning); basic upload + lecture list UI (Frontend); agent loop skeleton with hardcoded responses (AI Orchestrator) |
| **2 — Core Loop** | ~40% | Learning Plan generation working (AI/Planning); live teaching session with real TTS output (AI Orchestrator); teaching screen + timestamp jump working end-to-end (Frontend); WebSocket + search endpoint solid (Backend). By the end of this phase, the full golden path (§5.1) should work |
| **3 — Ship Gate & Deployment** | ~30% | Deploy backend container to **AWS App Runner**, frontend to **AWS Amplify**, and point storage to **Amazon S3** to pass the mandatory live Ship Gate; record documented proof of coding agent AWS connection; finalize pitch deck, demo video, and Builder Center submission |

**Rule of thumb:** the golden path (§5.1) and live AWS URL must be working before spending time on post-MVP stretch features.

---

## 11. Hackathon Fit

### 11.1 Official Judging Criteria (AWS Zero to Shipped)

Projects advance through a mandatory **Ship Gate** (pass/fail live AWS URL + agent connection proof), followed by two evaluation gates:
1. **Creativity & Storytelling:** Clear, compelling narrative around "Teaching With Receipts" and solving lecture opacity.
2. **Technical Innovation & Originality:** Pedagogical re-sequencing, automated gap detection, and grounded verification guardrails.
3. **Community & Market Impact:** Direct fit for the **#social-good** category (Education track: improving learning outcomes and educational equity for underserved students) and **#community** / **#startup** lanes.
4. **Implementation Quality:** Clean modular architecture, low-latency live WebSocket state machine, and robust AWS cloud deployment.

### 11.2 Suggested 3-Minute Demo Script

1. **Hook (15s):** Open with the shared pain — a lecture that assumes things you don't know, and no good way to fix that after the fact.
2. **Upload (15s):** Upload a real (pre-tested) lecture recording.
3. **Plan appears (25s):** Show the generated Learning Plan — phases visibly derived from *this* lecture, not a generic outline.
4. **Live teaching (45s):** Let the voice agent teach phase one out loud.
5. **The "wow" moment (35s):** Ask "show me where you got that" — the app jumps to and plays the exact original timestamp. This is the feature to protect at all costs in the demo.
6. **Quiz (25s):** Answer one MCQ live.
7. **Close (20s):** Show the concept knowledge graph with highlighted blind spots, and conclude on the AWS-backed architecture (App Runner, Amazon Bedrock, Amazon S3) delivering measurable educational impact.

---

## 12. Risks, Assumptions & Open Questions

### 12.1 Current Risks

| Risk | Mitigation |
|---|---|
| Live demo network/venue conditions cause voice latency or dropouts | Use turn-based voice interaction (record → respond) rather than real-time barge-in; more reliable on stage, and out of scope by design |
| ASR accuracy on real classroom-quality audio (background noise, accents) | Test the pipeline on an actual rough lecture recording in week one, not a clean studio sample — this is where timestamp accuracy (Feature #5) will succeed or fail |
| Scope creep back toward the full nine-feature original vision | Treat §5 as the contract; anything not in "Must-Have" doesn't get built until the golden path works end-to-end |
| Ship Gate deployment blocker | Containerize early with Docker and deploy to AWS App Runner; verify public HTTPS reachability well ahead of October 2 deadline |

### 12.2 Reference for Later — Multilingual Coverage Findings

Multilingual delivery is an intentional extension: `edge-tts` supports Urdu (`ur-PK-AsadNeural`), Spanish, and 40+ languages. Amazon Polly also provides extensive multilingual neural voices when enabled in production.

### 12.3 Submission Checklist

1. Verify live, publicly reachable application running on AWS (mandatory Ship Gate).
2. Capture documented proof of coding agent connection to the AWS console.
3. Complete submission on AWS Builder Center before October 2, 2026, 11:59 PM PDT with tags `#social-good` and `#community` (or `#startup`).

---

*End of document. This is a living blueprint — update §5 (scope) and §10 (timeline) as real dates and test results come in; keep §8 (repo structure) and §9 (roles) as the stable reference the team builds against.*
