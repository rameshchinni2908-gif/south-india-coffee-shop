import { writePrepNarrative } from "../agents/prep-brief-narrative.js";
import type { RespondStructured } from "../agents/openai-structured.js";
import type { DemandRepository } from "../repositories/demand-repository.js";
import type {
  PrepBriefRecord,
  PrepBriefRepository,
} from "../repositories/prep-brief-repository.js";
import {
  buildPrepForecast,
  comparisonDates,
  withLiveStock,
  type PrepForecast,
} from "./prep-forecast.js";
import type { ProductService } from "./product-service.js";

const MENU_LIMIT = 100;
const STOCK_FIELDS = ["orderedToday", "stockQuantity", "isAvailable", "restockNeeded"] as const;

export interface PrepBriefService {
  // Today's brief, generated on first request each shop day and then reused. Its stock
  // columns are recalculated on every read from current stock and today's orders.
  getToday(): Promise<PrepBriefRecord>;
  regenerateToday(): Promise<PrepBriefRecord>;
}

const stockChanged = (saved: PrepForecast, live: PrepForecast): boolean =>
  saved.items.length !== live.items.length ||
  live.items.some((item, index) =>
    STOCK_FIELDS.some((field) => saved.items[index]?.[field] !== item[field]),
  );

export const createPrepBriefService = ({
  demandRepository,
  briefRepository,
  productService,
  narrate,
  model,
  timezone,
  now = () => new Date(),
}: {
  demandRepository: DemandRepository;
  briefRepository: PrepBriefRepository;
  productService: Pick<ProductService, "listPublic">;
  // Without a model the brief is the forecast table alone.
  narrate?: RespondStructured | undefined;
  model?: string | undefined;
  timezone: string;
  now?: () => Date;
}): PrepBriefService => {
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now());
  // Concurrent first visits share one generation instead of paying for several.
  const inFlight = new Map<string, Promise<PrepBriefRecord>>();

  const listProducts = async () =>
    (
      await productService.listPublic({
        page: 1,
        limit: MENU_LIMIT,
        available: "all",
        sortBy: "name",
        sortOrder: "asc",
      })
    ).items;

  const generate = (date: string) => {
    const running = inFlight.get(date);
    if (running) return running;
    const job = (async () => {
      const [demand, todayDemand, products] = await Promise.all([
        demandRepository.getDailyVariantDemand(comparisonDates(date), timezone),
        demandRepository.getDailyVariantDemand([date], timezone),
        listProducts(),
      ]);
      const forecast = buildPrepForecast({ date, demand, todayDemand, products });
      const narrative = await writePrepNarrative(forecast, narrate);
      return briefRepository.save({
        date,
        forecast,
        narrative: narrative.narrative,
        narrativeStatus: narrative.status,
        model: narrative.status === "WRITTEN" ? (model ?? null) : null,
        generatedAt: now(),
      });
    })().finally(() => inFlight.delete(date));
    inFlight.set(date, job);
    return job;
  };

  const refreshStock = async (brief: PrepBriefRecord): Promise<PrepBriefRecord> => {
    const [todayDemand, products] = await Promise.all([
      demandRepository.getDailyVariantDemand([brief.date], timezone),
      listProducts(),
    ]);
    const forecast = withLiveStock({ forecast: brief.forecast, todayDemand, products });
    // The written summary quotes the stock numbers it was given. Once they change it would
    // contradict the table, so it is withheld until an admin regenerates the brief.
    return brief.narrative && stockChanged(brief.forecast, forecast)
      ? { ...brief, forecast, narrative: null, narrativeStatus: "OUTDATED", model: null }
      : { ...brief, forecast };
  };

  return {
    async getToday() {
      const date = today();
      const saved = await briefRepository.findByDate(date);
      return saved ? refreshStock(saved) : generate(date);
    },
    regenerateToday: () => generate(today()),
  };
};
