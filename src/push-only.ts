/**
 * Push existing local database to remote dashboard (no scraping).
 * Usage: npx tsx src/push-only.ts
 */
import "dotenv/config";
import { getDatabase } from "./db/schema";

const REMOTE_URL = process.env.REMOTE_URL;
const API_KEY = process.env.API_KEY;

async function main() {
  if (!REMOTE_URL) {
    console.log("[Push] No REMOTE_URL set in .env");
    return;
  }

  const db = getDatabase();

  const competitors = db
    .prepare(`SELECT competitor, date, available, tickets FROM competitor_availability`)
    .all() as { competitor: string; date: string; available: number; tickets: number | null }[];

  const hxRows = db
    .prepare(`SELECT date, time_slot, tickets_available FROM hx_allocation`)
    .all() as { date: string; time_slot: string; tickets_available: number }[];

  const stockRows = db
    .prepare(`SELECT date, source, tickets, recorded_date FROM stock_history`)
    .all() as { date: string; source: string; tickets: number; recorded_date: string }[];

  console.log(`[Push] ${competitors.length} competitor + ${hxRows.length} HX + ${stockRows.length} stock records`);

  const CHUNK = 500;
  let total = 0;

  // Push competitors
  for (let i = 0; i < competitors.length; i += CHUNK) {
    const body = {
      competitors: competitors.slice(i, i + CHUNK).map((r) => ({
        competitor: r.competitor,
        date: r.date,
        available: r.available === 1,
        tickets: r.tickets ?? undefined,
      })),
      hxAllocations: i === 0 ? hxRows.map((r) => ({
        date: r.date,
        timeSlot: r.time_slot,
        ticketsAvailable: r.tickets_available,
      })) : [],
      stockSnapshots: [],
    };
    const n = await push(body);
    if (n === null) return;
    total += n;
  }

  // Push stock snapshots
  for (let i = 0; i < stockRows.length; i += CHUNK) {
    const body = {
      competitors: [],
      hxAllocations: [],
      stockSnapshots: stockRows.slice(i, i + CHUNK).map((r) => ({
        date: r.date,
        source: r.source,
        tickets: r.tickets,
        recordedDate: r.recorded_date,
      })),
    };
    const n = await push(body);
    if (n === null) return;
    total += n;
  }

  console.log(`[Push] Done — ${total} records imported to ${REMOTE_URL}`);
}

async function push(body: object): Promise<number | null> {
  const resp = await fetch(`${REMOTE_URL}/api/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "x-api-key": API_KEY } : {}),
    },
    body: JSON.stringify(body),
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
