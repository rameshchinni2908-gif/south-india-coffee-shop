import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { runAdminBriefAgent } from "../agents/admin-brief-agent.js";
import { createOpenAiResponder } from "../agents/openai-responses.js";
import { createShopSummaryTool, shopApiUrlSchema } from "../agents/shop-summary-tool.js";

config({
  path: fileURLToPath(new URL("../../examples/admin-agent/.env", import.meta.url)),
  quiet: true,
});

const run = async () => {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    process.stdout.write(
      'Usage: npm run agent:brief -- "How is the shop doing today?"\n       npm run agent:brief -- --inspect\nSetup: apps/api/examples/admin-agent/README.md\n',
    );
    return;
  }
  const inspect = args.length === 1 && args[0] === "--inspect";
  const environment = z
    .object({
      SHOP_API_URL: shopApiUrlSchema.default("http://localhost:4000"),
      SHOP_ADMIN_EMAIL: z.email(),
      SHOP_ADMIN_PASSWORD: z.string().min(1).max(128),
      OPENAI_API_KEY: inspect ? z.string().optional() : z.string().trim().min(1),
      OPENAI_MODEL: z.string().trim().min(1).default("gpt-5.4-mini"),
    })
    .safeParse(process.env);
  if (!environment.success) {
    const fields = [...new Set(environment.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(
      `Configure ${fields.join(", ")} in apps/api/examples/admin-agent/.env. See its README.`,
    );
  }
  const settings = environment.data;
  const getShopSummary = createShopSummaryTool({
    apiUrl: settings.SHOP_API_URL,
    email: settings.SHOP_ADMIN_EMAIL,
    password: settings.SHOP_ADMIN_PASSWORD,
  });
  if (inspect) {
    process.stdout.write("Reading the real shop report without an AI request.\n");
    process.stdout.write(`${JSON.stringify(await getShopSummary(), null, 2)}\n`);
    return;
  }
  const result = await runAdminBriefAgent(
    args.join(" ") || "How is the shop doing today? What should I check first?",
    {
      respond: createOpenAiResponder({
        apiKey: settings.OPENAI_API_KEY ?? "",
        model: settings.OPENAI_MODEL,
      }),
      getShopSummary,
      trace: (message) => process.stdout.write(`${message}\n`),
    },
  );
  process.stdout.write(
    `\n${result.usedShopData ? "Shop briefing" : "Scope explanation (no shop data read)"}\n${result.answer}\n`,
  );
};

run().catch((error: unknown) => {
  // Never print provider response bodies, URLs, environment values or error stacks.
  const message = error instanceof Error ? error.message : "The agent could not finish.";
  process.stderr.write(`Agent stopped: ${message}\n`);
  process.exitCode = 1;
});
