# Evals and observability

This project uses two complementary systems:

- Arize Phoenix receives OpenTelemetry/OpenInference traces from Next.js and LangChain.
- Ragas executes offline quality metrics against application-generated answers and retrieved contexts.

The evaluation fixture is processed through the same Cloudinary, extraction, MongoDB, OpenAI, Pinecone, hybrid retrieval, reranking, and answer-generation code used by the application. Temporary provider data is removed in a `finally` block.

## One-time setup

Use Node.js 22 or newer. This matches the runtime required by the current Phoenix/OpenInference dependency chain and the committed CI jobs.

Create and activate a Python virtual environment, then install the pinned evaluation dependencies.

PowerShell:

```powershell
python -m venv .venv-evals
npm run eval:setup
```

The Node runner automatically discovers `.venv-evals`, the existing `venv`, or the interpreter in `EVAL_PYTHON`.

Add these values to `.env.local`:

```env
PHOENIX_COLLECTOR_ENDPOINT=http://127.0.0.1:6006
PHOENIX_HOST=http://127.0.0.1:6006
PHOENIX_PROJECT_NAME=ai-book-saas
PHOENIX_CAPTURE_CONTENT=false
PHOENIX_EVAL_ANNOTATIONS_REQUIRED=true

RAGAS_EVALUATOR_MODEL=gpt-4o-mini
RAGAS_EMBEDDING_MODEL=text-embedding-3-small
```

`PHOENIX_CAPTURE_CONTENT=false` is the safe production default. Phoenix will receive timings, model operations, hashed user identifiers, counts, errors, and application trace IDs without prompts, answers, embeddings, or document contents. Enable content capture only in an approved non-production environment with non-sensitive fixtures.

For Phoenix Cloud, use its HTTPS collector and application endpoints and set `PHOENIX_API_KEY`. Never expose that key through a `NEXT_PUBLIC_` variable.

## Run Phoenix

In terminal 1:

```powershell
npm run observability:phoenix
```

Open `http://127.0.0.1:6006`. Keep the process running.

In terminal 2, start the application:

```powershell
npm run dev
```

Ask a document question. The `ai-book-saas` Phoenix project should show a `rag.chat` chain with LangChain model spans and `rag.hybrid_retrieval` retriever spans. The application response header `X-Trace-Id` is also stored as the `app.trace_id` span attribute.

## Run the end-to-end evaluation

Run all committed cases:

```powershell
npm run eval:rag
```

For a quicker wiring check that runs one case:

```powershell
npm run eval:rag:smoke
```

The run performs two phases:

1. `eval:rag:collect` creates and processes the synthetic PDF, executes the real RAG graph, emits Phoenix spans, and writes ignored `scripts/evals/traces.json`.
2. `eval:rag:score` runs modern Ragas metrics, enforces thresholds, writes ignored results under `scripts/evals/results/`, and attaches the scores to the matching Phoenix spans.

The command exits non-zero if deterministic answer/citation/refusal checks fail, a metric cannot be produced, a Phoenix annotation is required but fails, or an aggregate falls below its threshold.

The default Ragas metrics are:

- Faithfulness
- Answer relevancy
- Answer correctness
- Context precision
- Context recall

Unanswerable cases are evaluated with deterministic refusal checks and answer correctness. Retrieval metrics are applied only to answerable cases because an intentional refusal may have no supporting context.

## Change or expand the dataset

Edit `scripts/evals/golden_dataset.json`. Every case has:

- A stable ID and question
- A reference answer
- Deterministic expected terms
- Whether the question is answerable
- A minimum citation count

Add cases from real failure modes after anonymizing them. Do not commit production prompts, user identifiers, document text, trace exports, or generated results.

## Regression thresholds

Thresholds are configured through:

```env
RAGAS_MIN_FAITHFULNESS=0.75
RAGAS_MIN_ANSWER_RELEVANCY=0.65
RAGAS_MIN_ANSWER_CORRECTNESS=0.70
RAGAS_MIN_CONTEXT_PRECISION=0.65
RAGAS_MIN_CONTEXT_RECALL=0.75
```

Treat threshold changes like code changes: include a result comparison and an explanation in review. Do not lower a threshold only to make a failing build pass.

## CI

`quality.yml` runs lint, type checking, and a production build on pull requests and pushes. `rag-evals.yml` is an explicit workflow-dispatch job because it calls paid providers. Configure the repository secrets listed in that workflow, run it before a RAG/prompt/model/retrieval release, and make the successful workflow a required release check.

## Production operations

- Use Phoenix Cloud or a self-hosted Phoenix deployment with persistent SQL storage and authentication.
- Keep batch span export enabled; the app enables it automatically in production.
- Keep content redaction enabled unless data governance explicitly approves capture.
- Alert on error rate, p95 latency, empty retrieval, checker failures, and document-processing failures in your hosting/monitoring platform.
- Run the full golden dataset before changes to prompts, models, chunking, embeddings, retrieval, reranking, or citation behavior.
- Review Phoenix traces for degraded cases, add anonymized failures to the golden dataset, and rerun the gate.

### Dependency security note

`npm audit --omit=dev` has no high or critical production findings after the committed `postcss` and `sharp` overrides. The current `@arizeai/phoenix-otel` release still includes a no-fix moderate advisory through its Vercel adapter's OpenTelemetry baggage parser. The application does not use that adapter directly, but production ingress should reject or tightly limit untrusted `baggage` headers as defense in depth. Re-run the audit and remove this exception as soon as the Phoenix dependency publishes a fixed chain.
