# Your first coffee shop admin agent

This lesson builds a small **daily briefing agent**. You ask, “How is the shop doing today? What should I check first?” It can read the shop's existing protected report and turn its figures into a short explanation with practical checks for the admin.

The benefit is a quicker start to a shift: understand today's activity and see which stock needs attention. The existing dashboard remains the source of the figures. The learning example runs in your terminal and has one tool, `get_shop_summary`. The admin dashboard now uses the same agent loop through the server integration described below. It cannot change orders, prices or stock.

Start with the plain function, see its real data, then add the model. You do not need an agent framework or a new dependency.

## Using the same agent in the production dashboard

An account with the `ADMIN` role can request a briefing from the dashboard. The server needs `OPENAI_API_KEY` in its Render environment settings and uses `OPENAI_MODEL=gpt-5.4-mini` by default. Keep the key on the server; it never belongs in a `VITE_` variable. Without a key the assistant is shown as unavailable and the rest of the application continues to work.

The production path is:

```text
Signed-in admin -> POST /api/admin/agent/brief { question }
    -> admin agent service -> runAdminBriefAgent
    -> get_shop_summary calls reportService.getSummary()
    -> existing repository reads MongoDB
    -> projectShopSummary removes private fields
    -> model writes the briefing -> dashboard displays it
```

Read [admin-agent-routes.ts](../../src/routes/admin-agent-routes.ts) for session authentication, the `ADMIN` role check, request validation and the limit of five requests per admin every 15 minutes. Read [admin-agent-service.ts](../../src/services/admin-agent-service.ts) for the direct report read and the shared agent loop. The server already has database access, so this path does not need a stored shop password or a second HTTP login.

`GET /api/admin/agent/status` returns whether the assistant is configured without calling OpenAI. A briefing is generated only after an admin submits a question. Each run makes at most two model requests and reads one report; there are no automatic retries or background briefings. Only one briefing runs at a time in this API process. These limits are held in memory and reset on restart; additional API instances would need a shared limiter. API credits are still required for each live model request.

The returned `generatedAt` is the report snapshot time when `usedShopData` is `true`; for an answer that does not read the report, it is the answer generation time. Briefings are not saved as conversation history. The terminal commands and their separate local `.env` file below continue to work unchanged.

## Lesson 1: understand the parts

An agent combines a model with code it is allowed to request. In this example, the model decides whether the question needs the shop report. Your program validates that request, runs the function and sends back its result. The model then writes the briefing.

```text
Your question
    |
    v
Model receives instructions + a description of one tool
    |
    | requests get_shop_summary({})
    v
Your TypeScript code validates the request
    |
    v
Tool signs in -> reads the existing admin report -> selects permitted fields
    |
    v
Model receives those fields -> writes a briefing -> program stops
```

There are four small files to read in this order:

| File                                                          | Responsibility                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [shop-summary-tool.ts](../../src/agents/shop-summary-tool.ts) | Authenticate, fetch the report, validate it and select the data the model may see.     |
| [openai-responses.ts](../../src/agents/openai-responses.ts)   | Describe the tool and send requests to the model using `fetch`.                        |
| [admin-brief-agent.ts](../../src/agents/admin-brief-agent.ts) | Coordinate the question, tool request, execution and final answer.                     |
| [admin-agent.ts](../../src/scripts/admin-agent.ts)            | Read terminal arguments and local configuration, connect the pieces and print results. |

A **model** generates a response from the input it receives. A **tool** is an ordinary function in your program. The **agent** is the small piece of code coordinating them. The model has no direct connection to your MongoDB database.

## Lesson 2: run the tool without AI

Use Node.js 24 and run these commands from the repository root. If you have not installed dependencies or configured the application yet, follow the [application setup](../../../../README.md#first-time-setup) first.

Create the agent's separate local configuration once:

```powershell
Copy-Item apps/api/examples/admin-agent/.env.example apps/api/examples/admin-agent/.env
```

Open that `.env` file in your editor. Set `SHOP_ADMIN_EMAIL` and `SHOP_ADMIN_PASSWORD` to an existing active staff/admin account for the API you intend to use. These are the same kind of credentials you use to sign in to the admin website.

| Setting                              | Meaning                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `SHOP_API_URL=http://localhost:4000` | API origin. Start your configured local API with `npm run dev:api` in another terminal. |
| `SHOP_ADMIN_EMAIL`                   | Existing staff/admin account email.                                                     |
| `SHOP_ADMIN_PASSWORD`                | That account's password.                                                                |
| `OPENAI_API_KEY`                     | Leave empty for this lesson. Required only when requesting an AI briefing.              |
| `OPENAI_MODEL=gpt-5.4-mini`          | Configurable model for the later AI step.                                               |

You can instead point `SHOP_API_URL` at the existing HTTPS Render API, using an account belonging to that deployment. Use the origin only, without `/api`. HTTP is permitted only for localhost. The report will come from whichever API you configure.

Keep real values only in the ignored `.env` file. Do not paste keys or passwords into chat, commit them, put them in the example file, or add them to frontend `VITE_` settings.

Now run:

```powershell
npm run agent:brief -- --inspect
```

Use `--inspect` by itself. This logs in, reads the real report and prints the selected JSON. It does not make an OpenAI request and does not require an OpenAI key. If the API is not running or your account is invalid, the command reports an error instead of inventing a report.

Find this line in `shop-summary-tool.ts`:

```ts
return projectShopSummary(envelope.data.data.summary);
```

`projectShopSummary` takes the API report, validates its shape with Zod and returns a smaller object. This is a useful programming pattern even before you add AI: an external response is `unknown` until your code checks it.

The tool sends the login request to `/api/auth/login`, keeps its staff session cookie inside the process, then uses that cookie for `/api/admin/reports/summary`. The existing API still enforces authentication and authorization. Neither the cookie nor the password is included in the tool result sent to the model.

**Small exercise:** run `--inspect` and find `ordersCreatedToday`, `completedSalesUpdatedToday` and `lowStock`. Check those values against the admin dashboard before moving on.

## Lesson 3: understand what the report actually means

Correct explanations depend on correct data definitions:

| Tool result                               | What it means                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ordersCreatedToday`                      | Orders created during the shop's local calendar day, grouped by their current status. It does not include the complete backlog from earlier days. |
| `completedSalesUpdatedToday`              | Orders currently `COMPLETED` whose `updatedAt` falls today. They can have been created on an earlier day. Sales are not profit.                   |
| `salesTotalPaise` / `salesTotalFormatted` | Integer paise from the server, plus an INR string formatted by code after dividing by 100.                                                        |
| `lowStock.totalVariants`                  | Number of low-stock variants, not distinct products.                                                                                              |
| `lowStock.listedVariants`                 | At most ten variants from the report. Unavailable variants can also appear. Check `listIsPartial` before treating it as a complete list.          |
| `generatedAt` / `timezone`                | Snapshot time and the timezone used by the report.                                                                                                |

Do not subtract completed-sales order count from orders-created count to calculate “pending orders”; they describe different groups. The model instructions explicitly explain this distinction.

The projection excludes customer names, mobile numbers, staff details and internal IDs. It includes only the listed report fields and stock labels. Product and variant names are treated as data, even if a name contains text that looks like an instruction.

## Lesson 4: describe the tool to the model

The model cannot inspect your TypeScript function. You give it a description of the function it may request. In `openai-responses.ts`, this is `SUMMARY_TOOL`:

```ts
name: "get_shop_summary",
strict: true,
parameters: {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
},
```

This is a **schema**, not the implementation. It says the function takes an empty object: `{}`. No arbitrary date, database query or endpoint can be supplied in this first lesson.

`AGENT_INSTRUCTIONS` separately describes the assistant's job: read the report before stating shop facts, use the report's definitions, distinguish suggestions from facts and state its limited scope when asked to do something else.

The responder sends the instructions, question and tool schema to the [OpenAI Responses API](https://developers.openai.com/api/docs/guides/function-calling). Tool calling returns a request for your application to execute; your application supplies the result.

The default model is configurable through `OPENAI_MODEL`; see its [model documentation](https://developers.openai.com/api/docs/models/gpt-5.4-mini) for current capabilities and availability.

## Lesson 5: follow the agent's execution

Open `admin-brief-agent.ts`. Its numbered comments follow this sequence.

**1. Send the question.**

```ts
const first = await respond({ input, toolChoice: "auto" });
```

`input` initially contains your question. `auto` lets the model request the tool or answer directly. A direct answer is labelled **“Scope explanation (no shop data read)”** by the terminal program; it is not presented as a verified shop briefing.

**2. Validate the requested function.**

An illustrative model response might contain:

```json
{
  "type": "function_call",
  "name": "get_shop_summary",
  "arguments": "{}",
  "call_id": "call_example"
}
```

This example shows the format, not a captured live response. Notice that `arguments` is a JSON **string**. The agent parses it, checks the function name against `get_shop_summary` and verifies that the parsed object has no arguments. It rejects multiple calls, unknown tools and malformed arguments before executing the tool.

**3. Execute your function.**

```ts
const snapshot = await getShopSummary();
```

This is the moment your program reads the report. The model requested an action; your code decides whether that request is permitted and performs the action. There is no `eval` or automatic access to other application functions.

**4. Return the result with the matching ID.**

```ts
input.push(...first.output, {
  type: "function_call_output",
  call_id: call.data.call_id,
  output: JSON.stringify(snapshot),
});
```

`call_id` connects the result to the exact request that caused it. Keeping `first.output` preserves the response items needed for the next model request, including any opaque model state. The program does not decode or print private reasoning.

**5. Ask for the final briefing and stop.**

```ts
const last = await respond({ input, toolChoice: "none" });
```

`none` disables further tool requests. The code also rejects any unexpected further function call. Every run uses at most two model requests and one shop-summary tool execution. There is no continuous background loop.

The terminal trace describes observable steps such as “request validated” and “report read.” It lets you follow execution; it is not a transcript of the model's hidden thought process.

## Lesson 6: ask your first question

Add your OpenAI API key to the local agent `.env`, then run:

```powershell
npm run agent:brief -- "How is the shop doing today? What should I check first?"
```

The AI step sends your question and the projected report to OpenAI and uses your API account. No live AI result is claimed by this guide; a working key and account access are needed to run it.

Try these questions one at a time:

```powershell
npm run agent:brief -- "Which low-stock items should I check?"
npm run agent:brief -- "Do today's figures show any activity?"
npm run agent:brief -- "Change the filter coffee price to 60 rupees."
```

The third question should receive a scope explanation. There is no price-update tool available, so this program cannot perform the requested change.

Compare each briefing with `--inspect`. Ask: Are the figures supported? Does it mention a partial stock list when relevant? Are suggestions clearly different from completed actions? Generated wording can vary, so passing code tests alone does not establish the quality of every future briefing.

This example does not train a model or save conversation memory. Each terminal invocation starts fresh. Its request uses `store: false`; that setting is not a promise about all provider data-retention policies.

If configuration is missing, set only the named fields in the local file. A shop login error means the account or API needs checking. An OpenAI HTTP error means API access, the configured model or quota needs checking. The program stops on failure rather than filling gaps with made-up shop data.

## Lesson 7: test the boundaries, then grow gradually

Run the focused tests from the repository root:

```powershell
npm test --workspace @south-india-coffee-shop/api -- admin-brief-agent.test.ts shop-summary-tool.test.ts openai-responses.test.ts
```

The agent receives `respond` and `getShopSummary` as function arguments. This is **dependency injection**: production supplies real functions, while tests supply controlled responses. Tests can check the exact tool request, validation failure or authentication error without a database, an OpenAI key or a paid model request. These test fixtures are not a real shop briefing.

Before merging changes, run the repository's full checks:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Keep the next lessons small:

1. **Improve the briefing instructions.** Change the desired length or wording, then compare several questions against the same report. Learn which behavior comes from instructions and which is enforced by code.
2. **Add a second read tool.** For example, a protected report of older pending orders with customer details excluded. Give it a distinct schema and validate its arguments. This would answer a question the current “created today” summary cannot.
3. **Build a repeatable evaluation set.** Include no orders, partial stock lists, older completed orders and requests outside the agent's scope. Measure factual accuracy and whether the correct tool is used.
4. **Add an admin UI.** Put the agent behind an authenticated server endpoint with request limits and loading/error states. Keep the model key on the server and reuse the signed-in user's authorization.
5. **Consider a narrowly scoped write tool later.** First show the exact proposed change for staff confirmation, then enforce permission, validation, audit history and duplicate-request protection on the server. That is a separate lesson; this version only reads reports.

For now, understanding one complete request-to-tool-to-answer cycle is the goal. The rest can grow from this working boundary.
