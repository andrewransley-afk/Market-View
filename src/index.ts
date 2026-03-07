import dotenv from "dotenv";
dotenv.config();

import { getDatabase } from "./db/schema";
import { startServer } from "./dashboard/server";
import { startScheduler, runDailyJob } from "./scheduler/daily-job";

async function main(): Promise<void> {
  console.log("=================================");
  console.log("  Market View - Starting up...");
  console.log("=================================\n");

  // 1. Initialize database
  console.log("[Init] Initializing database...");
  getDatabase();
  console.log(`[Init] Database ready at ${process.env.DATABASE_PATH || "./data/market-view.db"}`);

  // 2. Start dashboard server
  startServer();

  // 3. Check for --run-now flag (manual scrape)
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
