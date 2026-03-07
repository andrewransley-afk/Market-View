import { getDatabase } from "./schema";
import { CompetitorAvailability, HXAllocation } from "../types";

export function upsertCompetitorAvailability(
  competitor: string,
  date: string,
  available: boolean,
  tickets?: number
): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO competitor_availability (competitor, date, available, tickets, scraped_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(competitor, date) DO UPDATE SET
      available = excluded.available,
      tickets = excluded.tickets,
      scraped_at = excluded.scraped_at
  `).run(competitor, date, available ? 1 : 0, tickets ?? null);
}

export function upsertHXAllocation(
  date: string,
  timeSlot: string,
  ticketsAvailable: number
): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO hx_allocation (date, time_slot, tickets_available, scraped_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(date, time_slot) DO UPDATE SET
      tickets_available = excluded.tickets_available,
      scraped_at = excluded.scraped_at
  `).run(date, timeSlot, ticketsAvailable);
}

export function getCompetitorAvailability(
  startDate: string,
  endDate: string
): CompetitorAvailability[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT competitor, date, available, tickets, scraped_at
       FROM competitor_availability
       WHERE date >= ? AND date <= ?
       ORDER BY date, competitor`
    )
    .all(startDate, endDate) as {
    competitor: string;
    date: string;
    available: number;
    tickets: number | null;
    scraped_at: string;
  }[];

  return rows.map((row) => ({
    competitor: row.competitor,
    date: row.date,
    available: row.available === 1,
    tickets: row.tickets ?? undefined,
    scrapedAt: new Date(row.scraped_at),
  }));
}

export function getHXAllocations(
  startDate: string,
  endDate: string
): HXAllocation[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT date, time_slot, tickets_available
       FROM hx_allocation
       WHERE date >= ? AND date <= ?
       ORDER BY date, time_slot`
    )
    .all(startDate, endDate) as {
    date: string;
    time_slot: string;
    tickets_available: number;
  }[];

  return rows.map((row) => ({
    date: row.date,
    timeSlot: row.time_slot,
    ticketsAvailable: row.tickets_available,
  }));
}

export function recordStockSnapshot(
  date: string,
  source: string,
  tickets: number
): void {
  const db = getDatabase();
  // One snapshot per source per tour-date per calendar day
  db.prepare(`
    INSERT INTO stock_history (date, source, tickets, recorded_at, recorded_date)
    VALUES (?, ?, ?, datetime('now'), date('now'))
    ON CONFLICT DO NOTHING
  `).run(date, source, tickets);
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

export function getStockTrends(
  startDate: string,
  endDate: string
): Map<string, StockTrend> {
  const db = getDatabase();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const rows = db.prepare(`
    SELECT date, source, tickets, recorded_date
    FROM stock_history
    WHERE date >= ? AND date <= ?
      AND recorded_date IN (?, ?, ?)
    ORDER BY date, source
  `).all(startDate, endDate, today, yesterday, weekAgo) as {
    date: string;
    source: string;
    tickets: number;
    recorded_date: string;
  }[];

  const trends = new Map<string, StockTrend>();

  for (const row of rows) {
    if (!trends.has(row.date)) {
      trends.set(row.date, {
        date: row.date,
        wbNow: null, wb24h: null, wb7d: null,
        hxNow: null, hx24h: null, hx7d: null,
      });
    }
    const t = trends.get(row.date)!;
    const isWB = row.source === "wb";
    const isHX = row.source === "hx";

    if (row.recorded_date === today) {
      if (isWB) t.wbNow = row.tickets;
      if (isHX) t.hxNow = row.tickets;
    } else if (row.recorded_date === yesterday) {
      if (isWB) t.wb24h = row.tickets;
      if (isHX) t.hx24h = row.tickets;
    } else if (row.recorded_date === weekAgo) {
      if (isWB) t.wb7d = row.tickets;
      if (isHX) t.hx7d = row.tickets;
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

export function getDateHistory(tourDate: string): DateHistory[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT date, source, tickets, recorded_date
       FROM stock_history
       WHERE date = ?
       ORDER BY recorded_date, source`
    )
    .all(tourDate) as {
    date: string;
    source: string;
    tickets: number;
    recorded_date: string;
  }[];

  return rows.map((row) => ({
    date: row.date,
    source: row.source,
    tickets: row.tickets,
    recordedDate: row.recorded_date,
  }));
}

export function getLatestScrapeTime(): string | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT MAX(scraped_at) as latest FROM competitor_availability`
    )
    .get() as { latest: string | null } | undefined;

  return row?.latest || null;
}
