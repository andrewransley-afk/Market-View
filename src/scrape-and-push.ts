/**
 * Runs all scrapers locally, then pushes results to the remote dashboard.
 * Usage: npx tsx src/scrape-and-push.ts
 */
import "dotenv/config";
import { initDatabase, getClient } from "./db/schema";
import { runAllScrapers } from "./scrapers/run-all";
import { fetchHXAllocation } from "./api/hx-rate-checker";

const REMOTE_URL = process.env.REMOTE_URL;
const API_KEY = process.env.API_KEY;

interface ImportPayload {
  competitors: { competitor: string; date: string; available: boolean; tickets?: number }[];
  hxAllocations: { date: string; timeSlot: string; ticketsAvailable: number }[];
  stockSnapshots: { date: string; source: string; tickets: number; recordedDate: string }[];
}

async function main() {
  await initDatabase();

  console.log("[Push] Starting local scrape...");

  // 1. Run scrapers
  const reports = await runAllScrapers(90);
  const successful = reports.filter((r) => r.success).length;
  console.log(`[Push] Scrapers done: ${successful}/${reports.length} succeeded`);

  // 2. Fetch HX allocation
  const allocations = await fetchHXAllocation(90);
  console.log(`[Push] HX: ${allocations.length} allocation records`);

  // 3. Build payload from local DB
  const db = getClient();

  const competitors = (await db.execute(
    `SELECT competitor, date, available, tickets FROM competitor_availability`
  )).rows;

  const hxRows = (await db.execute(
    `SELECT date, time_slot, tickets_available FROM hx_allocation`
  )).rows;

  const stockRows = (await db.execute(
    `SELECT date, source, tickets, recorded_date FROM stock_history`
  )).rows;

  const payload: ImportPayload = {
    competitors: competitors.map((r) => ({
      competitor: r.competitor as string,
      date: r.date as string,
      available: r.available === 1,
      tickets: r.tickets != null ? (r.tickets as number) : undefined,
    })),
    hxAllocations: hxRows.map((r) => ({
      date: r.date as string,
      timeSlot: r.time_slot as string,
      ticketsAvailable: r.tickets_available as number,
    })),
    stockSnapshots: stockRows.map((r) => ({
      date: r.date as string,
      source: r.source as string,
      tickets: r.tickets as number,
      recordedDate: r.recorded_date as string,
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
