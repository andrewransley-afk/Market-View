import { getDatabase } from "./schema";
import { CompetitorAvailability, HXAllocation } from "../types";

export function upsertCompetitorAvailability(
  competitor: string,
  date: string,
  available: boolean,
  tickets?: number
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO competitor_availability (competitor, date, available, tickets, scraped_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(competitor, date) DO UPDATE SET
       available = excluded.available,
       tickets = excluded.tickets,
       scraped_at = excluded.scraped_at`
  ).run(competitor, date, available ? 1 : 0, tickets ?? null);
}

export function upsertHXAllocation(
  date: string,
  timeSlot: string,
  ticketsAvailable: number
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO hx_allocation (date, time_slot, tickets_available, scraped_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(date, time_slot) DO UPDATE SET
       tickets_available = excluded.tickets_available,
       scraped_at = excluded.scraped_at`
  ).run(date, timeSlot, ticketsAvailable);
}

export function clearStaleHXSlots(date: string, activeSlots: string[]): void {
  const db = getDatabase();
  if (activeSlots.length === 0) return;
  const placeholders = activeSlots.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM hx_allocation WHERE date = ? AND time_slot NOT IN (${placeholders})`
  ).run(date, ...activeSlots);
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
    .all(startDate, endDate) as any[];

  return rows.map((row) => ({
    competitor: row.competitor,
    date: row.date,
    available: row.available === 1,
    tickets: row.tickets != null ? row.tickets : undefined,
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
    .all(startDate, endDate) as any[];

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
  db.prepare(
    `INSERT INTO stock_history (date, source, tickets, recorded_at, recorded_date)
     VALUES (?, ?, ?, datetime('now'), date('now'))
     ON CONFLICT DO NOTHING`
  ).run(date, source, tickets);
}

export interface StockTrend {
  date: string;
  wbNow: number | null;
  wb24h: number | null;
  hxNow: number | null;
  hx24h: number | null;
}

export function getStockTrends(
  startDate: string,
  endDate: string
): Map<string, StockTrend> {
  const db = getDatabase();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const rows = db
    .prepare(
      `SELECT date, source, tickets, recorded_date
       FROM stock_history
       WHERE date >= ? AND date <= ?
         AND recorded_date IN (?, ?)
       ORDER BY date, source`
    )
    .all(startDate, endDate, today, yesterday) as any[];

  const trends = new Map<string, StockTrend>();

  for (const row of rows) {
    const date = row.date;
    const source = row.source;
    const tickets = row.tickets;
    const recordedDate = row.recorded_date;

    if (!trends.has(date)) {
      trends.set(date, {
        date,
        wbNow: null, wb24h: null,
        hxNow: null, hx24h: null,
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
    .all(tourDate) as any[];

  return rows.map((row) => ({
    date: row.date,
    source: row.source,
    tickets: row.tickets,
    recordedDate: row.recorded_date,
  }));
}

export interface HistoricalDay {
  date: string;
  wb: number | null;
  hx: number | null;
  golden: number | null;
  booking: number | null;
  premium: number | null;
  gyg: number | null;
}

export function getAvailableHistoricalDates(): string[] {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT DISTINCT recorded_date FROM stock_history ORDER BY recorded_date DESC`)
    .all() as any[];
  return rows.map((r) => r.recorded_date);
}

export function getHistoricalOverview(recordedDate: string): HistoricalDay[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT date, source, tickets
       FROM stock_history
       WHERE recorded_date = ?
       ORDER BY date, source`
    )
    .all(recordedDate) as any[];

  const byDate = new Map<string, HistoricalDay>();
  for (const row of rows) {
    if (!byDate.has(row.date)) {
      byDate.set(row.date, {
        date: row.date,
        wb: null, hx: null, golden: null, booking: null, premium: null, gyg: null,
      });
    }
    const day = byDate.get(row.date)!;
    const source = row.source as string;
    if (source in day) {
      (day as any)[source] = row.tickets;
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// --- Price Changes ---

export interface PriceChange {
  tourDate: string;
  oldPrice: number | null;
  newPrice: number;
  note: string | null;
  hxStockAtChange: number | null;
  wbStockAtChange: number | null;
  changedAt: string;
  changedDate: string;
}

export function upsertPriceChange(
  tourDate: string,
  oldPrice: number | null,
  newPrice: number,
  note: string | null,
  changedDate?: string
): void {
  const db = getDatabase();

  // Grab current stock levels at time of change
  const hxRow = db.prepare(
    `SELECT SUM(tickets_available) as total FROM hx_allocation WHERE date = ?`
  ).get(tourDate) as any;
  const wbRow = db.prepare(
    `SELECT tickets FROM competitor_availability WHERE competitor = 'WB Studio Tour Direct' AND date = ?`
  ).get(tourDate) as any;

  const hxStock = hxRow?.total ?? null;
  const wbStock = wbRow?.tickets ?? null;
  const cd = changedDate || new Date().toISOString().split("T")[0];

  db.prepare(
    `INSERT INTO price_changes (tour_date, old_price, new_price, note, hx_stock_at_change, wb_stock_at_change, changed_at, changed_date)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(tour_date, changed_date) DO UPDATE SET
       old_price = excluded.old_price,
       new_price = excluded.new_price,
       note = excluded.note,
       hx_stock_at_change = excluded.hx_stock_at_change,
       wb_stock_at_change = excluded.wb_stock_at_change,
       changed_at = excluded.changed_at`
  ).run(tourDate, oldPrice, newPrice, note, hxStock, wbStock, cd);
}

export function getPriceChange(tourDate: string): PriceChange | null {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT tour_date, old_price, new_price, note, hx_stock_at_change, wb_stock_at_change, changed_at, changed_date
     FROM price_changes WHERE tour_date = ?
     ORDER BY changed_date DESC LIMIT 1`
  ).get(tourDate) as any;
  if (!row) return null;
  return {
    tourDate: row.tour_date,
    oldPrice: row.old_price,
    newPrice: row.new_price,
    note: row.note,
    hxStockAtChange: row.hx_stock_at_change,
    wbStockAtChange: row.wb_stock_at_change,
    changedAt: row.changed_at,
    changedDate: row.changed_date,
  };
}

export function getPriceChangeHistory(tourDate: string): PriceChange[] {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT tour_date, old_price, new_price, note, hx_stock_at_change, wb_stock_at_change, changed_at, changed_date
     FROM price_changes WHERE tour_date = ?
     ORDER BY changed_date DESC`
  ).all(tourDate) as any[];
  return rows.map((row) => ({
    tourDate: row.tour_date,
    oldPrice: row.old_price,
    newPrice: row.new_price,
    note: row.note,
    hxStockAtChange: row.hx_stock_at_change,
    wbStockAtChange: row.wb_stock_at_change,
    changedAt: row.changed_at,
    changedDate: row.changed_date,
  }));
}

export function getAllPriceChanges(): PriceChange[] {
  const db = getDatabase();
  // Return only the most recent change per tour_date for dashboard display
  const rows = db.prepare(
    `SELECT p.tour_date, p.old_price, p.new_price, p.note, p.hx_stock_at_change, p.wb_stock_at_change, p.changed_at, p.changed_date
     FROM price_changes p
     INNER JOIN (
       SELECT tour_date, MAX(changed_date) as max_cd
       FROM price_changes GROUP BY tour_date
     ) latest ON p.tour_date = latest.tour_date AND p.changed_date = latest.max_cd
     ORDER BY p.tour_date`
  ).all() as any[];
  return rows.map((row) => ({
    tourDate: row.tour_date,
    oldPrice: row.old_price,
    newPrice: row.new_price,
    note: row.note,
    hxStockAtChange: row.hx_stock_at_change,
    wbStockAtChange: row.wb_stock_at_change,
    changedAt: row.changed_at,
    changedDate: row.changed_date,
  }));
}

export function getPriceChangeImpact(tourDate: string): { recordedDate: string; hx: number | null; wb: number | null }[] {
  const db = getDatabase();
  // Get stock movement from the date of the price change onwards
  const pc = db.prepare(`SELECT changed_date FROM price_changes WHERE tour_date = ?`).get(tourDate) as any;
  if (!pc) return [];

  const rows = db.prepare(
    `SELECT recorded_date, source, tickets
     FROM stock_history
     WHERE date = ? AND source IN ('hx', 'wb') AND recorded_date >= ?
     ORDER BY recorded_date`
  ).all(tourDate, pc.changed_date) as any[];

  const byDate = new Map<string, { recordedDate: string; hx: number | null; wb: number | null }>();
  for (const row of rows) {
    if (!byDate.has(row.recorded_date)) {
      byDate.set(row.recorded_date, { recordedDate: row.recorded_date, hx: null, wb: null });
    }
    const entry = byDate.get(row.recorded_date)!;
    if (row.source === "hx") entry.hx = row.tickets;
    if (row.source === "wb") entry.wb = row.tickets;
  }

  return Array.from(byDate.values());
}

export function getLatestScrapeTime(): string | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT MAX(scraped_at) as latest FROM competitor_availability`)
    .get() as any;

  return row?.latest || null;
}

export function getSetting(key: string): string | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(key) as any;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function upsertYieldRate(tourDate: string, yieldAmount: number): void {
  const db = getDatabase();

  // Check if yield changed — if so, log a price change
  const existing = db.prepare(`SELECT yield_amount FROM yield_rates WHERE tour_date = ?`).get(tourDate) as any;
  if (existing && existing.yield_amount !== yieldAmount) {
    const increment = yieldAmount - existing.yield_amount;
    upsertPriceChange(tourDate, null, increment, null);
  }

  db.prepare(
    `INSERT INTO yield_rates (tour_date, yield_amount, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(tour_date) DO UPDATE SET yield_amount = excluded.yield_amount, updated_at = datetime('now')`
  ).run(tourDate, yieldAmount);
}

export function getAllYieldRates(): { tourDate: string; yieldAmount: number }[] {
  const db = getDatabase();
  const rows = db.prepare(`SELECT tour_date, yield_amount FROM yield_rates ORDER BY tour_date`).all() as any[];
  return rows.map(r => ({ tourDate: r.tour_date, yieldAmount: r.yield_amount }));
}
