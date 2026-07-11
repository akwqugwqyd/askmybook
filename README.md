# AskMyBook

AskMyBook is a private document Q&A app built with Next.js. Users can upload PDFs, organize them into their own knowledge base, and ask questions against one document, a selected group of documents, or everything they have uploaded.

The assistant answers only from the uploaded documents and shows the sources it used.

## What it does

- Upload PDF documents
- Store files securely in Cloudinary
- Track document processing status
- Extract text from PDFs
- Split documents into searchable chunks
- Generate OpenAI embeddings
- Store vectors in Pinecone
- Search by selected document, multiple documents, or full knowledge base
- Generate grounded answers with citations
- Save chat history
- Delete documents and clean up related chunks, vectors, and chats
- Limit expensive AI requests per user

## Tech stack

- Next.js
- React
- TypeScript
- Clerk for authentication
- MongoDB with Mongoose
- Cloudinary for PDF storage
- OpenAI for embeddings and answers
- Pinecone for vector search
- Tailwind CSS

## How it works

```text
User uploads PDF
        |
        v
Cloudinary stores the file
        |
        v
The app extracts text from the PDF
        |
        v
Text is cleaned and split into chunks
        |
        v
Chunks are embedded with OpenAI
        |
        v
Vectors are stored in Pinecone with user/document metadata
        |
        v
User asks a question
        |
        v
The app retrieves relevant chunks and generates a grounded answer
```

Every chunk includes metadata such as:

```ts
{
  userId,
  documentId,
  documentName,
  chunkIndex,
  pageNumber
}
```

This keeps retrieval scoped to the authenticated user and the selected document set.

## Project structure

```text
app/
  api/              API routes for upload, documents, chat, dashboard
  books/            Upload flow
  chat/             Document Q&A interface
  dashboard/        Document dashboard

database/
  models/           MongoDB models

lib/
  ai/               AI, retrieval, embeddings, and RAG helpers
  document/         PDF processing and chunking logic
  env.ts            Environment validation
  vector-store.ts   Pinecone helpers

scripts/
  smoke tests and debugging tools
```

Some folders may be organized slightly differently as the app evolves, but the main idea is simple: UI lives in `app`, persistent data lives in `database`, and reusable backend logic lives in `lib`.

## Local setup

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env.local
```

On PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Add the required values:

```env
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

Start the app:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Useful scripts

```bash
npm run type-check
npm run lint
npm run build
```

Provider smoke test:

```bash
npm run test:providers
```

End-to-end RAG smoke test:

```bash
npm run test:rag
```

Debug document processing:

```bash
npm run diagnose:processing
```

Test extraction on the latest failed document:

```bash
npm run diagnose:extraction
```

## Environment notes

The app expects Node.js 20 or newer.

For Pinecone, make sure the index dimension matches the OpenAI embedding model. If you change the embedding model, you may need a new Pinecone index or a full document re-index.

By default, the app limits chat usage:

```env
AI_DAILY_REQUEST_LIMIT=10
```

You can tune chunking and retrieval with:

```env
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ENABLE_PDF_OCR=true
OCR_MAX_PAGES=20
RAG_CHUNK_TOKENS=500
RAG_CHUNK_OVERLAP_TOKENS=75
RAG_MIN_RELEVANCE_SCORE=0.25
```

## Deployment

The easiest deployment path is Vercel.

1. Push the project to GitHub.
2. Import the repo into Vercel.
3. Add the same environment variables from `.env.example`.
4. Use production Clerk keys for the production deployment.
5. Make sure MongoDB Atlas allows connections from Vercel.
6. Make sure your Pinecone index exists before deploying.
7. Deploy.

PDFs are uploaded directly from the browser to Cloudinary using a signed upload request, so large PDFs do not pass through the Vercel function body.

The app uses Node.js APIs for PDF processing, so API routes should run on the Node.js runtime, not Edge.

## Scaling notes

This version is a good portfolio project and a solid small-beta architecture.

It can handle a small group of users if documents are moderate in size and provider limits are configured correctly. The main bottleneck is document processing, because PDF extraction, OCR, embeddings, and vector indexing can take time.

For a larger production system, the next important step would be moving document processing into a background queue/worker system such as Inngest, Trigger.dev, BullMQ, or a dedicated worker service.

Other production upgrades would include:

- Upload quotas
- Monthly token limits
- Stronger retry logic
- More detailed observability
- Sentry or another error tracker
- Billing
- Admin tools for failed jobs
- Load testing

## Security

The app is designed around user isolation:

- Clerk protects authenticated routes.
- MongoDB queries include the current user ID.
- Pinecone search uses user and document metadata filters.
- Cloudinary files are served through signed URLs.
- Uploads are validated before processing.
- Chat answers are grounded in retrieved document chunks.

If the selected documents do not contain enough information, the assistant should say so instead of guessing.

## Current status

AskMyBook is ready to demo and suitable for a public portfolio repository. For real SaaS scale, the biggest next improvement is an async document-processing worker with retries and better usage controls.
