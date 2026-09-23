# Shop assistant evals

Evals measure whether the shop assistant behaves correctly, so prompt, retrieval,
guardrail or model changes can be compared with numbers instead of impressions.

```bash
npm run eval                       # offline: retrieval + guardrail, free, deterministic
npm run eval -- --live             # also runs every case through the real model (costs credits)
npm run eval -- --live --case live-sales-today --case payment-upi   # debug a few cases
npm run eval -- --live --no-judge  # skip the LLM judge to save tokens
npm run eval -- --update-baseline  # accept the current scores as the new minimums
npm run eval -- --refresh-embeddings        # embed new notes/questions into the cache
npm run eval -- --min-similarity 0.35       # try another vector threshold
```

Vector and hybrid retrieval evals replay `embeddings.cache.json`, so they are free and
deterministic. After adding a case or editing a built-in note, run
`--refresh-embeddings` (needs `OPENAI_API_KEY`) and commit the updated cache.

Live runs read `OPENAI_API_KEY` and `OPENAI_MODEL` from `apps/api/.env`. Set
`OPENAI_JUDGE_MODEL` to a stronger model than the agent's, because a model grading
its own answers tends to be lenient. Reports are written to `evals/reports/`
(git-ignored).

## Files

| File                        | Purpose                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| `shop-assistant.cases.json` | The golden dataset: questions and what a correct run must do.             |
| `dataset.ts`                | Validates the dataset (known knowledge IDs, valid regexes, unique IDs).   |
| `offline-metrics.ts`        | Retrieval recall@4, hit rate, MRR, precision; guardrail precision/recall. |
| `fixtures.ts`               | Fixed menu and report data with deliberate edge cases for live runs.      |
| `live-eval.ts`              | Runs one case through the real agent loop and checks its behaviour.       |
| `judge.ts`                  | LLM-as-judge groundedness score (1–5) using a strict JSON Schema.         |
| `embedding-cache.ts`        | Records embeddings once and replays them offline.                         |
| `retrievers.ts`             | Keyword, vector-only and hybrid retrievers over the built-in notes.       |
| `baseline.json`             | Committed minimum scores. CI fails if an offline score drops below them.  |

## Writing a case

```json
{
  "id": "payment-upi",
  "question": "Do we accept UPI at the counter?",
  "tags": ["knowledge", "unconfirmed"],
  "expectedKnowledgeIds": ["payment-at-shop"],
  "expectedTools": [],
  "shouldBlock": false,
  "mustMention": ["not (been )?confirmed|shop owner"],
  "mustNotMention": ["\\byes, (we|you) (do )?accept upi\\b"]
}
```

Write the expectation from what is **correct**, never from what the assistant
currently does. A failing case is a finding, not a dataset bug. Good sources of new
cases are runs rated **Not helpful** on the Assistant runs page.

## What each layer measures

- **Retrieval** (offline): did the keyword retriever surface the right reference
  note in its top four? Measured without a model, so it is free and exact.
- **Guardrail** (offline): did the regex refuse change requests (recall) without
  refusing legitimate questions (precision)?
- **Live behaviour**: right tools called, required facts present, forbidden claims
  absent, sources cited, no agent rule violations.
- **Groundedness** (LLM judge): is every shop fact in the answer supported by the
  evidence the assistant was given? A score of 4 or more passes.

Live results vary between runs because models are not deterministic. Compare full
runs, and repeat a surprising result before acting on it.
