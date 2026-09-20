# Blindspot Edu — Live AI Whiteboard Subsystem
## Full Canvas Version (Version A) — Build Blueprint

**Purpose of this doc:** a standalone, buildable spec for the whiteboard layer of Blindspot Edu — an actual interactive canvas (not just a scripted playback), where the AI teacher draws and speaks in sync *and* the student can draw back, point, ask, and interrupt. This sits alongside (and eventually inside) the main MVP blueprint, but is scoped separately because it's a genuinely large subsystem.

---

## 1. What "Version A" actually means

You're not building a passive video of a hand drawing. You're building three things that have to work together in real time:

1. **A real canvas** — students can pan, zoom, draw, erase, point, select — the way they would on Miro/Excalidraw.
2. **An AI agent that also acts on that same canvas** — it draws shapes, writes text, annotates, while narrating out loud, timed to its own speech.
3. **A two-way input channel** — the student can interrupt with voice ("wait, why?"), draw a question mark next to something, circle a part of the diagram, or type — and the AI has to *see* what's on the canvas plus hear/read the input, then react.

That third point is what separates this from every "AI draws a diagram for you" tool on the market — most of those are one-directional (AI → canvas). You want bidirectional, live, mid-explanation interaction. This is closer to what Lumi/CANtutor are attempting than to Miro AI or Boardmix.

Be honest with yourself about cost: this is a multi-week build even for an experienced team, and it introduces failure modes (latency, sync drift, ambiguous student input) that a scripted playback layer never has to deal with. Everything below assumes you're accepting that tradeoff deliberately.

---

## 2. The four subsystems, broken down

### 2.1 Canvas Engine (the "whiteboard" itself)
The actual drawing surface. Needs to support:
- Infinite pannable/zoomable surface
- Object model: shapes, text, freehand strokes, arrows, images — each as an editable object, not a flat pixel bitmap
- Both human-drawn and AI-drawn objects living in the *same* object model (this matters — see §3.1)
- Selection, move, resize, delete
- Undo/redo
- Serialization — the entire board state needs to be representable as JSON at any moment, because the AI needs to "read" the board to know what's on it

### 2.2 AI Drawing Agent (the "hand")
Takes a teaching intent ("explain projectile motion") and turns it into a sequence of canvas operations, each timed against speech. Needs to:
- Decide *what* to draw, not just narrate
- Emit atomic, replayable draw commands (not raw pixels — see §3.1)
- Time each command against a TTS audio stream
- Be interruptible mid-sequence

### 2.3 Voice Layer (the "mouth and ears")
- TTS: converts the teaching script to speech, ideally with word/phoneme-level timing so drawing commands can sync precisely
- STT: converts student's spoken interruptions back to text
- Turn-taking logic: knowing when the student is trying to interrupt vs. just thinking out loud

### 2.4 Perception Layer (the "eyes" — reading the board)
This is the piece most tutorials skip and it's the hardest part of true bidirectionality:
- When the student draws something or circles part of the AI's diagram, the system needs to understand *what* they're pointing at
- Two approaches: (a) **structured** — since everything is an object with coordinates, you can do hit-testing/proximity matching against the object model directly (cheap, reliable, recommended for MVP); (b) **visual** — render the canvas region to an image and send it to a vision-capable LLM to interpret (flexible, handles freehand input, but slower and costlier)
- Realistically you want (a) as the default and (b) as a fallback for freehand/ambiguous input

---

## 3. Core architectural decision: commands, not pixels

This is the single most important design decision in the whole subsystem, so it's worth its own section.

### 3.1 Why the AI should never "draw" in the sense of generating an image

Don't have the AI generate a picture (e.g. via an image model) and paste it onto the board. You want the AI to emit a **sequence of structured drawing operations** — the same kind of object your canvas engine already uses for human-drawn shapes. For example, instead of "AI generates an image of a circuit diagram," it emits:

```json
[
  { "op": "add_shape", "type": "rect", "id": "battery", "x": 100, "y": 200, "w": 80, "h": 40, "label": "9V" },
  { "op": "add_shape", "type": "line", "id": "wire1", "from": "battery.right", "to": "resistor.left" },
  { "op": "add_text", "id": "label1", "x": 100, "y": 180, "text": "Current flows here" },
  { "op": "highlight", "target": "wire1", "duration_ms": 1500 }
]
```

This buys you a lot:
- **Editable** — the student can grab any AI-drawn object and move/annotate it, because it's a real object, not a flattened image
- **Replayable** — you can scrub back through the lesson and watch it redraw itself
- **Inspectable** — the Perception Layer (§2.4) can do cheap coordinate-based hit-testing instead of computer vision
- **Undoable** — undo/redo works uniformly across human and AI actions
- **Small payloads** — a JSON command is bytes; an image is kilobytes-to-megabytes, and over a live WebSocket during a timed narration, that difference matters

### 3.2 The Command Schema (concept)

Every object on the board — whether drawn by the student or the AI — should normalize into one shape, e.g.:

```
CanvasObject {
  id: string
  type: "shape" | "text" | "stroke" | "arrow" | "image" | "highlight"
  authored_by: "ai" | "user"
  geometry: {...}       // type-specific: x/y/w/h, points[], path[]
  style: {...}
  created_at: timestamp
  linked_step_id: string | null   // ties it back to which teaching step produced it
}
```

The `linked_step_id` field is what lets you answer "why did you draw this?" the same way your main product answers "where did you learn that?" — every AI-drawn object traces back to a step in the lesson plan, which traces back to (eventually) a transcript timestamp. This is a nice thread connecting the whiteboard subsystem back to your core traceability pitch.

### 3.3 Command batches are timed against speech, not against wall-clock

Don't hardcode "wait 2 seconds, then draw." Instead:
- TTS generation returns word or SSML-mark-level timestamps
- The teaching-step sequence maps specific draw operations to specific words/marks in the script (e.g. "draw the arrow when the word 'flows' is spoken")
- The Orchestrator listens to TTS playback progress and fires draw commands at the matched marks

This is what makes it feel like a teacher drawing *while* explaining, instead of a slideshow with narration bolted on.

---

## 4. Step-by-step build plan

This is ordered so each step produces something demoable on its own — don't build all four subsystems fully before integrating.

### Step 0 — Decide your canvas foundation (see §5 for options)
Pick the rendering technology before anything else, since it constrains what the Command Schema can express.

### Step 1 — Build the canvas engine alone, no AI
Get a working whiteboard where a human can draw shapes, text, freehand strokes, pan/zoom, undo/redo, and the whole state serializes to/from JSON. Validate this in isolation. If this part is shaky, nothing above it will feel good.

### Step 2 — Build the Command → Canvas renderer
Write the function that takes a JSON command batch (§3.2) and applies it to the canvas, with no AI involved yet — just hand-write a few test JSON sequences and confirm they render correctly, animate in (not just pop in), and can be undone.

### Step 3 — Add TTS with timing marks
Get your TTS provider returning word-level or SSML-mark timestamps. Confirm you can play audio and fire a JS callback at each mark.

### Step 4 — Wire Command playback to TTS timing
Combine steps 2 and 3: a hardcoded script + hardcoded command batch, played back in sync. This is your first real "wow" moment and it doesn't need any LLM yet — it's pure engineering.

### Step 5 — Have the Planning LLM generate the command batches
Now bring in the AI: prompt your planning pass (or a new pass) to output teaching script *plus* an interleaved list of draw commands using the schema from §3.2. This is where most of your prompt-engineering effort goes — see §6.

### Step 6 — Add STT + interruption handling
Let the student speak. Start with simple turn-based interruption (student presses a "raise hand" button or says a wake phrase) before attempting always-listening barge-in, which is a much harder, much more failure-prone UX problem.

### Step 7 — Add the Perception Layer
Implement structured hit-testing first (§2.4a): when the student says "what's this?" while a cursor/selection is active, resolve it against the object model's coordinates. Only add vision-model fallback (§2.4b) once the structured path works, and only if you have time.

### Step 8 — Handle student-drawn input
Let the student draw on the board mid-lesson (e.g., attempt a problem). The AI needs to "see" this — reuse the object model (it's already structured, so no vision model needed for this part either) and feed a description of what the student drew into the next LLM turn.

### Step 9 — Session state & replay
Persist board state per session so a refresh doesn't lose progress, and so a "review" mode can replay the whole lesson (drawing + audio) later — this doubles as your Notes/Review feature from the main blueprint.

### Step 10 — Polish the sync
This is where most of your remaining time will go. Drift between audio and drawing, laggy STT turnaround, and "dead air" while the LLM thinks are the three things that will make or break how this *feels* live. Budget real time here — don't treat it as a buffer step.

---

## 5. Tech stack — canvas & drawing layer

| Layer | Paid / Hosted option | Free / Open-source option | Notes |
|---|---|---|---|
| Canvas rendering | Miro SDK / Figma-style proprietary engine | **tldraw** (React, open-source, MIT) or **Excalidraw** (React, open-source, MIT) | tldraw is the stronger pick here — it exposes a clean structured object model, a built-in "AI drawing" pattern in its own docs, multiplayer sync primitives, and is actively maintained for exactly this kind of use case. Excalidraw is more minimal/hand-drawn-style, also solid. |
| Realtime sync engine (if you want live multiplayer/cursors) | Liveblocks (generous free tier, then paid) | **Yjs** (CRDT library, fully free/open-source) + a relay server you host yourself | tldraw has official Yjs bindings, so this pairs naturally with the canvas choice above. |
| Canvas primitive fallback (if you skip tldraw/Excalidraw) | Fabric.js (free/open-source either way) | **Fabric.js** or raw HTML5 Canvas API | Only go this route if tldraw/Excalidraw's object model doesn't fit — building object management, hit-testing, and serialization yourself from raw Canvas is a lot of avoidable work. |
| Diagram-specific rendering (flowcharts, node graphs) | — | **React Flow** (free, open-source core) | Better than a general canvas if a large fraction of your content is graph/flowchart-shaped rather than freeform sketches; can be used alongside tldraw for different content types. |

**Recommendation:** tldraw. It's built by people solving almost exactly your problem (structured, AI-editable, syncable canvas) and has documented patterns for AI agents writing to the canvas, which will save you significant time versus rolling your own object model on raw Canvas.

---

## 6. Tech stack — AI drawing agent (command generation)

| Layer | Paid / Hosted option | Free / Open-source option | Notes |
|---|---|---|---|
| Command-generating LLM | Amazon Bedrock (Claude 3.5 Sonnet / Nova Pro), GPT-4o | Any capable open-weight model via Groq/free-tier hosted API | This reuses your existing Planning LLM adapter pattern (§7.3 of the main blueprint) — the swappable-core approach applies identically here. |
| Structured output enforcement | Native JSON mode (Bedrock Converse API / OpenAI) | **Outlines** or **Instructor** (Python libraries, free) constraining open-weight model output to your Command Schema | Critical: you cannot let the model free-type JSON and hope it's valid — enforce the schema at generation time, or you'll get malformed command batches live on stage. |
| Prompt strategy | — | — | Prompt the model to output *interleaved* pairs: `{speak_segment, draw_commands[]}` per beat, not one giant script plus one giant command list — interleaving is what lets you time them together (§3.3). |

---

## 7. Tech stack — voice layer

| Layer | Paid / Hosted option | Free / Open-source option | Notes |
|---|---|---|---|
| TTS with word-level timing | Amazon Polly / ElevenLabs | **Edge-TTS** / **Piper** (fully offline, free) — verify timestamp support | Word/phoneme timestamps are not a universal feature — verify this explicitly for whichever TTS you pick before building sync logic around it. |
| STT (student speech in) | Amazon Transcribe, Deepgram, AssemblyAI | **faster-whisper** (already in your main stack — reuse it) | You likely don't need a second ASR provider — the one in your main blueprint covers this. |
| Turn-taking / VAD (voice activity detection) | — | **Silero VAD** (free, lightweight, widely used) | Needed to detect "the student started talking" distinctly from background noise, so you know when to pause the AI's narration. |

---

## 8. Tech stack — realtime plumbing

| Layer | Paid / Hosted option | Free / Open-source option | Notes |
|---|---|---|---|
| Live transport (draw events + audio streaming + STT results) | Ably, Pusher | **Plain WebSockets** (you already have this in your main stack — extend it, don't replace it) | Your existing WebSocket channel between Orchestrator and Frontend (from the main blueprint) is the right place for draw-command events too — one channel, more event types, not a second system. |
| Session/board state persistence | — | PostgreSQL (already in your main stack) — store board state as JSON, or JSONB column | No new database needed; this is just new tables/columns on infra you already have. |

---

## 9. Where this plugs into your existing Blindspot Edu architecture

Mapped against your MVP blueprint's existing components:

- **`backend/ai/planning.py`** — extended to emit the interleaved `{speak, draw_commands[]}` structure per phase, not just a teaching script string.
- **`backend/ai/orchestrator.py`** — becomes the conductor: listens to TTS timing marks, fires `draw_command` events over the WebSocket at the right moments, listens for STT-detected interruptions, and re-plans on the fly when the student asks a tangential question.
- **`backend/ai/tts.py`** — needs to additionally return timing marks, not just an audio stream.
- **`backend/schemas.py`** — gains the `CanvasObject` and `DrawCommand` shapes (§3.2) as canonical, provider-agnostic types, exactly like `TranscriptSegment` already is.
- **Frontend** — gains the tldraw (or Excalidraw) canvas component, wired to the same WebSocket the teaching screen already listens to.
- **New: Perception module** — a genuinely new piece (`backend/ai/perception.py`), doing coordinate-based hit-testing against the live board object model, with an optional vision-LLM fallback for freehand/ambiguous cases.

Nothing here requires a fifth team role — it extends Frontend, AI/Planning, and AI Orchestrator's existing ownership areas. But be clear-eyed that it roughly doubles the scope of AI Orchestrator's and Frontend's work specifically.

---

## 10. Honest risk assessment

- **Sync drift is the #1 risk.** Audio and drawing slipping out of alignment reads as broken, not charming, especially live on stage. Protect Step 10 time ruthlessly.
- **Barge-in (always-listening interruption) is a trap.** Your own main blueprint already correctly scoped this out ("turn-based voice is fine... more reliable live on stage") — apply the same discipline here. Don't let the whiteboard's interactivity tempt you back into always-listening voice.
- **Freehand student input is genuinely hard to interpret.** A circled scribble around "part of the diagram" is ambiguous even to a human sometimes. Lean on the structured object model (nearest-object hit-testing) as your primary interpretation method; treat true freehand-sketch understanding as a stretch goal, not core path.
- **This is additive risk on top of an already ambitious MVP.** Given your main blueprint explicitly protects a golden path and treats scope creep as a named risk (§12.1), the honest recommendation is: get the golden path (voice-only teaching + timestamp traceability) fully solid first, then layer the canvas in as the enhancement — build order, not necessarily feature-cut order.

---

## 11. Suggested minimum viable version of Version A (if full scope is too much for the timeline)

If the full bidirectional system above is too much, here's a smaller cut that's still "Version A" (a real editable canvas, not scripted playback) but sheds the hardest parts:

- Keep: real canvas (tldraw), AI draws via structured commands synced to TTS timing, student can freely draw/annotate at any time.
- Cut: live voice interruption (student uses a text box or a "pause and ask" button instead of barge-in speech).
- Cut: vision-model fallback for perception — structured hit-testing only.
- Cut: always-on multiplayer sync (Yjs/CRDT) — single-user session state is enough for a demo.

This keeps the core "wow" (AI teaching visually and interactively) while removing the three hardest-to-get-right pieces (barge-in audio, freehand vision understanding, and multiplayer CRDT sync).
