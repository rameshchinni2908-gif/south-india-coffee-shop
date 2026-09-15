import "dotenv/config";

import { createInterface } from "node:readline";

import { configureDatabaseDns, connectDatabase, disconnectDatabase } from "../config/database.js";
import { loadEnvironment } from "../config/environment.js";
import { MongooseCategoryRepository } from "../repositories/category-repository.js";
import { MongooseProductRepository } from "../repositories/product-repository.js";
import { MongooseReportRepository } from "../repositories/report-repository.js";
import { createProductService } from "../services/product-service.js";
import { createReportService } from "../services/report-service.js";
import { projectShopAssistantSummary } from "../agents/shop-assistant-summary.js";
import { createShopMenuTool } from "../agents/shop-menu-tool.js";

const tools = [
  {
    name: "get_shop_menu",
    description: "Read current active products, prices, stock and availability.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_shop_summary",
    description: "Read today's orders, sales, monthly sales and low-stock variants.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const isRequest = (value: unknown): value is JsonRpcRequest => {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Record<string, unknown>;
  return request.jsonrpc === "2.0" && typeof request.method === "string";
};

const writeResponse = (id: JsonRpcRequest["id"], result: unknown): void => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result })}\n`);
};

const writeError = (id: JsonRpcRequest["id"], code: number, message: string): void => {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } })}\n`,
  );
};

const emptyArguments = (params: Record<string, unknown> | undefined): boolean => {
  const argumentsValue = params?.arguments;
  if (argumentsValue === undefined) return true;
  return (
    typeof argumentsValue === "object" &&
    argumentsValue !== null &&
    Object.keys(argumentsValue).length === 0
  );
};

const start = async (): Promise<void> => {
  const environment = loadEnvironment();
  configureDatabaseDns(environment.MONGODB_DNS_SERVERS);
  await connectDatabase(environment.MONGODB_URI);

  const categoryRepository = new MongooseCategoryRepository();
  const productService = createProductService(new MongooseProductRepository(), categoryRepository);
  const reportService = createReportService({
    reportRepository: new MongooseReportRepository(),
    timezone: environment.SHOP_TIMEZONE,
  });
  const getShopMenu = createShopMenuTool(productService);

  const handle = async (request: JsonRpcRequest): Promise<void> => {
    if (request.id === undefined && request.method.startsWith("notifications/")) return;

    if (request.method === "initialize") {
      writeResponse(request.id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "jrg-shop", version: "1.0.0" },
      });
      return;
    }
    if (request.method === "tools/list") {
      writeResponse(request.id, { tools });
      return;
    }
    if (request.method !== "tools/call") {
      writeError(request.id, -32601, "Method not found.");
      return;
    }

    const name = request.params?.name;
    if (typeof name !== "string" || !emptyArguments(request.params)) {
      writeError(request.id, -32602, "Only a known tool with an empty argument object is allowed.");
      return;
    }

    try {
      let data: unknown;
      if (name === "get_shop_menu") {
        data = await getShopMenu();
      } else if (name === "get_shop_summary") {
        const summary = await reportService.getSummary();
        data = projectShopAssistantSummary({
          ...summary,
          generatedAt: summary.generatedAt.toISOString(),
        });
      } else {
        writeError(request.id, -32602, "Unknown tool.");
        return;
      }
      writeResponse(request.id, {
        content: [{ type: "text", text: JSON.stringify(data) }],
      });
    } catch {
      writeResponse(request.id, {
        isError: true,
        content: [{ type: "text", text: "The shop data could not be read." }],
      });
    }
  };

  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on("line", (line) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      writeError(null, -32700, "Invalid JSON.");
      return;
    }
    if (!isRequest(value)) {
      writeError(null, -32600, "Invalid JSON-RPC request.");
      return;
    }
    void handle(value).catch(() => writeError(value.id, -32603, "Internal MCP error."));
  });

  const shutdown = async (): Promise<void> => {
    input.close();
    await disconnectDatabase();
  };
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
};

void start().catch((error: unknown) => {
  process.stderr.write(
    `MCP server failed to start: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
