import { createClient, Client } from "@libsql/client";

let client: Client;

export function getClient(): Client {
  if (client) return client;

  const url = process.env.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url) {
    // Remote Turso database
    client = createClient({ url, authToken });
  } else {
    // Local SQLite file fallback
    const dbPath = process.env.DATABASE_PATH || "./data/market-view.db";
    const fs = require("fs");
    const path = require("path");
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    client = createClient({ url: `file:${dbPath}` });
  }

  return client;
}

export async function initDatabase(): Promise<void> {
  const db = getClient();

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS competitor_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor TEXT NOT NULL,
      date TEXT NOT NULL,
      available INTEGER NOT NULL,
      tickets INTEGER,
      scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(competitor, date)
    );

    CREATE TABLE IF NOT EXISTS hx_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      tickets_available INTEGER NOT NULL,
      scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(date, time_slot)
    );

    CREATE TABLE IF NOT EXISTS stock_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      source TEXT NOT NULL,
      tickets INTEGER NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      recorded_date TEXT NOT NULL DEFAULT (date('now')),
      UNIQUE(date, source, recorded_date)
    );

    CREATE INDEX IF NOT EXISTS idx_competitor_date ON competitor_availability(date);
    CREATE INDEX IF NOT EXISTS idx_allocation_date ON hx_allocation(date);
    CREATE INDEX IF NOT EXISTS idx_stock_history_lookup ON stock_history(date, source, recorded_date);
  `);
}
