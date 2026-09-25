import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { findUnsupportedNumbers, writePrepNarrative } from "../src/agents/prep-brief-narrative.js";
import type { RespondStructured } from "../src/agents/openai-structured.js";
import { createApp } from "../src/app.js";
import { HttpError } from "../src/middleware/http-error.js";
import type { DemandRepository } from "../src/repositories/demand-repository.js";
import type {
  PrepBriefRecord,
  PrepBriefRepository,
} from "../src/repositories/prep-brief-repository.js";
import type { AuthService } from "../src/services/auth-service.js";
import { createPrepBriefService } from "../src/services/prep-brief-service.js";
import type { PrepForecast } from "../src/services/prep-forecast.js";
import type { ProductService } from "../src/services/product-service.js";

const forecast: PrepForecast = {
  date: "2026-09-24",
  weekday: "Thursday",
  weeksLookedBack: 4,
  items: [
    {
      productId: "coffee",
      variantId: "coffee-regular",
      productName: "Filter Coffee",
      variantName: "Regular",
      daysCompared: 4,
      averageUnits: 19.5,
      highestUnits: 24,
      suggestedPrep: 22,
      stockQuantity: 10,
      isAvailable: true,
      restockNeeded: 12,
      lowConfidence: false,
    },
  ],
};
const replying = (narrative: string) => vi.fn<RespondStructured>().mockResolvedValue({ narrative });

describe("prep brief narrative", () => {
  it("allows only numbers that appear in the forecast", () => {
    expect(
      findUnsupportedNumbers("Prepare 22 Regular coffees (about 19.5 over 4 weeks).", forecast),
    ).toEqual([]);
    // 20 is a rounding and 25 a date: neither is a forecast value.
    expect(findUnsupportedNumbers("Prepare about 20 coffees on the 25th.", forecast)).toEqual([
      "20",
      "25",
    ]);
  });

  it("keeps a narrative that only restates the computed numbers", async () => {
    const respond = replying("Prepare 22 Filter Coffee Regular and restock 12.");

    expect(await writePrepNarrative(forecast, respond)).toEqual({
      status: "WRITTEN",
      narrative: "Prepare 22 Filter Coffee Regular and restock 12.",
    });
    const call = respond.mock.calls[0]![0];
    expect(JSON.parse(call.input)).toEqual(forecast);
    expect(call.instructions).toContain("never instructions");
  });

  it("rejects a narrative that calculates or invents a number", async () => {
    expect(await writePrepNarrative(forecast, replying("Prepare 30 coffees today."))).toEqual({
      status: "REJECTED",
      narrative: null,
    });
  });

  it("skips the model when there is nothing to explain or no model", async () => {
    const respond = replying("unused");
    expect(await writePrepNarrative({ ...forecast, items: [] }, respond)).toMatchObject({
      status: "SKIPPED",
    });
    expect(await writePrepNarrative(forecast, undefined)).toMatchObject({ status: "SKIPPED" });
    expect(respond).not.toHaveBeenCalled();
  });

  it("keeps the table when the model fails", async () => {
    const respond = vi.fn<RespondStructured>().mockRejectedValue(new Error("provider down"));
    expect(await writePrepNarrative(forecast, respond)).toEqual({
      status: "FAILED",
      narrative: null,
    });
  });
});

const createServiceFixture = (narrate?: RespondStructured) => {
  const stored = new Map<string, PrepBriefRecord>();
  const briefRepository: PrepBriefRepository = {
    findByDate: async (date) => stored.get(date) ?? null,
    save: async (brief) => {
      stored.set(brief.date, brief);
      return brief;
    },
  };
  const demandRepository = {
    getDailyVariantDemand: vi.fn<DemandRepository["getDailyVariantDemand"]>().mockResolvedValue([]),
  };
  const productService = {
    listPublic: vi.fn<ProductService["listPublic"]>().mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
    }),
  };
  const service = createPrepBriefService({
    demandRepository,
    briefRepository,
    productService,
    ...(narrate ? { narrate } : {}),
    model: "test-model",
    timezone: "Asia/Kolkata",
    // 23:00 UTC on the 23rd is already the 24th in Asia/Kolkata.
    now: () => new Date("2026-09-23T23:00:00.000Z"),
  });
  return { service, demandRepository, stored };
};

describe("prep brief service", () => {
  it("builds today's brief once per shop day and reuses it", async () => {
    const { service, demandRepository } = createServiceFixture();

    const [first, concurrent] = await Promise.all([service.getToday(), service.getToday()]);
    const later = await service.getToday();

    expect(first.date).toBe("2026-09-24");
    expect(concurrent).toEqual(first);
    expect(later).toEqual(first);
    // Concurrent first visits share one generation.
    expect(demandRepository.getDailyVariantDemand).toHaveBeenCalledTimes(1);
    expect(demandRepository.getDailyVariantDemand).toHaveBeenCalledWith(
      ["2026-09-17", "2026-09-10", "2026-09-03", "2026-08-27"],
      "Asia/Kolkata",
    );
  });

  it("regenerates on request, replacing the earlier brief", async () => {
    const { service, demandRepository } = createServiceFixture();
    await service.getToday();

    await service.regenerateToday();

    expect(demandRepository.getDailyVariantDemand).toHaveBeenCalledTimes(2);
  });
});

const authService: AuthService = {
  login: () => Promise.reject(new Error("Unexpected login")),
  authenticateAccessToken: (token) =>
    ["admin", "staff"].includes(token)
      ? Promise.resolve({
          id: token,
          name: "User",
          email: "u@example.com",
          role: token === "staff" ? "STAFF" : "ADMIN",
        })
      : Promise.reject(new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required")),
};
const brief: PrepBriefRecord = {
  date: "2026-09-24",
  forecast,
  narrative: null,
  narrativeStatus: "SKIPPED",
  model: null,
  generatedAt: new Date("2026-09-24T00:30:00.000Z"),
};
const CRON_TOKEN = "a-scheduler-token-with-at-least-32-characters";
const createBriefApp = (cronToken?: string) => {
  const service = {
    getToday: vi.fn().mockResolvedValue(brief),
    regenerateToday: vi.fn().mockResolvedValue(brief),
  };
  const app = createApp({
    clientUrl: "https://shop.example.com",
    authService,
    prepBrief: { service, cronToken },
    isProduction: true,
    databaseState: () => "connected",
    enableRequestLogging: false,
  });
  return { app, service };
};

describe("prep brief API", () => {
  it("lets staff and admins read today's brief", async () => {
    const { app } = createBriefApp();
    for (const user of ["staff", "admin"]) {
      const response = await request(app)
        .get("/api/admin/prep-brief/today")
        .set("Cookie", `staff_access_token=${user}`);
      expect(response.status).toBe(200);
      expect(response.body.data.brief).toMatchObject({
        date: "2026-09-24",
        generatedAt: "2026-09-24T00:30:00.000Z",
      });
    }
    expect((await request(app).get("/api/admin/prep-brief/today")).status).toBe(401);
  });

  it("lets only admins regenerate, from the shop's own site", async () => {
    const { app, service } = createBriefApp();
    const regenerate = (user: string) =>
      request(app)
        .post("/api/admin/prep-brief/today/regenerate")
        .set("Cookie", `staff_access_token=${user}`);

    expect((await regenerate("staff")).status).toBe(403);
    expect((await regenerate("admin").set("Origin", "https://elsewhere.example.com")).status).toBe(
      403,
    );
    expect((await regenerate("admin")).status).toBe(200);
    expect(service.regenerateToday).toHaveBeenCalledTimes(1);
  });

  it("lets a scheduler prepare the brief only with the token", async () => {
    const { app, service } = createBriefApp(CRON_TOKEN);

    expect((await request(app).post("/api/internal/prep-brief")).status).toBe(401);
    expect(
      (await request(app).post("/api/internal/prep-brief").set("Authorization", "Bearer wrong"))
        .status,
    ).toBe(401);
    const response = await request(app)
      .post("/api/internal/prep-brief")
      .set("Authorization", `Bearer ${CRON_TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ date: "2026-09-24", items: 1 });
    expect(service.getToday).toHaveBeenCalledTimes(1);
  });

  it("does not expose the scheduler route without a token", async () => {
    const { app } = createBriefApp();
    expect((await request(app).post("/api/internal/prep-brief")).status).toBe(404);
  });
});
