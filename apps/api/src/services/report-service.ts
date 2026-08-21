import type { ReportRepository } from "../repositories/report-repository.js";
import { ORDER_STATUSES } from "../types/order.js";
import type { DashboardSummary, DateRange } from "../types/report.js";

export interface ReportService {
  getSummary(): Promise<DashboardSummary>;
}

interface CreateReportServiceOptions {
  reportRepository: ReportRepository;
  timezone: string;
  now?: () => Date;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const getCalendarDate = (date: Date, timezone: string): CalendarDate => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
};

const shiftCalendarDate = (date: CalendarDate, options: { days?: number; months?: number }) => {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1 + (options.months ?? 0), date.day + (options.days ?? 0)),
  );

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

const zonedMidnightToUtc = (date: CalendarDate, timezone: string): Date => {
  const desiredTimestamp = Date.UTC(date.year, date.month - 1, date.day);
  let utcTimestamp = desiredTimestamp;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = getCalendarDate(new Date(utcTimestamp), timezone);
    const actualTimestamp = Date.UTC(actual.year, actual.month - 1, actual.day);
    const timeParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utcTimestamp));
    const timeValues = Object.fromEntries(
      timeParts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
    );
    const actualWithTime =
      actualTimestamp +
      Number(timeValues.hour) * 60 * 60 * 1000 +
      Number(timeValues.minute) * 60 * 1000 +
      Number(timeValues.second) * 1000;

    utcTimestamp += desiredTimestamp - actualWithTime;
  }

  return new Date(utcTimestamp);
};

const createRanges = (now: Date, timezone: string): { today: DateRange; month: DateRange } => {
  const today = getCalendarDate(now, timezone);
  const tomorrow = shiftCalendarDate(today, { days: 1 });
  const monthStart = { ...today, day: 1 };
  const nextMonthStart = shiftCalendarDate(monthStart, { months: 1 });

  return {
    today: {
      start: zonedMidnightToUtc(today, timezone),
      end: zonedMidnightToUtc(tomorrow, timezone),
    },
    month: {
      start: zonedMidnightToUtc(monthStart, timezone),
      end: zonedMidnightToUtc(nextMonthStart, timezone),
    },
  };
};

export const createReportService = ({
  reportRepository,
  timezone,
  now = () => new Date(),
}: CreateReportServiceOptions): ReportService => ({
  async getSummary() {
    const generatedAt = now();
    const ranges = createRanges(generatedAt, timezone);
    const [todaySales, monthSales, statusCountRows, lowStockOverview, recentPriceChanges] =
      await Promise.all([
        reportRepository.getSalesSummary(ranges.today),
        reportRepository.getSalesSummary(ranges.month),
        reportRepository.getOrderStatusCounts(ranges.today),
        reportRepository.getLowStockOverview(10),
        reportRepository.listRecentPriceChanges(10),
      ]);
    const statusCounts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<
      (typeof ORDER_STATUSES)[number],
      number
    >;

    for (const row of statusCountRows) {
      statusCounts[row.status] = row.count;
    }

    return {
      generatedAt,
      timezone,
      today: {
        ...todaySales,
        totalOrders: statusCountRows.reduce((total, row) => total + row.count, 0),
        statusCounts,
      },
      month: monthSales,
      lowStockTotal: lowStockOverview.total,
      lowStockVariants: lowStockOverview.variants,
      recentPriceChanges,
    };
  },
});
