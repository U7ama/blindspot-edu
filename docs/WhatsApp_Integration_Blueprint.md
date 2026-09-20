# Blindspot Edu — WhatsApp Interaction System Blueprint

**Purpose:** This document defines the planned WhatsApp integration for Blindspot Edu. It is written as a detailed implementation blueprint for a CLI-based AI coding agent or development workflow.

**Important:** This document describes the intended system architecture and behavior. It does **not** prescribe implementation code. The coding agent should use the existing Blindspot Edu architecture and repository conventions wherever possible instead of creating a disconnected second application.

---

# 1. What We Are Building

Blindspot Edu is expanding beyond its web interface into WhatsApp.

The goal is to allow a student to interact with Blindspot Edu directly through a dedicated WhatsApp Business number.

The initial interaction modes are:

1. **Text messages**
2. **Voice notes / audio messages**

Later interaction modes may include:

3. **Images with OCR**
4. **Image understanding**
5. **Documents and other educational files**
6. Other WhatsApp-supported educational interactions

The WhatsApp integration should not behave like a completely separate generic chatbot.

It should become another **entry point into the Blindspot Edu ecosystem**.

A student should eventually be able to interact with the same educational intelligence through:

- The Blindspot Edu web application
- The interactive AI teacher
- The AI whiteboard
- WhatsApp

The channel changes, but the core educational context and intelligence should remain connected.

---

# 2. Core Product Idea

A student should be able to message the Blindspot Edu WhatsApp number naturally.

For example:

> Explain recursion to me.

The student receives an appropriate educational response.

Or:

> I don't understand the concept you explained earlier.

Blindspot Edu should use the available conversation and learning context to respond appropriately.

For voice interaction:

> [Student sends a voice note asking a question]

The system should:

1. Receive the WhatsApp voice message.
2. Retrieve or download the audio.
3. Transcribe the student's speech.
4. Understand the student's request.
5. Generate an educational response.
6. Return the response through WhatsApp.

Depending on the configured response mode, the system may return:

- Text
- Generated audio / voice response
- Or eventually both

The long-term objective is to make Blindspot Edu feel accessible from the platform students already use daily.

---

# 3. Current Connection Situation

The project currently has:

- A dedicated WhatsApp Business number.
- The number connected to **Zernio**.
- Zernio intended to act as the communication layer between WhatsApp and the Blindspot Edu backend.

The exact implementation must use the API, webhook, authentication, media handling, and message format exposed by the connected Zernio setup.

Do not hardcode assumptions about Zernio's API structure.

Before implementing the integration, inspect the available Zernio connection details and determine:

- How incoming messages are delivered.
- Whether incoming events use webhooks.
- The structure of incoming message payloads.
- How outgoing messages are sent.
- How media is accessed or downloaded.
- How message IDs and conversation identifiers are represented.
- How the WhatsApp sender is identified.
- What authentication credentials are required.
- Whether webhook signatures must be verified.

---

# 4. Design Principle: WhatsApp Is a Channel, Not a Separate AI System

The biggest architectural rule is:

> Do not build a completely independent AI chatbot specifically for WhatsApp.

The WhatsApp layer should primarily act as a communication adapter.

The desired flow is:

```text
Student
   ↓
WhatsApp
   ↓
Zernio
   ↓
Blindspot WhatsApp Webhook / Adapter
   ↓
Message Normalization
   ↓
Blindspot Edu Intelligence Layer
   ↓
Response Generation
   ↓
WhatsApp Response Adapter
   ↓
Zernio
   ↓
Student
```

This separation is important.

The WhatsApp-specific code should understand:

- Incoming WhatsApp events
- Message types
- Media handling
- Sender identity
- Outgoing WhatsApp messages

The core Blindspot Edu system should understand:

- Educational questions
- Lecture context
- Learning plans
- Teaching phases
- Conversation state
- Student learning context
- AI responses

This prevents WhatsApp-specific logic from spreading throughout the entire application.

---

# 5. Relationship With the Existing Blindspot Edu Architecture

Blindspot Edu already contains several important systems.

These include:

- Lecture processing
- Timestamped transcripts
- A central knowledge base
- AI-generated learning plans
- Teaching phases
- AI orchestration
- Text and voice interaction
- TTS
- Transcription
- Quiz functionality
- Knowledge graph functionality
- Interactive AI whiteboard

The WhatsApp integration should connect into these existing capabilities where appropriate.

Conceptually:

```text
                    ┌──────────────────────────┐
                    │      Blindspot Edu        │
                    │   Core Intelligence      │
                    └────────────┬─────────────┘
                                 │
             ┌───────────────────┼───────────────────┐
             │                   │                   │
             ▼                   ▼                   ▼
        Web Application      AI Whiteboard       WhatsApp
             │                   │                   │
             └───────────────────┴───────────────────┘
                         Student Interaction
```

WhatsApp should become an additional interface rather than a separate product.

---

# 6. Proposed High-Level Architecture

The system should contain a dedicated WhatsApp integration layer.

A conceptual backend structure could be:

```text
backend/
│
├── api/
│   ├── lectures/
│   ├── sessions/
│   └── whatsapp/
│
├── ai/
│   ├── transcription/
│   ├── planning/
│   ├── orchestrator/
│   ├── tts/
│   ├── perception/
│   └── ...
│
├── integrations/
│   └── whatsapp/
│       ├── provider adapter
│       ├── incoming message handling
│       ├── outgoing message handling
│       └── media handling
│
├── services/
│   └── conversation and context services
│
└── schemas/
```

The exact folder structure may change depending on the existing repository. The key principle is separation of responsibilities.

---

# 7. The WhatsApp Processing Pipeline

Every incoming message should pass through a consistent pipeline.

```text
1. Incoming WhatsApp Event
        ↓
2. Webhook Validation
        ↓
3. Duplicate Event Detection
        ↓
4. Parse Provider Payload
        ↓
5. Normalize Message
        ↓
6. Identify User / Conversation
        ↓
7. Determine Message Type
        ↓
8. Process Content
        ↓
9. Retrieve Relevant Blindspot Context
        ↓
10. Generate Response
        ↓
11. Format Response for WhatsApp
        ↓
12. Send Response
        ↓
13. Persist Interaction State
```

The agent should preserve this logical separation.

Do not create one massive webhook function responsible for everything.

---

# 8. Incoming Message Normalization

Different WhatsApp message types may arrive with different payload structures.

Blindspot Edu should convert provider-specific events into an internal, provider-independent format.

Conceptually, every incoming message should contain information such as:

```text
NormalizedMessage
    message_id
    conversation_id
    user_identifier
    timestamp
    message_type
    text_content
    media_reference
    reply_to_message
    raw_metadata
```

Possible message types include:

- Text
- Audio / voice note
- Image
- Document
- Unsupported or unknown

The rest of the Blindspot system should ideally work with this normalized structure rather than directly with Zernio-specific payloads.

This will make it easier to replace or add providers later.

---

# 9. User and Conversation Identity

A major architectural requirement is identifying the user consistently.

When a message arrives, the system should determine:

- Who sent it?
- Does this sender already have a Blindspot Edu identity?
- Is there an existing conversation?
- Is there active educational context?
- Is the user currently studying a specific lecture or topic?

A WhatsApp sender should initially be identifiable through the identifier supplied by the provider, such as a phone-based identifier.

However, the system should avoid permanently tying all internal architecture to WhatsApp identifiers.

Instead, conceptually maintain:

```text
Blindspot User
      │
      ├── Web Identity
      ├── WhatsApp Identity
      └── Future Channel Identities
```

This allows one student to eventually have the same learning context across multiple Blindspot interfaces.

---

# 10. Conversation Context

Blindspot Edu should not treat every incoming WhatsApp message as an isolated request.

A conversation context system is required.

The system should be able to maintain information such as:

- Recent messages
- Recent AI responses
- Current topic
- Current learning phase
- Active lecture, if any
- Active session
- Relevant concepts
- User preferences where applicable

However, the system should not blindly send an entire conversation history to the LLM every time.

A context-building layer should decide what is relevant.

Conceptually:

```text
Incoming User Message
        +
Recent Conversation
        +
Current Educational Context
        +
Relevant Knowledge Base Information
        ↓
Context Builder
        ↓
AI Orchestrator
```

---

# 11. Text Chat — Phase One

Text interaction is the simplest initial WhatsApp capability.

## 11.1 Expected Flow

```text
Student sends text
        ↓
WhatsApp receives it
        ↓
Zernio forwards event
        ↓
Blindspot webhook receives event
        ↓
Message normalized
        ↓
User identified
        ↓
Context retrieved
        ↓
AI understands request
        ↓
Response generated
        ↓
Response sent back through WhatsApp
```

## 11.2 Example Interactions

### General educational question

Student:

> What is recursion?

Blindspot Edu:

> Recursion is...

### Follow-up question

Student:

> Can you explain that more simply?

The system should understand that "that" refers to the previous discussion.

### Blindspot learning interaction

Student:

> Explain phase 3 again.

If the student has an active Blindspot learning session associated with their identity, the system should be capable of locating the relevant phase.

### Lecture-specific question

Student:

> Where was normalization discussed?

The system may eventually use the lecture knowledge base and timestamp search capabilities.

---

# 12. Voice Notes — Phase Two

Voice notes are a major part of the WhatsApp experience.

The student should be able to send a normal WhatsApp voice message instead of typing.

## 12.1 Incoming Voice Pipeline

```text
Student records voice note
        ↓
WhatsApp
        ↓
Zernio
        ↓
Incoming media event
        ↓
Retrieve media reference / download audio
        ↓
Validate file
        ↓
Convert format if necessary
        ↓
Speech-to-Text
        ↓
Normalized text request
        ↓
Context retrieval
        ↓
AI response generation
```

The transcription system should preferably reuse Blindspot Edu's existing transcription architecture where practical.

The system should distinguish between:

- Lecture transcription
- User voice message transcription

They may use the same underlying provider or model, but they serve different purposes and may require different processing pipelines.

---

# 13. Voice Responses

After understanding a student's voice note, Blindspot Edu can respond in different ways.

## Mode A — Text Response

```text
Voice Input
→ Transcription
→ AI
→ Text Reply
```

This should be the simplest reliable version.

## Mode B — Voice Response

```text
Voice Input
→ Transcription
→ AI
→ TTS
→ Audio Reply
```

This creates a more natural conversational experience.

## Mode C — Intelligent Response Selection

Eventually, Blindspot Edu may decide which format is most appropriate.

For example:

- Short factual answer → text
- Detailed explanation → audio
- Complex explanation → text + audio

For the initial implementation, keep this decision explicit and predictable.

---

# 14. Important Voice Message Considerations

The implementation should account for:

- Media download failures
- Unsupported formats
- Large audio files
- Transcription errors
- Empty or silent audio
- Very long voice messages
- Background noise

The system should not fail silently.

When processing fails, the student should receive a useful response explaining that the message could not be processed.

The system should also avoid blocking the incoming webhook for long-running AI operations.

The general architecture should support asynchronous processing where required.

---

# 15. Image OCR — Future Phase

Later, students should be able to send images.

The first major image capability is OCR.

Example:

> [Student sends a photograph of handwritten or printed notes]

Blindspot Edu should eventually be able to:

1. Receive the image.
2. Retrieve the media.
3. Validate the image.
4. Run OCR.
5. Extract text.
6. Use the extracted content as educational context.
7. Answer the student's question.

Example interaction:

Student sends an image of a mathematical question and says:

> Explain this.

The future pipeline could be:

```text
Image
   ↓
Media Retrieval
   ↓
Image Validation
   ↓
OCR
   ↓
Extracted Text
   ↓
Optional Image Understanding
   ↓
Context Builder
   ↓
Blindspot Edu
   ↓
Educational Response
```

---

# 16. OCR Is Not the Same as Image Understanding

The future architecture should keep these capabilities conceptually separate.

## OCR

OCR answers:

> What text is present in this image?

Examples:

- Notes
- Printed text
- Typed questions
- Screenshots

## Image Understanding

Image understanding answers:

> What does this image represent?

Examples:

- Diagrams
- Graphs
- Scientific illustrations
- Circuit diagrams
- Handwritten mathematical work

A system may eventually combine both.

Do not design the initial OCR implementation in a way that makes future visual understanding difficult to add.

---

# 17. Future Educational Image Interaction

Eventually, WhatsApp could support interactions such as:

### Question from notes

Student:

> [Image of notes]
>
> Explain this topic.

### Homework assistance

Student:

> [Image of a question]
>
> Help me understand how to solve this.

### Blindspot identification

Student:

> [Image of handwritten work]
>
> Where did I go wrong?

### Diagram explanation

Student:

> [Image of a diagram]
>
> Explain how this works.

These should be considered future capabilities rather than requirements for the first WhatsApp release.

---

# 18. Message Routing

The WhatsApp system requires an internal decision layer that determines how to process an incoming message.

Conceptually:

```text
Incoming Message
        ↓
What type is it?
        │
        ├── Text ───────────────→ Text Handler
        │
        ├── Voice ──────────────→ Audio Handler
        │
        ├── Image ──────────────→ Image Handler
        │
        ├── Document ───────────→ Document Handler
        │
        └── Unknown ────────────→ Unsupported Message Handler
```

After each message is converted into useful information, it should move toward a common AI interaction layer.

For example:

```text
Text ───────────────┐
Voice → Transcript ─┤
Image → OCR/Text ───┤
                    ↓
             Unified User Request
                    ↓
              Context Builder
                    ↓
              AI Orchestrator
```

This is an important architectural decision.

The AI should ideally receive a standardized representation of the user's request rather than requiring separate AI systems for every WhatsApp message type.

---

# 19. Connection to the AI Orchestrator

Blindspot Edu already has an orchestration concept responsible for live educational interaction.

The WhatsApp integration should connect to this intelligence layer rather than directly making uncontrolled LLM calls everywhere.

The WhatsApp layer should effectively say:

> Here is the user, their message, their available context, and the input type.

The AI orchestration layer should decide:

- How to interpret the request.
- Whether the request relates to an active learning phase.
- Whether lecture knowledge should be searched.
- Whether a general educational answer is appropriate.
- Whether a previous response should be used as context.
- What the response should contain.

Conceptually:

```text
WhatsApp Adapter
        ↓
Normalized Request
        ↓
Blindspot Context Service
        ↓
AI Orchestrator
        ↓
Educational Response
        ↓
WhatsApp Response Adapter
```

---

# 20. Connecting WhatsApp to Lectures

This is one of the strongest potential features.

Eventually, a student should be able to discuss a lecture from WhatsApp.

Possible flow:

```text
Student has processed a lecture in Blindspot
        ↓
Lecture has transcript + learning plan + embeddings
        ↓
Student connects WhatsApp identity
        ↓
Student asks question through WhatsApp
        ↓
System identifies relevant lecture/context
        ↓
Relevant transcript segments retrieved
        ↓
AI answers using lecture context
```

Potential questions include:

> What did the professor say about normalization?

> Explain the second topic from today's lecture.

> Where was recursion mentioned?

> Quiz me on the database lecture.

This should eventually connect WhatsApp to the existing Blindspot knowledge base rather than creating a new isolated source of knowledge.

---

# 21. "Show Me Where You Learned That" Through WhatsApp

Blindspot Edu's traceability feature is a core differentiator.

The WhatsApp version should eventually preserve this philosophy.

If a student asks:

> Where did you get that information from?

The system should be capable of identifying relevant source material.

Since WhatsApp does not have the same UI as the web application, possible responses could include:

- Timestamp information
- A deep link to the relevant lecture in Blindspot
- A link that opens the lecture at the relevant timestamp
- A short quoted source segment where appropriate

The exact user experience can be designed later, but the architecture should preserve source references during WhatsApp interactions.

---

# 22. WhatsApp and the Interactive Whiteboard

The WhatsApp interface cannot replace the full interactive web whiteboard.

However, the two systems can eventually work together.

For example, a student could message:

> Can you show me how this algorithm works visually?

Blindspot Edu could:

1. Generate or prepare a visual teaching session.
2. Create a web-accessible learning session.
3. Send the student a secure link through WhatsApp.

The student then moves from:

```text
WhatsApp Conversation
        ↓
Request for Visual Explanation
        ↓
Blindspot Edu Whiteboard Session
        ↓
Interactive Web Experience
```

This creates a strong multi-channel experience.

WhatsApp can be the fast conversational entry point, while the web application handles complex visual interactions.

---

# 23. Data Persistence

Important information from WhatsApp interactions should be stored where appropriate.

Potential persisted information includes:

- User identity mapping
- Conversation ID
- Incoming message IDs
- Message type
- Message timestamps
- Processed text/transcription
- AI responses
- Associated learning session
- Associated lecture
- Processing status

Do not necessarily store raw media permanently unless required.

Storage decisions should consider:

- Cost
- Privacy
- Debugging requirements
- Educational value
- Retention policies

The data model should distinguish between:

```text
Raw Message Metadata
Processed Educational Content
Conversation Context
Long-Term Learning Data
```

Not everything received from WhatsApp needs to become permanent long-term memory.

---

# 24. Idempotency and Duplicate Events

Webhook systems may deliver the same event more than once.

The implementation must account for this.

Every incoming message should be associated with a unique external message identifier where available.

Before processing:

```text
Has this event/message already been processed?
        │
        ├── Yes → Do not process again
        │
        └── No → Continue processing
```

This prevents:

- Duplicate AI responses
- Duplicate database records
- Repeated transcription
- Unnecessary AI costs

This is a critical production-quality requirement.

---

# 25. Webhook Security

The WhatsApp webhook endpoint should not blindly trust every incoming HTTP request.

The implementation should inspect the security mechanisms provided by Zernio and implement appropriate verification.

Potential considerations include:

- Shared webhook secrets
- Signature verification
- Authentication headers
- Timestamp validation
- Replay protection

The coding agent should determine the exact supported method from the Zernio integration configuration and documentation.

Do not invent a security format.

---

# 26. Error Handling Philosophy

The student-facing WhatsApp experience should degrade gracefully.

Examples:

### Audio processing fails

Respond with something like:

> I couldn't process that voice note properly. Please try sending it again.

### AI processing temporarily fails

Respond without exposing internal errors.

### Image type is unsupported

Explain what formats are currently supported.

### The user sends an unknown message type

Acknowledge the limitation clearly.

Internal technical details should be logged for developers but not exposed to the student.

---

# 27. Logging and Observability

The system should make debugging possible.

For each major message flow, the system should be able to trace:

```text
Incoming Provider Event
        ↓
Normalized Message
        ↓
User Identification
        ↓
Media Processing
        ↓
Context Retrieval
        ↓
AI Request
        ↓
AI Response
        ↓
Outgoing WhatsApp Message
```

Logs should include useful identifiers while avoiding unnecessary exposure of sensitive content.

The system should be able to answer questions such as:

- Did the webhook receive the message?
- Was it identified as text or audio?
- Did media retrieval succeed?
- Did transcription succeed?
- Did the AI response generation succeed?
- Was the response successfully sent?

---

# 28. Asynchronous Processing

Some operations may take significant time.

Examples:

- Downloading large media
- Transcription
- OCR
- LLM processing
- TTS generation

The incoming webhook should not necessarily remain blocked until every operation is complete.

The architecture should support a processing workflow such as:

```text
Webhook Receives Event
        ↓
Validate Event
        ↓
Persist Processing Job
        ↓
Acknowledge Quickly
        ↓
Background Worker Processes Message
        ↓
Response Generated
        ↓
Send WhatsApp Reply
```

The exact background job technology should follow the existing Blindspot backend architecture.

The important requirement is that the system remains reliable as processing complexity increases.

---

# 29. Response Formatting for WhatsApp

The AI should not automatically send extremely long responses simply because it generated a long explanation.

WhatsApp is a conversational environment.

Responses should generally be:

- Clear
- Structured
- Readable on mobile
- Educational
- Not unnecessarily verbose

Long explanations can be broken into sections.

Future responses may contain:

- Text
- Audio
- Links
- Images or documents where supported
- Interactive prompts

The AI orchestration layer should be aware that the output channel is WhatsApp.

A response optimized for a full web interface may not be optimized for chat.

---

# 30. Suggested Development Phases

## Phase 1 — Provider Connection and Basic Text

Goal:

> A user sends a text message to the Blindspot WhatsApp number and receives an AI response.

Requirements:

- Verify incoming Zernio webhook communication.
- Parse incoming messages.
- Normalize message structure.
- Identify sender.
- Prevent duplicate processing.
- Pass text into the Blindspot Edu interaction layer.
- Send a text response through Zernio.
- Log the full lifecycle.

Do not start OCR or complex voice features until this path is stable.

---

## Phase 2 — Conversation Context

Goal:

> Blindspot Edu remembers the relevant context of a conversation.

Requirements:

- Conversation identification.
- Recent message retrieval.
- AI response persistence.
- Context building.
- Follow-up question support.

Example:

```text
User: Explain recursion.

AI: ...

User: Give me an example.

AI understands "an example" refers to recursion.
```

---

## Phase 3 — Voice Notes

Goal:

> A student can send a voice note and receive an educational response.

Requirements:

- Detect incoming audio.
- Retrieve media.
- Validate and prepare audio.
- Transcribe.
- Process resulting text.
- Generate a response.
- Return text initially.
- Add voice responses after the basic pipeline is stable.

---

## Phase 4 — Voice Response

Goal:

> Blindspot can communicate naturally through audio.

Requirements:

- Generate TTS from the AI response.
- Prepare the audio in a format suitable for the WhatsApp provider.
- Send audio back to the student.
- Handle TTS failures gracefully.

---

## Phase 5 — Blindspot Learning Context

Goal:

> WhatsApp interactions can connect with the student's Blindspot learning environment.

Requirements:

- Associate WhatsApp identity with Blindspot identity.
- Retrieve relevant lectures.
- Access learning plans.
- Access transcript knowledge.
- Support lecture-specific questions.
- Support traceability where possible.

---

## Phase 6 — Image OCR

Goal:

> Students can send images containing educational text.

Requirements:

- Receive image events.
- Retrieve media.
- Validate images.
- Run OCR.
- Normalize extracted text.
- Pass text into the AI context.
- Return an educational answer.

---

## Phase 7 — Advanced Image Understanding

Goal:

> Blindspot Edu understands educational visuals, not only text.

Potential capabilities:

- Diagram explanation
- Mathematical expression interpretation
- Scientific figure analysis
- Handwritten work analysis
- Error identification

This should remain separate from basic OCR.

---

## Phase 8 — Cross-Platform Experiences

Goal:

> WhatsApp becomes a gateway into the full Blindspot ecosystem.

Examples:

- WhatsApp question → web whiteboard session
- WhatsApp question → relevant lecture timestamp
- WhatsApp request → generated quiz
- WhatsApp → continuation of a web learning session

---

# 31. Recommended First Milestone

The very first working version should be extremely focused:

```text
Student
   ↓
Sends Text Message on WhatsApp
   ↓
Zernio
   ↓
Blindspot Webhook
   ↓
Normalize Message
   ↓
Blindspot Edu
   ↓
Generate Text Response
   ↓
Zernio
   ↓
WhatsApp Reply
```

Only after this works reliably should the project move to:

```text
Conversation Context
        ↓
Voice Notes
        ↓
Voice Responses
        ↓
Lecture Integration
        ↓
Image OCR
        ↓
Advanced Visual Understanding
```

---

# 32. CLI AI Agent Implementation Instructions

The coding agent working on this project should follow these principles.

## First: Inspect Before Changing

Before implementing anything:

1. Inspect the existing Blindspot repository.
2. Identify the current backend framework.
3. Identify the existing AI orchestration flow.
4. Identify current database models and schemas.
5. Identify existing transcription and TTS services.
6. Identify current storage mechanisms.
7. Avoid duplicating existing capabilities.

The WhatsApp integration should extend the project.

It should not rebuild existing Blindspot functionality.

---

## Second: Build in Small Verifiable Steps

Do not attempt to build:

- Text
- Voice
- OCR
- Context
- Media
- Cross-platform learning

all at once.

Complete one stable pipeline before moving to the next.

Recommended order:

1. Incoming webhook.
2. Outgoing test message.
3. Incoming text → response.
4. Persistence and duplicate protection.
5. Conversation context.
6. Voice message transcription.
7. Voice responses.
8. Lecture integration.
9. Image OCR.
10. Advanced features.

After each stage, verify the complete flow before proceeding.

---

## Third: Preserve Separation of Responsibilities

Keep separate:

### Provider Adapter

Responsible for:

- Zernio communication
- Provider payload parsing
- Outgoing messages

### Message Processing

Responsible for:

- Message type routing
- Normalization
- Media processing

### Context Layer

Responsible for:

- Conversation history
- User context
- Educational context

### AI Layer

Responsible for:

- Understanding requests
- Generating educational responses
- Connecting with existing Blindspot intelligence

The provider adapter should not contain the educational AI logic.

---

## Fourth: Do Not Hardcode Provider Assumptions

Zernio-specific details should be isolated.

If a provider is replaced later, the core Blindspot Edu system should require minimal or no changes.

Conceptually:

```text
WhatsAppProvider Interface
        │
        ├── Zernio Adapter
        │
        └── Future Provider Adapter
```

---

# 33. Final Product Vision

The WhatsApp integration should eventually make Blindspot Edu feel like a learning companion that students can access immediately.

A student could:

```text
Wake up
   ↓
Open WhatsApp
   ↓
Send a voice note:
"I didn't understand yesterday's database lecture."
   ↓
Blindspot Edu understands the request
   ↓
Retrieves relevant learning context
   ↓
Explains the concept
   ↓
Student asks:
"Can you show me visually?"
   ↓
Blindspot creates or opens a visual learning experience
   ↓
Student continues on the interactive web whiteboard
```

The important idea is continuity.

The student should not feel like they are switching between unrelated tools.

They should feel like they are interacting with **one Blindspot Edu system through multiple interfaces**.

---

# 34. Core Architecture Summary

The entire system can be summarized as:

```text
                         ┌───────────────────┐
                         │     Student       │
                         └─────────┬─────────┘
                                   │
                              WhatsApp
                                   │
                                   ▼
                         ┌───────────────────┐
                         │      Zernio       │
                         │ Provider Layer    │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ WhatsApp Adapter  │
                         │ / Webhook Layer   │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ Message Router    │
                         └─────────┬─────────┘
                                   │
              ┌────────────────────┼───────────────────┐
              │                    │                   │
              ▼                    ▼                   ▼
           Text Handler       Voice Handler       Image Handler
              │                    │                   │
              │                Transcription          OCR
              │                    │                   │
              └────────────────────┼───────────────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ Context Builder   │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ Blindspot Edu      │
                         │ Orchestrator      │
                         └─────────┬─────────┘
                                   │
                      ┌────────────┼────────────┐
                      │            │            │
                      ▼            ▼            ▼
                 Text Reply     TTS Audio    Web Session
                      │            │            │
                      └────────────┼────────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ WhatsApp Response │
                         │ Adapter           │
                         └─────────┬─────────┘
                                   │
                                   ▼
                              Zernio
                                   │
                                   ▼
                                Student
```

---

# 35. The Most Important Rule

**Build the WhatsApp integration as a channel adapter around Blindspot Edu, not as another isolated chatbot.**

Everything should eventually contribute toward one connected educational system:

- Lecture intelligence
- AI teaching
- Conversation
- Voice
- Knowledge context
- Traceability
- Interactive visuals
- WhatsApp accessibility

That is the architecture this integration should protect from the beginning.


---

# 36. Step-by-Step Build Order — Implementation Roadmap for the CLI AI Agent

This section is the **practical build sequence** for implementing the WhatsApp integration.

The agent should follow the phases in order. Do not attempt to implement every future capability simultaneously.

Each step should be completed and verified before moving to the next step.

---

## STEP 0 — Inspect the Existing Blindspot Edu Project

Before creating or modifying the WhatsApp integration, inspect the existing project.

Understand:

- Current backend framework and application entry point.
- Existing API and route structure.
- Existing database and ORM models.
- Existing schemas.
- Current AI orchestrator.
- Existing transcription capability.
- Existing TTS capability.
- Existing storage/media infrastructure.
- Existing user or session system.
- Existing lecture and learning-plan data flow.
- Existing environment-variable configuration.

### Goal

The WhatsApp integration must fit into the existing Blindspot architecture.

Do not duplicate:

- AI orchestration logic
- Transcription systems
- TTS systems
- Database infrastructure
- Context management

where existing project components can be reused.

### Verification

Before implementation begins, document internally where each WhatsApp component will connect to the existing application.

---

## STEP 1 — Understand and Configure the Zernio Connection

The WhatsApp number is already connected to Zernio.

The next task is understanding the actual integration mechanism available through that connection.

Determine:

- How Zernio sends incoming WhatsApp events.
- The webhook URL requirements.
- Required authentication.
- Incoming payload structure.
- Text-message payload structure.
- Voice-message payload structure.
- Image payload structure.
- Media download mechanism.
- Outgoing message API.
- Available message IDs.
- Conversation or sender identifiers.
- Webhook security/signature requirements.

### Important Rule

Do not invent or assume Zernio API fields.

Build the integration around the actual API and webhook information provided by the connected Zernio account.

### Goal

Understand exactly how data moves:

```text
WhatsApp → Zernio → Blindspot Backend
```

and:

```text
Blindspot Backend → Zernio → WhatsApp
```

### Verification

Successfully confirm:

1. The backend can receive a real incoming event.
2. The event can be inspected and logged safely.
3. The sender and message type can be identified.

Do not add AI processing yet.

---

## STEP 2 — Create the WhatsApp Integration Boundary

Create a dedicated logical integration layer for WhatsApp.

The purpose of this layer is to isolate Zernio-specific behavior from the rest of Blindspot Edu.

Conceptually:

```text
Zernio-Specific Data
        ↓
WhatsApp Provider Adapter
        ↓
Blindspot Internal Message Format
```

The adapter should be responsible for:

- Receiving provider events.
- Parsing provider-specific payloads.
- Sending provider-specific responses.
- Retrieving provider-hosted media where necessary.

The rest of Blindspot Edu should not need to know the detailed Zernio payload format.

### Goal

Create a clean boundary:

```text
External Provider Logic ≠ Blindspot Edu Logic
```

### Verification

A sample or real incoming event can be converted into one normalized internal message representation.

---

## STEP 3 — Build the Incoming Webhook Pipeline

Implement the initial incoming-event flow.

Conceptually:

```text
Incoming Webhook
        ↓
Validate Request
        ↓
Parse Payload
        ↓
Identify Event
        ↓
Extract Message
        ↓
Normalize Message
```

At this stage, the system should not yet perform complicated AI processing.

The priority is reliable message reception.

The system should extract information such as:

- External message ID
- Sender identifier
- Timestamp
- Message type
- Text, where applicable
- Media reference, where applicable

### Goal

Blindspot should reliably know:

> Who sent something, what they sent, and what type of message it was.

### Verification

Send a real WhatsApp text message and confirm the backend correctly recognizes:

- The sender
- The message
- The message type
- The unique message identifier

---

## STEP 4 — Add Webhook Security and Duplicate Protection

Before adding AI responses, make the incoming pipeline safe and reliable.

Implement the security method actually supported by Zernio.

Potential mechanisms may include:

- Signature verification
- Secret tokens
- Authentication headers

Use only the mechanisms confirmed by the provider setup.

Then add duplicate-message protection.

Webhook providers can sometimes retry events.

The system should follow this logic:

```text
Incoming Message
        ↓
Check Unique Message ID
        ↓
Already Processed?
       / \
     Yes   No
      │     │
      │     ↓
      │   Process
      │
      └→ Ignore Duplicate
```

### Goal

Prevent the same user message from generating multiple AI responses.

### Verification

Test duplicate event delivery or simulated repeated events and confirm only one processing flow occurs.

---

## STEP 5 — Implement Outgoing WhatsApp Messaging

Before connecting the AI, verify that Blindspot can send a message back to WhatsApp.

The first response can be completely static.

Example:

```text
Student: Hello

Blindspot: Message received successfully.
```

The exact response does not matter at this stage.

The goal is validating the complete communication path.

```text
Student
   ↓
WhatsApp
   ↓
Zernio
   ↓
Blindspot Backend
   ↓
Blindspot Backend generates test response
   ↓
Zernio
   ↓
Student receives response
```

### Verification

A real incoming WhatsApp message produces a real outgoing WhatsApp response.

This is the first major milestone.

---

# MILESTONE 1 — TWO-WAY WHATSAPP COMMUNICATION

At this point, the following must work reliably:

```text
WhatsApp Text
      ↓
Zernio
      ↓
Blindspot Webhook
      ↓
Message Normalization
      ↓
Static/Test Response
      ↓
Zernio
      ↓
WhatsApp
```

Do not proceed to complex features until this works.

---

## STEP 6 — Connect Text Messages to Blindspot Edu

Now connect the text-message pipeline to the existing Blindspot intelligence layer.

The desired flow is:

```text
Incoming Text
       ↓
Normalize Request
       ↓
Identify User/Conversation
       ↓
Build Relevant Context
       ↓
Blindspot Edu Orchestrator
       ↓
Generate Response
       ↓
WhatsApp Response Adapter
       ↓
Student
```

The WhatsApp route should not directly contain scattered LLM calls.

Instead, route requests through the appropriate existing Blindspot Edu layer.

### Initial Scope

Initially support simple educational questions such as:

> What is recursion?

> Explain binary search.

> What is normalization?

### Verification

Test several independent text questions and confirm:

- A response is generated.
- The response reaches WhatsApp.
- Internal processing failures do not expose technical errors to the user.

---

## STEP 7 — Add Conversation Persistence

Once basic text AI works, add conversation state.

Store the information required to support follow-up questions.

Example:

```text
Student: Explain recursion.

Blindspot: [Explanation]

Student: Give me a simpler example.
```

The second request must understand that it refers to recursion.

The context system should associate messages with:

- The WhatsApp user
- A conversation
- Message ordering
- Relevant recent interactions

Avoid automatically treating the entire historical conversation as permanent LLM context.

Instead, build a context-selection mechanism.

### Goal

Support natural multi-turn conversations.

### Verification

Run a multi-turn conversation containing references such as:

- "that"
- "it"
- "the previous concept"
- "give me another example"

and verify the system maintains context correctly.

---

## STEP 8 — Create the Message-Type Router

After text interaction is stable, create a centralized message router.

Conceptually:

```text
Normalized Incoming Message
            ↓
       Message Router
            │
    ┌───────┼────────┐
    ↓       ↓        ↓
  Text    Voice     Image
    │       │        │
    ↓       ↓        ↓
Handler  Handler   Handler
```

The router should make it easy to add future message types without rewriting the webhook.

At this point:

- Text should be fully supported.
- Voice and image paths may initially exist as planned/unsupported handlers until implemented.

### Goal

Prevent the main webhook from becoming a massive function containing all message-specific logic.

---

## STEP 9 — Build Voice Note Reception

Now begin the voice interaction system.

When a WhatsApp voice note arrives:

```text
Voice Event
    ↓
Identify Media
    ↓
Retrieve Media Reference
    ↓
Download/Retrieve Audio
    ↓
Validate Audio
    ↓
Prepare for Transcription
```

The implementation must determine the exact media retrieval process supported by Zernio.

Handle possible failures:

- Missing media
- Download failure
- Unsupported format
- Empty audio
- Corrupted file

### Goal

Successfully obtain the student's voice note in a form that the transcription system can process.

### Verification

Send multiple real voice notes through WhatsApp and confirm they are reliably available to the backend.

Do not add AI responses until audio retrieval is stable.

---

## STEP 10 — Connect Voice Notes to Speech-to-Text

Reuse the existing Blindspot transcription infrastructure where appropriate.

The flow should become:

```text
Voice Note
    ↓
Audio Retrieval
    ↓
Speech-to-Text
    ↓
Transcribed User Request
```

The result should then enter the same AI interaction pipeline used by text.

```text
Text Message ───────────────┐
                            │
Voice Note → Transcription ─┤
                            ↓
                   Unified User Request
                            ↓
                    Context Builder
                            ↓
                   Blindspot Edu
```

### Goal

A voice note should ultimately become an understandable text request.

### Verification

Test:

- Short voice notes
- Longer questions
- Different speaking speeds
- Moderate background noise

Check transcription quality before moving forward.

---

## STEP 11 — Voice Input to AI to Text Response

The first complete voice interaction should be:

```text
Student Voice Note
       ↓
Speech-to-Text
       ↓
Blindspot Context
       ↓
AI Processing
       ↓
Text Response
       ↓
WhatsApp
```

Do not immediately add TTS.

This intermediate stage is useful because it allows debugging of:

- Media retrieval
- Transcription
- Context building
- AI reasoning

without adding voice-output failures.

### Verification

A student can ask a question entirely through a WhatsApp voice note and receive a useful educational text response.

---

# MILESTONE 2 — TEXT AND VOICE INPUT

At this stage, Blindspot should support:

```text
TEXT INPUT  → AI → TEXT OUTPUT

VOICE INPUT → STT → AI → TEXT OUTPUT
```

Both flows should use the same core educational intelligence.

---

## STEP 12 — Add Voice Responses Through TTS

Only after voice input is stable should TTS be added.

The flow becomes:

```text
Voice Input
     ↓
STT
     ↓
Blindspot Edu
     ↓
Generate Text Response
     ↓
TTS
     ↓
Audio Response
     ↓
Zernio
     ↓
WhatsApp
```

The TTS system should ideally reuse the existing Blindspot TTS infrastructure.

The implementation must determine:

- What audio format WhatsApp/Zernio accepts.
- Whether conversion is required.
- Media upload requirements.
- Maximum practical response size.

### Verification

A student sends a voice note and receives a playable audio response.

---

## STEP 13 — Connect WhatsApp to Blindspot Educational Context

Now move beyond generic educational questions.

Begin connecting WhatsApp users with Blindspot data.

Potential context includes:

- Active lecture
- Processed lectures
- Learning plans
- Teaching phases
- Transcript chunks
- Knowledge graph
- Quiz data

The conceptual flow is:

```text
WhatsApp User
      ↓
Identify Blindspot User
      ↓
Find Relevant Educational Context
      ↓
Retrieve Relevant Data
      ↓
AI Orchestrator
      ↓
Educational Response
```

### Initial Priority

Start with lecture-specific questions.

Examples:

> What did my professor say about normalization?

> Explain the second phase again.

> Where was recursion discussed?

### Verification

Test against a genuinely processed Blindspot lecture rather than only mock data.

---

## STEP 14 — Add Traceability to WhatsApp Answers

Blindspot's major differentiator is traceability.

WhatsApp answers should eventually preserve source information when responding from lecture material.

Possible response capabilities include:

- Relevant timestamps
- Lecture titles
- Source snippets
- Deep links into the web application

Example conceptual interaction:

```text
Student:
Where did the professor explain normalization?

Blindspot:
Normalization was discussed around 24:35.

[Open relevant lecture section]
```

The initial version does not need to implement every possible user interface.

The architecture must simply preserve the source references required for future WhatsApp responses.

### Verification

A lecture-specific question can produce a response connected to a real source timestamp.

---

## STEP 15 — Add Image Reception

Only after text and voice are stable should image processing begin.

The initial image pipeline is:

```text
Incoming Image
       ↓
Media Retrieval
       ↓
Image Validation
       ↓
Image Processing
```

The system should identify:

- File type
- Size
- Media availability
- Processing failures

Do not immediately combine OCR and advanced vision.

Build image reception first.

### Verification

A real WhatsApp image can be received and safely made available to the backend processing pipeline.

---

## STEP 16 — Add OCR

After image reception works, add Optical Character Recognition.

The pipeline becomes:

```text
Image
   ↓
OCR
   ↓
Extract Text
   ↓
Normalize Extracted Content
   ↓
Context Builder
   ↓
Blindspot Edu
   ↓
Educational Response
```

Initial use cases:

- Printed notes
- Screenshots
- Typed questions
- Educational text

### Verification

Send an image containing educational text and ask:

> Explain this.

Confirm that extracted information is correctly used in the response.

---

## STEP 17 — Add Advanced Image Understanding

This is a later-stage feature.

OCR is not enough for:

- Diagrams
- Graphs
- Circuit designs
- Mathematical working
- Scientific illustrations
- Handwritten problem-solving

The future system may use a vision-capable model.

The conceptual pipeline could become:

```text
Image
   ├── OCR → Text Information
   │
   └── Vision → Visual Information
             │
             ▼
      Unified Image Context
             ↓
       Blindspot Edu
```

### Important Rule

Do not make advanced vision a requirement for the initial WhatsApp release.

---

## STEP 18 — Connect WhatsApp Requests to the Interactive Whiteboard

This is a future high-value integration.

A WhatsApp user may ask:

> Explain this visually.

The WhatsApp system should eventually be able to recognize that a chat response is not the ideal interface.

Instead:

```text
WhatsApp Request
       ↓
Blindspot Determines Visual Explanation Is Useful
       ↓
Create/Prepare Visual Learning Session
       ↓
Generate Secure Web Link
       ↓
Send Link Through WhatsApp
       ↓
Student Opens Blindspot Whiteboard
```

WhatsApp remains the conversational entry point.

The full web application handles complex interactive visual learning.

---

## STEP 19 — Add Quiz and Learning Actions

Later, WhatsApp can trigger other Blindspot capabilities.

Examples:

> Quiz me on today's lecture.

> Give me five questions about recursion.

> Continue my previous learning session.

> Explain phase 3 again.

These requests should route into existing Blindspot capabilities rather than creating separate quiz or teaching logic specifically for WhatsApp.

---

## STEP 20 — Full End-to-End Testing

Once the main features exist, test the entire system as a user would.

Test:

### Text

```text
Text → Context → AI → Text Response
```

### Voice

```text
Voice → STT → Context → AI → Text/Voice Response
```

### Lecture Context

```text
Question → Knowledge Base Search → AI → Source-Aware Response
```

### Images

```text
Image → OCR/Vision → AI → Educational Response
```

### Cross-Platform Experience

```text
WhatsApp → Visual Request → Blindspot Web Experience
```

Test real WhatsApp communication, not only mocked API payloads.

---

# 37. Final Recommended Build Sequence

The CLI AI agent should follow this exact priority order:

```text
PHASE 0
Inspect Existing Blindspot Architecture
        ↓
PHASE 1
Understand Zernio + Receive Webhook
        ↓
PHASE 2
Normalize Messages + Security + Duplicate Protection
        ↓
PHASE 3
Send Static WhatsApp Response
        ↓
★ MILESTONE: TWO-WAY WHATSAPP COMMUNICATION
        ↓
PHASE 4
Text → Blindspot Edu → Text Response
        ↓
PHASE 5
Conversation Context
        ↓
PHASE 6
Message-Type Router
        ↓
PHASE 7
Receive Voice Notes
        ↓
PHASE 8
Voice → Speech-to-Text
        ↓
PHASE 9
Voice → AI → Text Response
        ↓
★ MILESTONE: TEXT + VOICE INPUT
        ↓
PHASE 10
AI → TTS → Voice Response
        ↓
PHASE 11
Connect to Blindspot Lectures and Learning Plans
        ↓
PHASE 12
Add Source Traceability
        ↓
PHASE 13
Receive Images
        ↓
PHASE 14
Image OCR
        ↓
PHASE 15
Advanced Image Understanding
        ↓
PHASE 16
Interactive Whiteboard Integration
        ↓
PHASE 17
Advanced Learning Actions and Full Ecosystem Integration
```

---

# 38. Development Philosophy

The coding agent should follow one overriding principle:

> **Build one complete working interaction path at a time.**

Do not build ten partially functioning systems simultaneously.

The correct progression is:

```text
Receive
    ↓
Understand
    ↓
Respond
    ↓
Add Context
    ↓
Add New Input Type
    ↓
Reuse Existing Blindspot Intelligence
    ↓
Expand Capabilities
```

The WhatsApp integration becomes powerful not because it has the largest number of features, but because every new interaction type connects cleanly into the same Blindspot Edu intelligence.

The final objective remains:

> **One AI learning ecosystem, accessible through multiple interfaces.**
