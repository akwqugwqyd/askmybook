# AskMyBook

AskMyBook is a Next.js app for uploading documents, data files, and images, then asking grounded questions against them.

## Requirements

- Node.js 22+
- MongoDB
- Clerk
- Cloudinary
- OpenAI API key
- Pinecone index and API key

## Local setup

Install dependencies:

```bash
npm install
```

Create a local env file:

```powershell
Copy-Item .env.example .env.local
```

Fill in these required values:

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

Run the app:

```bash
npm run dev
```

## Checks

```bash
npm run lint
npm run type-check
npm run build
```

## Evals and observability

The production RAG path exports redacted OpenTelemetry/OpenInference spans to Arize Phoenix. A committed golden dataset is executed through real ingestion, hybrid retrieval, reranking, answer generation, and citations, then scored and regression-gated with Ragas.

See [Evals and observability](docs/evals-observability.md) for setup, local testing, CI, privacy controls, thresholds, and production configuration.

## Deploy

1. Push the repo to GitHub.
2. Import it into Vercel.
3. Add the same environment variables in Vercel.
4. Deploy.

## Notes

- The app uses Node.js runtime APIs for PDF processing.
- Retrieval combines Pinecone semantic search with MongoDB full-text search using reciprocal-rank fusion.
- An OpenAI listwise reranker scores fused candidates before grounded answer generation.
- Chat answers include citations to the retrieved document chunks.
