import { writePrepNarrative } from "../agents/prep-brief-narrative.js";
import type { RespondStructured } from "../agents/openai-structured.js";
import type { DemandRepository } from "../repositories/demand-repository.js";
import type {
  PrepBriefRecord,
  PrepBriefRepository,
} from "../repositories/prep-brief-repository.js";
import { buildPrepForecast, comparisonDates } from "./prep-forecast.js";
import type { ProductService } from "./product-service.js";

const MENU_LIMIT = 100;

export interface PrepBriefService {
  // Today's brief, generated on first request each shop day and then reused.
  getToday(): Promise<PrepBriefRecord>;
  regenerateToday(): Promise<PrepBriefRecord>;
}

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

  const generate = (date: string) => {
    const running = inFlight.get(date);
    if (running) return running;
    const job = (async () => {
      const [demand, { items: products }] = await Promise.all([
        demandRepository.getDailyVariantDemand(comparisonDates(date), timezone),
        productService.listPublic({
          page: 1,
          limit: MENU_LIMIT,
          available: "all",
          sortBy: "name",
          sortOrder: "asc",
        }),
      ]);
      const forecast = buildPrepForecast({ date, demand, products });
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

  return {
    async getToday() {
      const date = today();
      return (await briefRepository.findByDate(date)) ?? generate(date);
    },
    regenerateToday: () => generate(today()),
  };
};
