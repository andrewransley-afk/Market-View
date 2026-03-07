import { CompetitorScraper } from "../types";

export type { CompetitorScraper };

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function generateDateRange(
  startDate: Date,
  days: number
): string[] {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}
