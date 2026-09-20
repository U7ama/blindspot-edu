# Blindspot Edu — Build Roadmap
### task.md — the step-by-step checklist companion to `MVP_Blueprint_AI_Lecture_Companion.md`

**How to use this file:**
- Tasks are grouped by **phase**, then by **what's being built** — not by who's building it. Pick up whatever's next and unblocked; the team works together rather than in strict lanes.
- Check items off as you go — this is meant to be edited directly, not just read.
- `⛔ blocked by:` notes tell you what has to exist first. If you hit one, jump to something else that isn't blocked.

---

## Phase 0 — Day One Setup (everyone, together)

- [ ] Review official submission requirements on AWS Builder Center for the Zero to Shipped hackathon (due Oct 2, 2026)
- [ ] Create the shared GitHub repo, named `blindspot-edu`, with the structure from blueprint §8: `frontend/`, `backend/` (with `backend/ai/`), `infra/`, `docs/`
- [ ] Write `infra/docker-compose.yml` with Postgres + MinIO, and confirm everyone can run it locally
- [ ] Write `infra/.env.example` listing every environment variable the project will need (DB connection, storage endpoint/keys, LLM/ASR/TTS provider, AWS credentials)
- [ ] As a group, design and write `backend/schemas.py` — the single most important file in the repo. At minimum it needs:
  - [ ] `TranscriptSegment` — `start`, `end`, `text`, `speaker` (optional)
  - [ ] `LearningPlan` — an ordered list of `Phase` objects
  - [ ] `Phase` — `title`, `teaching_script`, `source_timestamps`, `prerequisite_note`
  - [ ] `GapConcept` — a concept mentioned but under-explained, used to seed the knowledge graph
  - [ ] `QuizItem` — `question`, `options`, `correct_answer`, `source_timestamp`
  - [ ] `GraphNode` / `GraphEdge` — concept nodes and their relationships
- [ ] Agree on the WebSocket event format between the API and the orchestrator logic (event types: `phase_started`, `speaking`, `awaiting_command`, `jumped_to_timestamp`, `quiz_started`, `session_ended`)
- [ ] Agree on a lightweight git workflow (branch-per-feature, PR into `main` — whatever the team already knows)
- [ ] Source at least one **real, rough, non-studio-quality lecture recording** to test against all week — this matters more than it sounds like it should
- [ ] Pick the starting LLM path (hosted free-tier API vs self-hosted) based on whatever compute the team has access to, and write the choice down in the README

---

## Phase 1 — Foundation (~30% of remaining time)

**Goal by the end of this phase:** every piece exists in rough working form, and any of it can be built on in parallel without blocking the rest.

### Environment & scaffolding
- [ ] Scaffold the Next.js app in `frontend/` with Tailwind configured
- [ ] Scaffold the FastAPI app in `backend/`, with `backend/ai/` as an empty package ready for the five capability files

### Database & storage
- [ ] Design and create the database schema in Postgres:
  - [ ] `lectures` (id, filename, upload_time, status)
  - [ ] `transcript_chunks` (id, lecture_id, start, end, text, speaker, embedding)
  - [ ] `learning_plans` (id, lecture_id) and `phases` (id, plan_id, order, title, teaching_script, source_timestamps)
  - [ ] `quiz_items` (id, lecture_id, question, options, correct_answer, source_timestamp) and `quiz_results`
  - [ ] `graph_nodes` and `graph_edges`
- [ ] Enable the `pgvector` extension for embedding storage/search
- [ ] Build `backend/storage.py`: a `save(file) -> url` / `get_url(id)` pair backed by local disk or MinIO

### Upload flow
- [ ] Build `POST /lectures` in `backend/api/`: accepts an audio file, stores it via `storage.py`, creates a `lectures` row with status `processing`, kicks off a background transcription job
- [ ] Build the upload screen in `frontend/`: drag-and-drop or file-picker, upload progress, basic validation
- [ ] Wire the two together and confirm a real file upload creates a real row in the database

⛔ *blocked by: nothing — this can start immediately.*

### Transcription pipeline (first pass)
- [ ] Write `backend/ai/transcription.py`: a `transcribe(audio_url) -> list[TranscriptSegment]` function, backed by faster-whisper (or the hosted equivalent chosen in Phase 0)
- [ ] Run it end-to-end on the real test lecture recording from Phase 0 — check timestamp granularity and accuracy on *rough* audio, not a clean sample (this directly de-risks the "show me" feature later)
- [ ] Wire `transcribe()` into the background job so a real upload produces real `transcript_chunks` rows

⛔ *blocked by: storage.py and the transcript_chunks table.*

### Basic UI shell
- [ ] Build the lecture list screen (can use placeholder data at first) — this is where search will live later
- [ ] Build a basic API client in `frontend/lib/` wrapping fetch calls to the backend
- [ ] Lay out the teaching session screen skeleton: phase indicator, transcript panel, audio player placeholder, control buttons (Next / Explain again / Show me / Quiz me) — dummy handlers for now

### Voice output sanity check
- [ ] Write `backend/ai/tts.py`: a `speak(text) -> audio` function backed by an open-source TTS tool for English
- [ ] Confirm it produces a playable audio file for one hardcoded sentence, completely independent of anything else in the app

### End-of-Phase-1 checkpoint (everyone, ~15 min)
- [ ] Demo each piece: a real upload creates a real transcript, the teaching screen renders (even with placeholder data), and `tts.py` can speak a sentence out loud
- [ ] Revisit `backend/schemas.py` together — if anything needed a field that isn't there yet, add it now, before Phase 2 starts

---

## Phase 2 — Core Loop (~40% of remaining time)

**Goal by the end of this phase:** the full golden path (blueprint §5.1) works end-to-end, even if rough around the edges.

### Learning plan generation
- [ ] Write `backend/ai/planning.py`: a `generate_plan(transcript) -> LearningPlan` function, prompting the chosen LLM to turn a transcript into ordered `Phase` objects
- [ ] Test it against the real test recording and sanity-check: are the phases in a genuinely sensible teaching order, not just chronological transcript order?
- [ ] Add embedding generation (also in `planning.py` or a small helper): embed transcript chunks using `sentence-transformers`, store alongside `transcript_chunks`
- [ ] Wire `generate_plan()` into the background job, right after transcription, so a real upload eventually produces a real stored plan
- [ ] Build `GET /lectures/{id}/plan` and connect the frontend's plan view to it

⛔ *blocked by: transcription pipeline (Phase 1) and the schemas for LearningPlan/Phase.*

### Search & "show me"
- [ ] Build `GET /search?query=...&lecture_id=...` as a `pgvector` similarity query over `transcript_chunks`
- [ ] Add a `show_me(topic)` handler in `backend/ai/orchestrator.py` that calls the search logic and returns a timestamp
- [ ] Integrate `wavesurfer.js` into the teaching session screen for the audio player
- [ ] Wire the **"show me where you learned that"** button to call search and seek the player to the returned timestamp — give this real attention here, not just in Phase 3; it's the single most differentiating feature in the whole product

⛔ *blocked by: embeddings existing in the database.*

### Live teaching session
- [ ] Write `backend/ai/orchestrator.py`: the session state machine — tracks current lecture, current phase index, conversation history
- [ ] Implement the command handlers inside it: `next` (advances phase, calls `tts.speak()`), `explain_again` (re-synthesizes the current phase), `quiz_me` (hands off to the quiz flow)
- [ ] Build the WebSocket endpoint (`WS /lectures/{id}/session`) using the event format agreed in Phase 0, relaying orchestrator events to the connected client
- [ ] Wire the frontend's WebSocket hook to real events and render them: current phase, live transcript of what's being said
- [ ] Wire the Next / Explain again / Quiz me buttons to send real commands over the socket
- [ ] Add session state persistence so a page refresh doesn't lose the student's place mid-session

⛔ *blocked by: a real Learning Plan existing to teach from.*

### Quiz (MCQ)
- [ ] Add quiz generation to `backend/ai/planning.py`: transcript + plan in, structured `QuizItem` list out
- [ ] Build `GET /lectures/{id}/quiz` and `POST /lectures/{id}/quiz/submit` (with scoring)
- [ ] Build the MCQ quiz UI in the frontend, wired to both endpoints

### End-of-Phase-2 checkpoint (everyone)
- [ ] Run the entire golden path start to finish, together, on the real test recording: upload → plan generates → agent teaches phase 1 out loud → "show me" jumps to a real timestamp → quiz appears
- [ ] Time the full run once — this tells you how much slack Phase 3 actually has
- [ ] Write down every rough edge found — that list becomes the top of the Phase 3 bug-bash

---

## Phase 3 — Polish, Stretch, and Demo Prep (~30% of remaining time)

**Rule for this phase: the golden path is the floor, not a checkbox. Fix any part of it that's shaky before starting anything below.**

### Should-have features (in priority order — stop anywhere on this list if time runs out)
- [ ] **Notes generation** — add to `planning.py`; new `GET /lectures/{id}/notes` endpoint; notes view in the frontend
- [ ] **Knowledge graph** — add construction logic to `backend/ai/graph.py` (using `NetworkX`) plus gap detection in `planning.py`; new `GET /lectures/{id}/graph` endpoint; graph view in the frontend using `react-force-graph` or `vis-network`
- [ ] **Scenario-based quiz mode** — a prompt variant in `planning.py`; only build this if MCQ mode is already rock-solid
- [ ] **Free-text Q&A during a phase** — a new handler in `orchestrator.py` that routes free-form input to the LLM with current-phase context; a text input on the teaching screen

### Testing & bug bash
- [ ] Full regression pass on the golden path after every should-have feature lands
- [ ] Test on the actual device/network the demo will run on, not just a dev laptop on office wifi
- [ ] Test WebSocket reconnect behavior (what happens if the connection drops mid-session?)
- [ ] Spot-check timestamp accuracy on 3–5 different points in the test recording, not just the one moment used in rehearsal

### Demo & submission prep
- [ ] Write the architecture diagram for submission (can reuse/adapt the one in the blueprint)
- [ ] Write the README: setup instructions and the "proof of deployment" section the submission requires
- [ ] Record the ~3-minute demo video following the script in blueprint §11.2
- [ ] Build the pitch deck
- [ ] Do at least one **full rehearsal** end-to-end, out loud, on the real demo hardware
- [ ] Prepare a fallback: a short screen recording of a clean successful run, in case live conditions fail on the day

---

## Backlog — Explicitly Not Part of This Build

Keep these visible so they don't get quietly re-added mid-sprint, but do **not** start any of them before every task above is done:

- [ ] Multilingual teaching output (Urdu first, then Punjabi/Farsi — pending a voice-model coverage check per blueprint §12.2)
- [ ] Multi-lecture libraries / cross-course knowledge base
- [ ] Live/real-time classroom transcription
- [ ] Native mobile app
- [ ] User accounts, roles, billing
- [ ] Real-time barge-in speech-to-speech

---

## Submission Checklist
- [ ] Ensure application is deployed live on AWS with a public URL (Pass Ship Gate)
- [ ] Document proof of AI coding agent connection to the AWS console
- [ ] Submit project on AWS Builder Center tagged `#social-good` and `#community` (or `#startup`)

---

*Keep this file updated as you go — check items off in real time, not retroactively. If a task turns out bigger than it looked, split it into sub-items rather than leaving it half-checked.*
