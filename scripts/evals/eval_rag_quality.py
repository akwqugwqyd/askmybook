"""Score collected application RAG runs with Ragas and annotate Phoenix spans."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from dotenv import load_dotenv


TRACES_PATH = Path("scripts/evals/traces.json")
RESULTS_DIR = Path("scripts/evals/results")
EVAL_CACHE_DIR = Path("scripts/evals/.cache")

DEFAULT_THRESHOLDS = {
    "faithfulness": 0.75,
    "answer_relevancy": 0.65,
    "answer_correctness": 0.70,
    "context_precision": 0.65,
    "context_recall": 0.75,
}


def threshold_for(metric: str) -> float:
    environment_name = f"RAGAS_MIN_{metric.upper()}"
    return float(os.environ.get(environment_name, DEFAULT_THRESHOLDS[metric]))


def phoenix_base_url() -> str | None:
    configured = os.environ.get("PHOENIX_HOST") or os.environ.get("PHOENIX_COLLECTOR_ENDPOINT")
    if not configured:
        return None
    return configured.rstrip("/").removesuffix("/v1/traces")


def load_traces(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(
            f"{path} does not exist. Run `npm run eval:rag:collect` first."
        )
    payload = json.loads(path.read_text(encoding="utf-8"))
    cases = payload.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("The trace export contains no evaluation cases.")
    return payload


async def score_metric(
    name: str,
    operation: Callable[[], Awaitable[Any]],
    timeout_seconds: float,
) -> dict[str, Any]:
    result = await asyncio.wait_for(operation(), timeout=timeout_seconds)
    value = float(result.value)
    if not math.isfinite(value):
        raise ValueError(f"Ragas returned a non-finite {name} score.")
    return {
        "score": value,
        "reason": getattr(result, "reason", None),
    }


async def evaluate_cases(payload: dict[str, Any]) -> list[dict[str, Any]]:
    from openai import AsyncOpenAI
    from ragas.cache import DiskCacheBackend
    from ragas.embeddings.base import embedding_factory
    from ragas.llms.base import llm_factory
    from ragas.metrics.collections import (
        AnswerCorrectness,
        AnswerRelevancy,
        ContextPrecision,
        ContextRecall,
        Faithfulness,
    )

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required to run Ragas evaluations.")

    evaluator_model = os.environ.get("RAGAS_EVALUATOR_MODEL", "gpt-4o-mini")
    embedding_model = os.environ.get("RAGAS_EMBEDDING_MODEL", "text-embedding-3-small")
    timeout_seconds = float(os.environ.get("RAGAS_METRIC_TIMEOUT_SECONDS", "180"))
    client = AsyncOpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=3)
    cache = DiskCacheBackend(cache_dir=str(EVAL_CACHE_DIR))
    llm = llm_factory(
        evaluator_model,
        client=client,
        cache=cache,
        temperature=0,
    )
    embeddings = embedding_factory(
        "openai",
        model=embedding_model,
        client=client,
        interface="modern",
        cache=cache,
    )

    faithfulness = Faithfulness(llm=llm)
    answer_relevancy = AnswerRelevancy(llm=llm, embeddings=embeddings, strictness=2)
    answer_correctness = AnswerCorrectness(llm=llm, embeddings=embeddings)
    context_precision = ContextPrecision(llm=llm)
    context_recall = ContextRecall(llm=llm)

    evaluated: list[dict[str, Any]] = []
    for case in payload["cases"]:
        user_input = str(case["question"])
        response = str(case["response"])
        reference = str(case["reference"])
        contexts = [str(context) for context in case.get("retrievedContexts", []) if context]
        answerable = bool(case.get("answerable"))
        scores: dict[str, dict[str, Any]] = {}

        scores["answer_correctness"] = await score_metric(
            "answer_correctness",
            lambda: answer_correctness.ascore(
                user_input=user_input,
                response=response,
                reference=reference,
            ),
            timeout_seconds,
        )

        if answerable:
            if not contexts:
                raise ValueError(f"Answerable case {case['id']} has no retrieved contexts.")
            scores["faithfulness"] = await score_metric(
                "faithfulness",
                lambda: faithfulness.ascore(
                    user_input=user_input,
                    response=response,
                    retrieved_contexts=contexts,
                ),
                timeout_seconds,
            )
            scores["answer_relevancy"] = await score_metric(
                "answer_relevancy",
                lambda: answer_relevancy.ascore(user_input=user_input, response=response),
                timeout_seconds,
            )
            scores["context_precision"] = await score_metric(
                "context_precision",
                lambda: context_precision.ascore(
                    user_input=user_input,
                    reference=reference,
                    retrieved_contexts=contexts,
                ),
                timeout_seconds,
            )
            scores["context_recall"] = await score_metric(
                "context_recall",
                lambda: context_recall.ascore(
                    user_input=user_input,
                    reference=reference,
                    retrieved_contexts=contexts,
                ),
                timeout_seconds,
            )

        evaluated.append({**case, "ragas": scores})

    await client.close()
    return evaluated


def aggregate_scores(cases: list[dict[str, Any]]) -> dict[str, float]:
    aggregates: dict[str, float] = {}
    for metric in DEFAULT_THRESHOLDS:
        values = [
            float(case["ragas"][metric]["score"])
            for case in cases
            if metric in case["ragas"]
        ]
        if values:
            aggregates[metric] = sum(values) / len(values)
    return aggregates


def annotate_phoenix(payload: dict[str, Any], cases: list[dict[str, Any]]) -> int:
    base_url = phoenix_base_url()
    if not base_url:
        print("Phoenix annotations skipped: no PHOENIX_HOST or PHOENIX_COLLECTOR_ENDPOINT configured.")
        return 0

    from phoenix.client import Client

    client = Client(
        base_url=base_url,
        api_key=os.environ.get("PHOENIX_API_KEY") or None,
    )
    annotations = 0
    for case in cases:
        span_id = case.get("phoenixSpanId")
        if not span_id:
            continue
        deterministic_pass = bool(case.get("deterministicPass"))
        client.spans.add_span_annotation(
            span_id=span_id,
            annotation_name="deterministic_regression",
            annotator_kind="CODE",
            score=1.0 if deterministic_pass else 0.0,
            label="pass" if deterministic_pass else "fail",
            explanation="; ".join(case.get("deterministicFailures", [])) or "All deterministic checks passed.",
            metadata={
                "dataset": payload.get("datasetName"),
                "dataset_version": payload.get("datasetVersion"),
                "case_id": case.get("id"),
            },
            sync=True,
        )
        annotations += 1
        for metric, result in case["ragas"].items():
            score = float(result["score"])
            passed = score >= threshold_for(metric)
            client.spans.add_span_annotation(
                span_id=span_id,
                annotation_name=f"ragas.{metric}",
                annotator_kind="LLM",
                score=score,
                label="pass" if passed else "fail",
                explanation=result.get("reason"),
                metadata={
                    "dataset": payload.get("datasetName"),
                    "dataset_version": payload.get("datasetVersion"),
                    "case_id": case.get("id"),
                    "threshold": threshold_for(metric),
                },
                sync=True,
            )
            annotations += 1
    return annotations


def save_results(
    payload: dict[str, Any],
    cases: list[dict[str, Any]],
    aggregates: dict[str, float],
    failures: list[str],
    phoenix_annotations: int,
) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    result_path = RESULTS_DIR / f"eval_{timestamp}.json"
    result_payload = {
        "schemaVersion": 1,
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        "datasetName": payload.get("datasetName"),
        "datasetVersion": payload.get("datasetVersion"),
        "ragQualityMode": payload.get("ragQualityMode"),
        "models": {
            "evaluator": os.environ.get("RAGAS_EVALUATOR_MODEL", "gpt-4o-mini"),
            "embeddings": os.environ.get("RAGAS_EMBEDDING_MODEL", "text-embedding-3-small"),
        },
        "thresholds": {metric: threshold_for(metric) for metric in DEFAULT_THRESHOLDS},
        "aggregates": aggregates,
        "passed": not failures,
        "failures": failures,
        "phoenixAnnotations": phoenix_annotations,
        "cases": cases,
    }
    serialized = json.dumps(result_payload, indent=2, ensure_ascii=False, allow_nan=False)
    result_path.write_text(serialized, encoding="utf-8")
    (RESULTS_DIR / "latest.json").write_text(serialized, encoding="utf-8")
    return result_path


async def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate collected RAG traces with Ragas.")
    parser.add_argument("--traces", type=Path, default=TRACES_PATH)
    parser.add_argument("--skip-phoenix", action="store_true")
    args = parser.parse_args()

    load_dotenv(".env.local")
    payload = load_traces(args.traces)
    cases = await evaluate_cases(payload)
    aggregates = aggregate_scores(cases)
    failures = [
        f"deterministic checks failed for {case['id']}: {', '.join(case.get('deterministicFailures', []))}"
        for case in cases
        if not case.get("deterministicPass")
    ]
    for metric, threshold in ((name, threshold_for(name)) for name in DEFAULT_THRESHOLDS):
        score = aggregates.get(metric)
        if score is None:
            failures.append(f"{metric} produced no score")
        elif score < threshold:
            failures.append(f"{metric} {score:.3f} is below threshold {threshold:.3f}")

    phoenix_annotations = 0
    if not args.skip_phoenix:
        try:
            phoenix_annotations = annotate_phoenix(payload, cases)
        except Exception as error:  # Phoenix failure must be configurable for CI and local evals.
            if os.environ.get("PHOENIX_EVAL_ANNOTATIONS_REQUIRED") == "true":
                failures.append(f"Phoenix annotation failed: {error}")
            else:
                print(f"Phoenix annotation warning: {error}")

    result_path = save_results(payload, cases, aggregates, failures, phoenix_annotations)
    print(json.dumps({
        "aggregates": aggregates,
        "thresholds": {metric: threshold_for(metric) for metric in DEFAULT_THRESHOLDS},
        "phoenixAnnotations": phoenix_annotations,
        "passed": not failures,
        "result": str(result_path),
    }, indent=2))
    if failures:
        print("Evaluation gate failures:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
