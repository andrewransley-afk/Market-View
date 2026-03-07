import { getClient } from "./schema";
import { CompetitorAvailability, HXAllocation } from "../types";

export async function upsertCompetitorAvailability(
  competitor: string,
  date: string,
  available: boolean,
  tickets?: number
): Promise<void> {
  const db = getClient();
  await db.execute({
    sql: `INSERT INTO competitor_availability (competitor, date, available, tickets, scraped_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(competitor, date) DO UPDATE SET
            available = excluded.available,
            tickets = excluded.tickets,
            scraped_at = excluded.scraped_at`,
    args: [competitor, date, available ? 1 : 0, tickets ?? null],
  });
}

export async function upsertHXAllocation(
  date: string,
  timeSlot: string,
  ticketsAvailable: number
): Promise<void> {
  const db = getClient();
  await db.execute({
    sql: `INSERT INTO hx_allocation (date, time_slot, tickets_available, scraped_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(date, time_slot) DO UPDATE SET
            tickets_available = excluded.tickets_available,
            scraped_at = excluded.scraped_at`,
    args: [date, timeSlot, ticketsAvailable],
  });
}

export async function getCompetitorAvailability(
  startDate: string,
  endDate: string
): Promise<CompetitorAvailability[]> {
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT competitor, date, available, tickets, scraped_at
          FROM competitor_availability
          WHERE date >= ? AND date <= ?
          ORDER BY date, competitor`,
    args: [startDate, endDate],
  });

  return result.rows.map((row) => ({
    competitor: row.competitor as string,
    date: row.date as string,
    available: row.available === 1,
    tickets: row.tickets != null ? (row.tickets as number) : undefined,
    scrapedAt: new Date(row.scraped_at as string),
  }));
}

export async function getHXAllocations(
  startDate: string,
  endDate: string
): Promise<HXAllocation[]> {
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT date, time_slot, tickets_available
          FROM hx_allocation
          WHERE date >= ? AND date <= ?
          ORDER BY date, time_slot`,
    args: [startDate, endDate],
  });

  return result.rows.map((row) => ({
    date: row.date as string,
    timeSlot: row.time_slot as string,
    ticketsAvailable: row.tickets_available as number,
  }));
}

export async function recordStockSnapshot(
  date: string,
  source: string,
  tickets: number
): Promise<void> {
  const db = getClient();
  await db.execute({
    sql: `INSERT INTO stock_history (date, source, tickets, recorded_at, recorded_date)
          VALUES (?, ?, ?, datetime('now'), date('now'))
          ON CONFLICT DO NOTHING`,
    args: [date, source, tickets],
  });
}

export async function importStockSnapshot(
  date: string,
  source: string,
  tickets: number,
  recordedDate: string
): Promise<void> {
  const db = getClient();
  await db.execute({
    sql: `INSERT INTO stock_history (date, source, tickets, recorded_at, recorded_date)
          VALUES (?, ?, ?, datetime('now'), ?)
          ON CONFLICT DO NOTHING`,
    args: [date, source, tickets, recordedDate],
  });
}

export interface StockTrend {
  date: string;
  wbNow: number | null;
  wb24h: number | null;
  wb7d: number | null;
  hxNow: number | null;
  hx24h: number | null;
  hx7d: number | null;
}

export async function getStockTrends(
  startDate: string,
  endDate: string
): Promise<Map<string, StockTrend>> {
  const db = getClient();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const result = await db.execute({
    sql: `SELECT date, source, tickets, recorded_date
          FROM stock_history
          WHERE date >= ? AND date <= ?
            AND recorded_date IN (?, ?, ?)
          ORDER BY date, source`,
    args: [startDate, endDate, today, yesterday, weekAgo],
  });

  const trends = new Map<string, StockTrend>();

  for (const row of result.rows) {
    const date = row.date as string;
    const source = row.source as string;
    const tickets = row.tickets as number;
    const recordedDate = row.recorded_date as string;

    if (!trends.has(date)) {
      trends.set(date, {
        date,
        wbNow: null, wb24h: null, wb7d: null,
        hxNow: null, hx24h: null, hx7d: null,
      });
    }
    const t = trends.get(date)!;
    const isWB = source === "wb";
    const isHX = source === "hx";

    if (recordedDate === today) {
      if (isWB) t.wbNow = tickets;
      if (isHX) t.hxNow = tickets;
    } else if (recordedDate === yesterday) {
      if (isWB) t.wb24h = tickets;
      if (isHX) t.hx24h = tickets;
    } else if (recordedDate === weekAgo) {
      if (isWB) t.wb7d = tickets;
      if (isHX) t.hx7d = tickets;
    }
  }

  return trends;
}

export interface DateHistory {
  date: string;
  source: string;
  tickets: number;
  recordedDate: string;
}

export async function getDateHistory(tourDate: string): Promise<DateHistory[]> {
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT date, source, tickets, recorded_date
          FROM stock_history
          WHERE date = ?
          ORDER BY recorded_date, source`,
    args: [tourDate],
  });

  return result.rows.map((row) => ({
    date: row.date as string,
    source: row.source as string,
    tickets: row.tickets as number,
    recordedDate: row.recorded_date as string,
  }));
}

export async function getLatestScrapeTime(): Promise<string | null> {
  const db = getClient();
  const result = await db.execute(
    `SELECT MAX(scraped_at) as latest FROM competitor_availability`
  );

  return (result.rows[0]?.latest as string) || null;
}
