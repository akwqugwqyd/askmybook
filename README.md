# AskMyBook

A production-oriented, private document Q&A application built with Next.js. Users upload multiple PDFs, choose one document, a selected set, or their entire knowledge base, and receive answers grounded only in retrieved passages with page-level citations.

## Product behavior

- Multi-file PDF upload with independent processing and retry states
- Single-document, selected-document, and full-knowledge-base queries
- Clerk authentication and ownership checks at every database/API boundary
- User-isolated Pinecone namespaces plus document metadata filters
- Page-aware text extraction and recursive, overlapping chunks
- Agentic retrieval with query decomposition, relevance grading, synthesis, and support checking
- Persistent conversations whose retrieval scope is stored server-side
- Citations containing document ID/name, page, chunk ID, excerpt, and relevance score
- Daily per-user AI request limits
- Cascading deletion across Cloudinary, Pinecone, chunks, messages, and scoped conversations
- Token-aware, heading-aware chunks with embedding and pipeline version lineage
- MongoDB query/answer caches invalidated by re-indexing and deletion
- Trace IDs, token/cost accounting, retrieval relevance, latency, and faithfulness telemetry
- Server-allowlisted admin metrics and authenticated same-origin PDF previews

The answer pipeline is deliberately closed-book. If relevant evidence is not found, it says the selected uploads do not contain enough information.

## Architecture

```text
Browser
  ├─ /dashboard       document selection, status, retries, deletion
  ├─ /books/new       bounded multi-file ingestion
  └─ /chat            persistent multi-document Q&A
          │
          ▼
Next.js route handlers + Clerk auth
  ├─ MongoDB          documents, chunk audit records, conversations, messages, limits
  ├─ Cloudinary       authenticated source PDFs
  ├─ OpenAI           embeddings, routing, grading, grounded answer generation
  └─ Pinecone         namespace=userId, filter=documentId
```

### Data model

- `Book`: source document metadata, owner, storage reference, processing lifecycle, counts, failures
- `Chunk`: durable audit record for each vector ID and its source/page/chunk metadata
- `Conversation`: owner, title, `selected | all` scope, fixed selected document IDs
- `ChatMessage`: conversation, role, content, structured citations
- `User`: daily AI usage counter
- `RagCache`: per-user query rewrites and grounded answers with TTL expiry
- `AiTrace`: 90-day operational, usage, cost, retrieval, and faithfulness metrics

`Book` is retained as the model name for compatibility with the original project; it represents any uploaded PDF document.

### Ingestion flow

1. `/api/upload` authenticates the user, validates the upload intent, and returns a short-lived signature scoped to a user-specific Cloudinary path.
2. The browser verifies the PDF magic bytes and uploads directly to authenticated Cloudinary storage. This avoids Vercel's 4.5 MB Function request-body limit without exposing the Cloudinary secret.
3. `/api/books` validates the returned storage reference and creates a user-owned `queued` document record.
4. `/api/books/:id/process` verifies ownership, marks the document `processing`, downloads it through a short-lived signed URL, and verifies the PDF signature server-side.
5. `pdf-parse` extracts text page by page. It runs as an external Node package so PDF.js workers are not bundled by Turbopack.
6. If a PDF has no text layer, a bounded OpenAI PDF-vision OCR fallback transcribes visible text while preserving page markers. OCR can be disabled or capped by size/page environment limits.
7. A token-aware, heading-aware splitter creates overlapping chunks while preserving page metadata.
8. Every vector receives:

```ts
{
  userId,
  documentId,
  documentName,
  chunkIndex,
  pageNumber
}
```

9. Vectors are written to the authenticated user's Pinecone namespace. MongoDB chunk records and stable vector IDs make retries and cleanup auditable.
10. The document becomes `ready`, or stores a stage-specific failure code for retry.

Processing requests are synchronous so serverless execution is not abandoned after an HTTP response. The browser uses a two-worker pool, keeping multi-file ingestion bounded. At larger scale, the processing route is the seam to replace with a durable queue/worker without changing the document lifecycle.

### Multi-document RAG flow

The chat API never trusts client document IDs directly:

1. It authenticates the Clerk user.
2. For selected scope, it validates the ID count/shape and loads every document with `{ userId, processingStatus: "ready" }`.
3. For full-library scope, it derives the ready document set from the authenticated user's records.
4. Existing conversations load their scope from MongoDB; clients cannot silently broaden it.
5. Retrieval uses `namespace = userId` and a Pinecone `$eq`/`$in` filter for the server-validated document IDs.
6. Low-scoring results are removed, remaining chunks are relevance-graded, and answers are generated only from those passages.
7. A support checker either accepts the grounded draft or performs a focused retrieval retry.
8. The assistant message and structured citations are persisted before the final NDJSON event is sent.

This provides defense in depth: another user's vectors are outside both the MongoDB ownership query and the Pinecone namespace.

## API surface

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/upload` | POST | Validate and sign a direct Cloudinary PDF upload |
| `/api/books` | GET, POST | List or create owned documents |
| `/api/books/:id` | GET, DELETE | Read or cascade-delete an owned document |
| `/api/books/:id/process` | POST | Process/retry/re-index an owned document |
| `/api/books/:id/preview` | GET | Stream an authenticated PDF preview |
| `/api/chat` | GET | Load an owned conversation |
| `/api/chat` | POST | Validate scope, retrieve, stream, and persist a grounded answer |
| `/api/conversations` | GET | List the user's recent conversations |
| `/api/dashboard` | GET | Return owned document and usage metrics |
| `/api/health` | GET | Check application/database health |
| `/api/admin/metrics` | GET | Return allowlisted operational and quality metrics |

`POST /api/chat` accepts:

```json
{
  "message": "Compare the recommendations in these documents.",
  "scope": "selected",
  "documentIds": ["..."],
  "conversationId": "optional-existing-conversation"
}
```

Use `"scope": "all"` for the full knowledge base. Responses stream newline-delimited JSON events (`status`, `final`, or `error`).

## Local setup

Requirements:

- Node.js 20+
- MongoDB
- Clerk application
- Cloudinary account
- OpenAI API key
- Pinecone index compatible with the selected embedding dimensions

```bash
npm install
cp .env.example .env.local
npm run dev
```

On PowerShell, copy with:

```powershell
Copy-Item .env.example .env.local
```

Required environment variables:

```dotenv
MONGODB_URI=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
OPENAI_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX=
```

Optional tuning:

```dotenv
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_OCR_MODEL=gpt-4o-mini
ENABLE_PDF_OCR=true
OCR_MAX_PDF_BYTES=10485760
OCR_MAX_PAGES=20
AI_DAILY_REQUEST_LIMIT=10
RAG_MIN_RELEVANCE_SCORE=0.25
EMBEDDING_VERSION=1
RAG_CHUNK_TOKENS=500
RAG_CHUNK_OVERLAP_TOKENS=75
RAG_CACHE_TTL_MS=3600000
QUERY_CACHE_TTL_MS=86400000
ADMIN_USER_IDS=
AI_INPUT_COST_PER_MILLION=0
AI_OUTPUT_COST_PER_MILLION=0
```

Changing the embedding model or dimensions requires a compatible Pinecone index and reprocessing existing documents.

## Verification

```bash
npm run type-check
npm run lint
npm run build
npm run test:providers
npm run test:rag
```

`test:providers` checks each configured provider independently. `test:rag` runs a generated PDF through extraction, chunk persistence, embeddings, vector indexing, filtered retrieval, grounded answering, and citations, then cleans every test artifact. `diagnose:processing` reports sanitized ingestion status. `diagnose:extraction` tests the newest failed upload locally without printing content. `diagnose:ocr` and `reprocess:document` send document content to configured external AI/vector providers and should only be run when that export is explicitly approved.

High-value integration scenarios:

1. Upload two PDFs and confirm their state transitions independently.
2. Ask a question against only document A; verify all returned citation `documentId` values are A.
3. Ask across A+B and verify citations can originate from either but never an unselected document.
4. Use full-library scope and verify only the authenticated user's ready documents are queried.
5. Ask an out-of-scope question and verify the insufficient-information response.
6. Attempt to retrieve/chat/delete another user's document ID and expect 404/409 without data leakage.
7. Delete a document and verify its vectors, chunk records, source file, legacy messages, and selected-scope conversations are removed.
8. Force extraction failure and verify the failed state and retry action.

## Deployment notes

- Import the Git repository into Vercel; the Next.js preset, `npm install`, `next build`, and `.next` output are auto-detected.
- Set every variable from `.env.production.example` in Vercel for the appropriate Production and Preview environments.
- Use a Clerk production instance (`pk_live_` / `sk_live_`) and a custom production domain. Keep development keys scoped to Preview/Development.
- Enable Vercel Fluid Compute. Text PDFs commonly finish within the free-plan 60-second ceiling; OCR and larger documents need a paid plan because processing and chat routes allow up to 300 seconds.
- PDFs upload directly from the browser to Cloudinary using a server-generated signature, avoiding Vercel's 4.5 MB Function payload limit.
- Deploy on the Node.js 20+ runtime; PDF parsing is not Edge-compatible.
- Keep the Pinecone index metric/model dimensions aligned.
- Cloudinary sources use authenticated delivery; never expose API secrets to the client.
- Route handlers perform authorization themselves in addition to Clerk middleware.
- Logs are structured around ingestion/chat lifecycle events and are ready to be forwarded by the hosting provider. Add Sentry/OpenTelemetry at the `logger` boundary when an external monitoring destination is selected.
- For sustained ingestion volume, enqueue `/process` jobs in a durable queue and run the existing processing service in a worker with leases/retries.

## Security decisions

- File extensions and MIME headers are insufficient; upload and processing both verify magic bytes.
- User ownership is included in all document, conversation, chunk, and chat operations.
- Pinecone isolation uses both a user namespace and server-derived document filters.
- AI limits fail closed if the limiter database is unavailable.
- Raw provider errors are logged server-side; API responses return safe messages.
- The upload UI limits concurrency, while server routes enforce their own size and selection limits.
