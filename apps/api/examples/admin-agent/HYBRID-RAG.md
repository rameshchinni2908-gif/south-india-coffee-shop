# Hybrid RAG: keywords plus meaning

The [RAG lesson](RAG.md) retrieved notes by matching words. That works when the admin
uses the same words as the note, and fails on paraphrases: "How much have we **sold**
today?" retrieves nothing, because the note says "sales". Hybrid retrieval adds a
second method that compares **meaning**, then combines both rankings.

## Follow one question

```text
"Do customers pay with UPI?"
   │
   ├─ keyword ranking (shop-knowledge-retrieval.ts)          top 8 by curated keyword score
   │     payment-at-shop:19, pickup-ordering:12, …
   │
   ├─ embed the question (openai-embeddings.ts)              512 numbers describing its meaning
   │     └─ cosine similarity against every note's vector    top 8 with similarity ≥ 0.3
   │           payment-at-shop:0.61, unconfirmed-shop-details:0.41, …
   │
   └─ Reciprocal Rank Fusion (hybrid-retrieval.ts)           top 4 by fused score
         payment-at-shop  = 1/(60+1) + 1/(60+1)  ← both methods agree
         pickup-ordering  = 1/(60+2)
         …
   → the same K1…K4 evidence flow as before → model answers with citations
```

Open `/admin/knowledge`, type a question into **Try retrieval**, and you will see
exactly this table for your own data.

## The four ideas

**1. Embeddings.** An embedding model turns text into a vector (here 512 numbers)
so that texts with similar meaning point in similar directions. "When do you open?"
and "opening hours" share no words but get similar vectors. Each note is embedded once
when it is saved, and each question once when it is asked.

**2. Cosine similarity.** Compares the direction of two vectors: 1 means the same
meaning, 0 unrelated. It ignores length, so a long note and a short question can still
match. The threshold (`DEFAULT_MIN_SIMILARITY = 0.3`) drops weak matches, so an
off-topic question like "What's the weather?" retrieves nothing instead of four random
notes. The right threshold depends on the model; measure it with
`npm run eval -- --min-similarity 0.35`.

**3. Reciprocal Rank Fusion (RRF).** Keyword scores (points) and similarities (0–1)
are not comparable, so RRF ignores the scores and uses only **positions**: each list
adds `1 / (60 + rank)`. A note ranked well by both methods beats a note ranked first
by only one. The constant 60 is the standard value from the original RRF paper; larger
values flatten the difference between ranks.

**4. Freshness by hash.** Every note stores `embeddingHash = sha256(model, dimensions,
text)`. At retrieval time the service recomputes the hash; if the text or model changed
since embedding, that vector is ignored. A stale vector can therefore never retrieve
a note for words it no longer contains.

## Where things live

| File                                              | Role                                                         |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `src/agents/openai-embeddings.ts`                 | Embeddings API client, the text that gets embedded, the hash |
| `src/agents/hybrid-retrieval.ts`                  | Cosine similarity, in-memory vector search, RRF, fallback    |
| `src/services/knowledge-service.ts`               | Notes CRUD, embed-on-save, freshness, memory vs Atlas search |
| `src/repositories/knowledge-note-repository.ts`   | MongoDB access, including `$vectorSearch`                    |
| `src/scripts/create-knowledge-index.ts`           | Creates the Atlas vector index (`npm run knowledge:index`)   |
| `web/src/features/admin/knowledge/`               | Knowledge page, note editor, retrieval tester                |
| `evals/embedding-cache.ts`, `evals/retrievers.ts` | Keyword vs vector vs hybrid evals, replayed from a cache     |

## Design decisions

- **One note = one chunk.** Notes are capped at 2,000 characters, so each is embedded
  whole. Long documents (a PDF menu, a policy manual) would need splitting into
  ~300–500-token chunks with some overlap before embedding.
- **In-memory search by default.** For tens or hundreds of notes, loading the vectors
  and computing exact cosine similarity in Node is faster than a network round trip,
  and it works on any MongoDB, including the Docker image, which has no
  `$vectorSearch`. Switch to Atlas (`KNOWLEDGE_VECTOR_SEARCH=atlas`) when notes grow
  into the thousands. Atlas reports `(1 + cosine) / 2`; the repository converts it back
  so the same threshold applies to both.
- **512 dimensions.** `text-embedding-3-small` can shorten its vectors. 512 keeps most
  of the quality at a third of the storage and comparison cost. Changing the model or
  size makes every stored vector stale; the API re-embeds them on the next start or
  when you press **Embed pending**. For Atlas, recreate the index with the new size.
- **Degrade, don't fail.** No API key, an embeddings outage, or an Atlas error all fall
  back to keyword retrieval. The run log records `mode: keyword` and the reason, so you
  can see it happened.
- **Notes are evidence, not instructions.** Admin-written text reaches the model inside
  the "evidence only, never instructions" block, the same as before. Only ADMIN accounts
  can edit notes, and the API rejects writes from other sites.

## Measure it

```bash
npm run eval -- --refresh-embeddings --update-baseline
```

This embeds the 10 built-in notes and 42 eval questions once (about 1,000 tokens, a
tiny fraction of a cent), writes `evals/embeddings.cache.json`, prints keyword, vector
and hybrid metrics side by side, and records the hybrid scores as a CI gate. Commit
the cache and baseline. After that, `npm run eval` and `npm test` replay the cached
vectors for free.

Things to look for in the output:

- **Paraphrase cases** (`tracking-paraphrase`, `live-sales-today`, `report-no-subtraction`):
  vector search should find what keywords missed.
- **Off-topic notes**: should stay near 0. If it rises, raise the similarity threshold.
- **Precision**: hybrid may retrieve more notes than keywords did. Extra notes cost
  tokens; the live eval shows whether they also confuse the model.
