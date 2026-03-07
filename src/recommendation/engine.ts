import { DayOverview, CompetitorAvailability, HXAllocation } from "../types";
import {
  getCompetitorAvailability,
  getHXAllocations,
  getStockTrends,
} from "../db/queries";
import { formatDate } from "../scrapers/scraper-interface";

export function generateRecommendations(days: number = 90): DayOverview[] {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 4);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  const competitorData = getCompetitorAvailability(startStr, endStr);
  const allocationData = getHXAllocations(startStr, endStr);
  const trends = getStockTrends(startStr, endStr);

  // Group by date
  const competitorsByDate = new Map<string, CompetitorAvailability[]>();
  for (const item of competitorData) {
    const existing = competitorsByDate.get(item.date) || [];
    existing.push(item);
    competitorsByDate.set(item.date, existing);
  }

  const allocationsByDate = new Map<string, HXAllocation[]>();
  for (const item of allocationData) {
    const existing = allocationsByDate.get(item.date) || [];
    existing.push(item);
    allocationsByDate.set(item.date, existing);
  }

  // Build overview for each date
  const overviews: DayOverview[] = [];
  const allDates = new Set([
    ...competitorsByDate.keys(),
    ...allocationsByDate.keys(),
  ]);

  for (const date of allDates) {
    const competitors = competitorsByDate.get(date) || [];
    const allocation = allocationsByDate.get(date) || [];

    const totalStock = allocation.reduce(
      (sum, a) => sum + a.ticketsAvailable,
      0
    );
    // Get WB Direct tickets and non-WB competitor sold-out count
    const wbDirect = competitors.find(
      (c) => c.competitor === "WB Studio Tour Direct"
    );
    const wbTickets = wbDirect?.tickets ?? null;
    const otherCompetitors = competitors.filter(
      (c) => c.competitor !== "WB Studio Tour Direct"
    );
    const otherSoldOutCount = otherCompetitors.filter((c) => !c.available).length;
    const soldOutCount = competitors.filter((c) => !c.available).length;

    const recommendation = calculateRecommendation(
      wbTickets,
      otherSoldOutCount
    );

    const trend = trends.get(date);

    overviews.push({
      date,
      allocation,
      totalStock,
      competitors,
      recommendation,
      soldOutCount,
      wbTrend: trend ? { now: trend.wbNow, d1: trend.wb24h, d7: trend.wb7d } : undefined,
      hxTrend: trend ? { now: trend.hxNow, d1: trend.hx24h, d7: trend.hx7d } : undefined,
    });
  }

  // Sort by date
  overviews.sort((a, b) => a.date.localeCompare(b.date));

  return overviews;
}

export function calculateRecommendation(
  wbTickets: number | null,
  otherSoldOutCount: number
): "wb-low" | "yield" | "wb-sold-out" | "hold" {
  const wbSoldOut = wbTickets !== null && wbTickets === 0;
  const wbLow = wbTickets !== null && wbTickets > 0 && wbTickets < 30;

  // 1) WB close to selling out (< 30 tickets), regardless of others
  if (wbLow) return "wb-low";

  // 2) WB sold out or low AND 2+ other partners sold out = yield opportunity
  if ((wbSoldOut || wbLow) && otherSoldOutCount >= 2) return "yield";

  // 3) WB sold out and no other partners sold out
  if (wbSoldOut && otherSoldOutCount === 0) return "wb-sold-out";

  return "hold";
}
