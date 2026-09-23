import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { HttpError } from "../src/middleware/http-error.js";
import type { AuthService } from "../src/services/auth-service.js";
import type { KnowledgeService } from "../src/services/knowledge-service.js";

const authService: AuthService = {
  login: () => Promise.reject(new Error("Unexpected login")),
  authenticateAccessToken: (token) =>
    ["admin", "staff"].includes(token)
      ? Promise.resolve({
          id: token,
          name: "Test User",
          email: "test@example.com",
          role: token === "staff" ? "STAFF" : "ADMIN",
        })
      : Promise.reject(new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required")),
};

const createService = () =>
  ({
    listNotes: vi.fn<KnowledgeService["listNotes"]>().mockResolvedValue([]),
    createNote: vi.fn<KnowledgeService["createNote"]>().mockResolvedValue({} as never),
    updateNote: vi.fn<KnowledgeService["updateNote"]>().mockResolvedValue({} as never),
    embedPending: vi
      .fn<KnowledgeService["embedPending"]>()
      .mockResolvedValue({ embedded: 2, tokens: 40 }),
    ensureBuiltInNotes: vi.fn<KnowledgeService["ensureBuiltInNotes"]>(),
    retrieve: vi.fn<KnowledgeService["retrieve"]>().mockResolvedValue({
      mode: "hybrid",
      embeddingTokens: 5,
      fallbackReason: null,
      documents: [
        {
          document: { id: "payment-at-shop", title: "Payment", content: "full text", keywords: [] },
          fusedScore: 0.03,
          keyword: { rank: 1, score: 12 },
          vector: { rank: 2, similarity: 0.61 },
        },
      ],
    }),
    getStatus: vi
      .fn<KnowledgeService["getStatus"]>()
      .mockReturnValue({ embeddings: true, vectorSearch: "memory", model: "m" }),
  }) satisfies KnowledgeService;

const createKnowledgeApp = (knowledgeService: KnowledgeService) =>
  createApp({
    clientUrl: "https://shop.example.com",
    authService,
    knowledgeService,
    isProduction: true,
    databaseState: () => "connected",
    enableRequestLogging: false,
  });
const asAdmin = { Cookie: "staff_access_token=admin" };

describe("admin knowledge API", () => {
  it("is limited to administrators", async () => {
    const service = createService();
    const app = createKnowledgeApp(service);
    expect((await request(app).get("/api/admin/knowledge")).status).toBe(401);
    expect(
      (await request(app).get("/api/admin/knowledge").set("Cookie", "staff_access_token=staff"))
        .status,
    ).toBe(403);
    expect(service.listNotes).not.toHaveBeenCalled();
  });

  it("lists notes with the retrieval configuration", async () => {
    const response = await request(createKnowledgeApp(createService()))
      .get("/api/admin/knowledge")
      .set(asAdmin);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      notes: [],
      retrieval: { embeddings: true, vectorSearch: "memory", model: "m" },
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("creates a note with normalised keywords as the signed-in admin", async () => {
    const service = createService();
    const response = await request(createKnowledgeApp(service))
      .post("/api/admin/knowledge")
      .set(asAdmin)
      .send({
        title: "  Counter payments ",
        content: "UPI and cash acceptance is not confirmed yet.",
        keywords: ["UPI", "upi", " Cash "],
      });
    expect(response.status).toBe(201);
    expect(service.createNote).toHaveBeenCalledWith(
      {
        title: "Counter payments",
        content: "UPI and cash acceptance is not confirmed yet.",
        keywords: ["upi", "cash"],
        isActive: true,
      },
      "admin",
    );
  });

  it("updates only the fields sent, without create-time defaults", async () => {
    const service = createService();
    const response = await request(createKnowledgeApp(service))
      .patch("/api/admin/knowledge/payment-at-shop")
      .set(asAdmin)
      .send({ title: "Payment at the counter" });
    expect(response.status).toBe(200);
    expect(service.updateNote).toHaveBeenCalledWith(
      "payment-at-shop",
      { title: "Payment at the counter" },
      "admin",
    );
  });

  it.each([
    ["post", "/api/admin/knowledge", { title: "T", content: "too short" }],
    ["post", "/api/admin/knowledge", { title: "T", content: "x".repeat(2_001) }],
    [
      "post",
      "/api/admin/knowledge",
      { title: "T", content: "long enough content here", embedding: [1] },
    ],
    ["patch", "/api/admin/knowledge/Not_A_Slug", { isActive: false }],
    ["patch", "/api/admin/knowledge/payment-at-shop", {}],
    ["post", "/api/admin/knowledge/search", { question: "" }],
  ] as const)("rejects invalid input (%s %s)", async (method, path, body) => {
    const service = createService();
    const agent = request(createKnowledgeApp(service));
    const call = method === "post" ? agent.post(path) : agent.patch(path);
    const response = await call.set(asAdmin).send(body);
    expect(response.status).toBe(400);
    expect(service.createNote).not.toHaveBeenCalled();
    expect(service.updateNote).not.toHaveBeenCalled();
    expect(service.retrieve).not.toHaveBeenCalled();
  });

  it("rejects writes from another site", async () => {
    const service = createService();
    const response = await request(createKnowledgeApp(service))
      .post("/api/admin/knowledge/embed")
      .set(asAdmin)
      .set("Origin", "https://evil.example.com");
    expect(response.status).toBe(403);
    expect(service.embedPending).not.toHaveBeenCalled();
  });

  it("explains a search without returning the notes' full text", async () => {
    const response = await request(createKnowledgeApp(createService()))
      .post("/api/admin/knowledge/search")
      .set(asAdmin)
      .send({ question: "Do we take UPI?" });
    expect(response.status).toBe(200);
    expect(response.body.data.search).toEqual({
      mode: "hybrid",
      fallbackReason: null,
      embeddingTokens: 5,
      results: [
        {
          slug: "payment-at-shop",
          title: "Payment",
          fusedScore: 0.03,
          keyword: { rank: 1, score: 12 },
          vector: { rank: 2, similarity: 0.61 },
        },
      ],
    });
    expect(response.text).not.toContain("full text");
  });
});
