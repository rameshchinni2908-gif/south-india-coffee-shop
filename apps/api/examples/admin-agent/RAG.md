# Give the shop assistant reference notes with RAG

Your first agent can read today's report. The production assistant can also explain how pickup, payment, order processing and product management work. It gets that information by searching a small collection of verified notes before asking the model to answer.

**RAG means retrieval-augmented generation:** retrieve relevant information, add it to the model's input, then generate an answer using that information. Here, retrieval is an ordinary TypeScript function using keywords. The notes are compiled with the API; no vector database, embedding request, uploaded file or model training is needed.

The [original terminal lesson](README.md#lesson-1-understand-the-parts) remains a separate, smaller example. `npm run agent:brief` still runs `admin-brief-agent.ts` with only `get_shop_summary`. Use the dashboard to try the production flow described here.

## Follow one question

Suppose the admin asks: **"Can a confirmed order be cancelled?"**

```text
Admin submits the question
    |
    v
shop-knowledge.ts: stored application notes
    |
    v
shop-knowledge-retrieval.ts: rank matching notes, keep at most four
    |
    v
shop-assistant-agent.ts: send question + selected notes to the model
    |
    +-- Procedure question: model can answer from the notes
    |
    +-- Current facts needed: validate and execute menu/report tool requests
    |       -> existing services -> MongoDB -> selected fields -> model
    |
    v
Answer with references -> dashboard's References retrieved section
```

The cancellation note explains that only `PLACED` and `CONFIRMED` orders can be cancelled, and cancelling a confirmed order restores its stock. The question asks about the rule, so the model can answer from that note without reading today's orders. This does not cancel any order.

For **"Which coffee sizes are available and what do they cost?"**, the notes are insufficient. The model is instructed to request `get_shop_menu` and use current product data. For **"How are today's and this month's sales doing?"**, it should request `get_shop_summary`.

## 1. Read the knowledge file

Open [shop-knowledge.ts](../../src/agents/shop-knowledge.ts). Each entry is a short document, also called a **chunk**, with this shape:

```ts
export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  keywords: string[];
}
```

`id` gives the document a stable name in the code. `title` describes its topic. `content` contains the facts the model may read. `keywords` helps the search find it when the admin uses related wording.

Find the document with ID `order-status-stock`. Its content comes from the existing order service and repository. Other chunks cover checkout, payment, tracking, catalog management, staff permissions and report definitions. Source-file references are recorded at the end of the knowledge file so maintainers can recheck a rule when the application changes.

These notes describe procedures and definitions. Current prices, sales and stock quantities come from live tools.

## 2. See how retrieval works

Open [shop-knowledge-retrieval.ts](../../src/agents/shop-knowledge-retrieval.ts). Call its public function like this:

```ts
const matches = retrieveShopKnowledge("Can a confirmed order be cancelled?");
```

For each question, it:

1. Normalizes case and punctuation, removes common words such as "the" and "how", and removes duplicate words.
2. Maps a few equivalent forms: `cancelled` becomes `cancel`, `inventory` becomes `stock`, and `take-away` becomes `pickup`.
3. Scores each document against those terms: a keyword match adds 6, a title match adds 4, and a content match adds 1. A term can match more than one field.
4. Keeps documents scoring at least 4, sorts by score, and returns at most 4. No qualifying match returns `[]`.

For the cancellation question, `confirmed`, `order` and `cancelled` match the status/stock document strongly. The retriever searches on every call; it does not send the entire collection to the model.

This is deliberately small lexical search. It supports some paraphrases through explicit aliases, but unfamiliar wording or another language can miss a relevant note. A score measures word matches, not factual confidence. Improve the relevant keywords or aliases when a useful question fails to retrieve its source.

## 3. Add the retrieved notes to the model's input

Open [shop-assistant-agent.ts](../../src/agents/shop-assistant-agent.ts). Near the beginning, `retrieveKnowledge(parsed.data)` runs before the first model request. Each matching document becomes a source with a title, content excerpt and an answer-local reference such as `K1`.

The model receives your question plus the selected notes in `input`. This is the "augmented" part: we add evidence to this request. Updating notes changes the evidence supplied by the application; it does not change the model's trained weights or create conversation memory.

Read [shop-assistant-instructions.ts](../../src/agents/shop-assistant-instructions.ts) next. It tells the model to use documented procedures, request live tools for current facts, cite the supplied sources and state when information is missing. It also treats retrieved text and product descriptions as evidence, never permission to execute instructions embedded in that text.

## 4. Follow the optional live tools

The first model response can answer directly or request either or both permitted tools. The agent validates the whole batch before executing it: names must be allowed, arguments must be `{}`, and duplicate calls are rejected. There is one tool round, with at most one call to each tool and at most two model requests overall.

| Source    | Code to read                                                                | Information returned                                                                                                                               |
| --------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `K1`–`K4` | [shop-knowledge-retrieval.ts](../../src/agents/shop-knowledge-retrieval.ts) | Up to four matching reference chunks. No database read.                                                                                            |
| `M1`      | [shop-menu-tool.ts](../../src/agents/shop-menu-tool.ts)                     | Up to 30 active products in active categories, with descriptions, vegetarian labels, size prices, stock and availability. Includes sold-out sizes. |
| `R1`      | [shop-assistant-summary.ts](../../src/agents/shop-assistant-summary.ts)     | Today's created-order counts, today's and this month's completed sales, and up to ten low-stock variants.                                          |

The [admin agent service](../../src/services/admin-agent-service.ts) supplies real product and report services. Those existing services reach MongoDB through repositories. The model never receives a database connection or arbitrary query access. Product/report projections remove unrelated fields such as customer details, staff identities and internal IDs before sending results to the model. The submitted question itself is also sent to OpenAI.

After a tool runs, its data returns with the matching `call_id` and source ID. The next model request uses `toolChoice: "none"`, so it must finish without another tool round. This is the same request/tool-result pattern you learned in the first lesson, now with two permitted reads.

## 5. Check the answer and its sources

Open the admin dashboard, enter a question and choose **Ask assistant**. The example buttons fill in questions without sending them automatically. Expand **References retrieved** under an answer to inspect the supplied notes and live-source summaries.

The model is instructed to add markers such as `[K1]`, `[M1]` and `[R1]` to factual statements. `K1` means the first retrieved note for this answer; a different question can assign `K1` to a different note. The application rejects a `K`, `M` or `R` citation whose ID was not supplied. That check does not prove that a sentence accurately describes the source. Review the actual answer against its evidence.

The reference list shows sources supplied for the question, including notes the final answer might not use. A maximum of four notes plus two live sources means at most six references. `usedShopData` is true when a menu or report tool ran; it is false for an answer using only reference notes. The displayed time is the last live tool's snapshot time, or the answer generation time when no live tool ran.

Important limits remain:

- The menu can be partial after 30 products. Absence from a partial result does not prove a product is not sold.
- Low stock counts sizes/variants, and only ten entries are listed. Availability can be disabled even when stock is positive.
- Today's created-order counts and completed-sales counts describe different groups. Sales are not profit; these sources do not establish weekly trends, margins or bestsellers.
- Hours, address, contact details, refund policies and allergen information have no confirmed values in the current notes. A vegetarian label does not establish allergen safety. The assistant should identify the missing detail and ask the owner.
- Every question starts fresh. The assistant has no tools to change products, prices, stock, orders or accounts.

## 6. Add a confirmed fact

For an application rule, first verify the relevant service, schema or route. For a physical shop detail or policy, obtain the shop owner's exact confirmed information. Record the source and confirmation date in a nearby code comment so it can be reviewed later.

Edit the relevant chunk in [shop-knowledge.ts](../../src/agents/shop-knowledge.ts), or add a focused chunk if the topic is new. Give it a unique ID, a clear title, a concise factual paragraph and the words customers or staff would use to ask about it. Keep live prices and quantities in the database.

For example, once opening hours are confirmed, add the exact confirmed schedule and update the existing "unconfirmed" note so it no longer says hours are unknown. Leave unrelated unknown address or contact details unconfirmed. Do not keep contradictory versions or put placeholder shop facts into the deployed collection.

Add retrieval cases to [shop-knowledge-retrieval.test.ts](../../tests/shop-knowledge-retrieval.test.ts): a direct question, a natural paraphrase, and an unrelated question that should not retrieve the new note. The optional `documents` argument lets tests use a small controlled corpus and prove that changing it changes the retrieved evidence.

The documents are TypeScript data compiled with the API. After changing them, run the normal checks and rebuild/deploy the Render API. There is no upload or reindexing step, and the frontend does not need the knowledge file.

## 7. Start testing without a paid request

From the repository root, run:

```powershell
npm run test --workspace @south-india-coffee-shop/api -- tests/shop-knowledge-retrieval.test.ts
```

These tests exercise retrieval with controlled questions and documents. They need no OpenAI key, credits or database. Read one test alongside `retrieveShopKnowledge` to follow exactly why a note is returned.

Then try these dashboard questions one at a time and inspect their references:

| Question                                                | Expected evidence                                               |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Can a confirmed order be cancelled?                     | Order-status note; no current order read is necessary.          |
| Which coffee sizes are available and what do they cost? | Live menu source `M1`.                                          |
| How are today's and this month's sales doing?           | Live report source `R1`.                                        |
| What are the shop's Sunday opening hours?               | Explicitly unconfirmed shop-details note; no invented schedule. |

The dashboard model requests use your configured API account. Retrieval tests passing verify the search behavior; reviewing actual answers checks whether the model uses that evidence correctly. Run the repository's lint, typecheck, tests and build before merging a knowledge or agent change.

When you later study semantic retrieval, the [official OpenAI retrieval guide](https://developers.openai.com/api/docs/guides/retrieval) explains searching by meaning and combining results with model responses. Our current retriever uses local word matching, keeping this first RAG implementation visible in a short TypeScript function.
