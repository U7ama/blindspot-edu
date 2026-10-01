# Adaptive release architecture

```mermaid
flowchart TD
    B[Browser: anonymous learner cookie] --> C[HTTPS reverse proxy]
    C --> N[Next.js workspace]
    C --> A[FastAPI: authorized adaptive API]
    A --> D[(SQLite WAL: ownership, state, attempts, jobs, budget)]
    A --> S[(Private S3 recordings and narration)]
    W[Single leased worker] --> D
    W --> S
    W --> T[CPU Whisper]
    T --> P[Coverage and whole-lecture verification]
    P --> M[Alibaba Cloud Model Studio: Qwen 3.7 Flash]
    A --> M
    A --> V[Polly cached English narration]
    V --> S
    D --> K[Daily verified backup]
    K --> S
```

A stored document contains exact transcript segment IDs. Phase evidence is checked against those excerpts. Supplementary teaching has its own label and never borrows a mention timestamp as proof of its claims. The browser never receives assessment keys before submission. Learning commands use revisions; repeated answer requests are idempotent.

The existing legacy tables remain intact. New tables use the `adaptive_` prefix. SQLite is backed up before missing tables are created. Legacy content can be exported for review using the admin CLI and reprocessed from original media; it is not automatically made public or assigned invented provenance.

The production reasoning calls currently use Alibaba Cloud Model Studio through an external API. The AWS-hosted application uses EC2, S3, Polly, Systems Manager, and CloudFormation. A Bedrock adapter exists but is not serving production traffic; AWS Support completed the account review on September 28 and could not approve Nova Lite and Titan Text Embeddings V2 access at this time, citing factors including payment history and usage. Any switch requires usable account access and the same lecture quality, evidence, latency, and cost checks. See [the submission guide](SUBMISSION_DRAFT.md) for the current provider statement and evidence.
