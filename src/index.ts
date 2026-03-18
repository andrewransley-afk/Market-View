import dotenv from "dotenv";
dotenv.config();

import { initDatabase } from "./db/schema";
import { startServer } from "./dashboard/server";
import { startScheduler, runDailyJob } from "./scheduler/daily-job";
import { fetchYieldRates } from "./scrapers/yield-sheet";

async function main(): Promise<void> {
  console.log("=================================");
  console.log("  Market View - Starting up...");
  console.log("=================================\n");

  // 1. Initialize database
  console.log("[Init] Initializing database...");
  initDatabase();
  console.log("[Init] Database ready");

  // 2. Fetch yield rates from Google Sheet
  fetchYieldRates().catch(e => console.error("[Init] Yield sheet fetch failed:", e));

  // 3. Start dashboard server
  startServer();

  // 4. Start scheduler
  startScheduler();

  // 5. Check for --run-now flag (manual scrape)
  if (process.argv.includes("--run-now")) {
    console.log("\n[Init] --run-now flag detected, triggering scrape...\n");
    await runDailyJob();
  }

  console.log("\n[Init] Market View is ready!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
