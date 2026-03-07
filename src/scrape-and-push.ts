/**
 * Runs all scrapers locally, then pushes results to the remote dashboard.
 * Usage: npx tsx src/scrape-and-push.ts
 */
import "dotenv/config";
import { runAllScrapers } from "./scrapers/run-all";
import { fetchHXAllocation } from "./api/hx-rate-checker";
import {
  upsertCompetitorAvailability,
  recordStockSnapshot,
  upsertHXAllocation,
} from "./db/queries";

const REMOTE_URL = process.env.REMOTE_URL;
const API_KEY = process.env.API_KEY;

interface ImportPayload {
  competitors: { competitor: string; date: string; available: boolean; tickets?: number }[];
  hxAllocations: { date: string; timeSlot: string; ticketsAvailable: number }[];
  stockSnapshots: { date: string; source: string; tickets: number }[];
}

async function main() {
  console.log("[Push] Starting local scrape...");

  // 1. Run scrapers
  const reports = await runAllScrapers(90);
  const successful = reports.filter((r) => r.success).length;
  console.log(`[Push] Scrapers done: ${successful}/${reports.length} succeeded`);

  // 2. Fetch HX allocation
  const allocations = await fetchHXAllocation(90);
  console.log(`[Push] HX: ${allocations.length} allocation records`);

  // 3. Build payload from local DB
  const { getDatabase } = await import("./db/schema");
  const db = getDatabase();

  const competitors = db
    .prepare(
      `SELECT competitor, date, available, tickets FROM competitor_availability`
    )
    .all() as { competitor: string; date: string; available: number; tickets: number | null }[];

  const hxRows = db
    .prepare(`SELECT date, time_slot, tickets_available FROM hx_allocation`)
    .all() as { date: string; time_slot: string; tickets_available: number }[];

  const stockRows = db
    .prepare(`SELECT date, source, tickets, recorded_date FROM stock_history`)
    .all() as { date: string; source: string; tickets: number; recorded_date: string }[];

  const payload: ImportPayload = {
    competitors: competitors.map((r) => ({
      competitor: r.competitor,
      date: r.date,
      available: r.available === 1,
      tickets: r.tickets ?? undefined,
    })),
    hxAllocations: hxRows.map((r) => ({
      date: r.date,
      timeSlot: r.time_slot,
      ticketsAvailable: r.tickets_available,
    })),
    stockSnapshots: stockRows.map((r) => ({
      date: r.date,
      source: r.source,
      tickets: r.tickets,
      recordedDate: r.recorded_date,
    })),
  };

  const total =
    payload.competitors.length +
    payload.hxAllocations.length +
    payload.stockSnapshots.length;

  console.log(`[Push] Payload: ${total} total records`);

  // 4. Push to remote
  if (!REMOTE_URL) {
    console.log("[Push] No REMOTE_URL set in .env — skipping push");
    return;
  }

  console.log(`[Push] Pushing to ${REMOTE_URL}...`);

  // Send in chunks to avoid payload size limits
  const CHUNK = 500;
  let totalImported = 0;

  for (let i = 0; i < payload.competitors.length; i += CHUNK) {
    const chunk: ImportPayload = {
      competitors: payload.competitors.slice(i, i + CHUNK),
      hxAllocations: i === 0 ? payload.hxAllocations : [],
      stockSnapshots: [],
    };
    const result = await pushChunk(chunk);
    if (result === null) return;
    totalImported += result;
  }

  for (let i = 0; i < payload.stockSnapshots.length; i += CHUNK) {
    const chunk: ImportPayload = {
      competitors: [],
      hxAllocations: [],
      stockSnapshots: payload.stockSnapshots.slice(i, i + CHUNK),
    };
    const result = await pushChunk(chunk);
    if (result === null) return;
    totalImported += result;
  }

  console.log(`[Push] Done — ${totalImported} total records imported`);
}

async function pushChunk(chunk: ImportPayload): Promise<number | null> {
  const resp = await fetch(`${REMOTE_URL}/api/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "x-api-key": API_KEY } : {}),
    },
    body: JSON.stringify(chunk),
  });

  if (!resp.ok) {
    console.error(`[Push] Failed: ${resp.status} ${resp.statusText}`);
    return null;
  }

  const result = (await resp.json()) as { imported: number };
  console.log(`[Push]   chunk: ${result.imported} records`);
  return result.imported;
}

main().catch(console.error);
