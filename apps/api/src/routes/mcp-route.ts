import { Router, type RequestHandler } from "express";

import { projectShopAssistantSummary } from "../agents/shop-assistant-summary.js";
import { createShopMenuTool } from "../agents/shop-menu-tool.js";
import { hasBearerToken } from "../middleware/bearer-token.js";
import type { ProductService } from "../services/product-service.js";
import type { ReportService } from "../services/report-service.js";

const MCP_TOOLS = [
  {
    name: "get_shop_menu",
    description: "Read current active products, prices, stock and availability.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_shop_summary",
    description: "Read today's orders, sales, monthly sales and low-stock variants.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
] as const;

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: string | number | null;
  method?: unknown;
  params?: unknown;
}

const response = (id: JsonRpcRequest["id"], result: unknown) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  result,
});

const error = (id: JsonRpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

const isEmptyObject = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 0;

export const createMcpRouter = ({
  productService,
  reportService,
  token,
}: {
  productService: Pick<ProductService, "listPublic">;
  reportService: ReportService;
  token: string;
}): Router => {
  const router = Router();
  const getShopMenu = createShopMenuTool(productService);

  const handle: RequestHandler = async (request, res) => {
    res.set("Cache-Control", "no-store");
    if (!hasBearerToken(request, token)) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const body = request.body as JsonRpcRequest;
    if (body?.jsonrpc !== "2.0" || typeof body.method !== "string") {
      res.status(400).json(error(body?.id, -32600, "Invalid JSON-RPC request."));
      return;
    }
    if (body.method.startsWith("notifications/")) {
      res.status(202).end();
      return;
    }
    if (body.method === "initialize") {
      res.json(
        response(body.id, {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "jrg-shop", version: "1.0.0" },
        }),
      );
      return;
    }
    if (body.method === "tools/list") {
      res.json(response(body.id, { tools: MCP_TOOLS }));
      return;
    }
    if (body.method !== "tools/call") {
      res.status(404).json(error(body.id, -32601, "Method not found."));
      return;
    }

    const params = body.params;
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
      res.status(400).json(error(body.id, -32602, "Invalid tool parameters."));
      return;
    }
    const name = (params as Record<string, unknown>).name;
    const argumentsValue = (params as Record<string, unknown>).arguments;
    if (
      typeof name !== "string" ||
      (argumentsValue !== undefined && !isEmptyObject(argumentsValue)) ||
      !MCP_TOOLS.some((tool) => tool.name === name)
    ) {
      res
        .status(400)
        .json(
          error(body.id, -32602, "Only known read-only tools with empty arguments are allowed."),
        );
      return;
    }

    try {
      let data: unknown;
      if (name === "get_shop_menu") {
        data = await getShopMenu();
      } else {
        const summary = await reportService.getSummary();
        data = projectShopAssistantSummary({
          ...summary,
          generatedAt: summary.generatedAt.toISOString(),
        });
      }
      res.json(
        response(body.id, {
          content: [{ type: "text", text: JSON.stringify(data) }],
        }),
      );
    } catch {
      res.json({
        ...response(body.id, {}),
        result: {
          isError: true,
          content: [{ type: "text", text: "The shop data could not be read." }],
        },
      });
    }
  };

  router.post("/", handle);
  return router;
};
