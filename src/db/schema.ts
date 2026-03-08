import { Client } from "@libsql/client";

let client: Client;

export function getClient(): Client {
  if (client) return client;

  const url = process.env.TURSO_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (url && url.startsWith("libsql://")) {
    // Remote Turso — use HTTP transport to avoid cross-fetch/node-fetch issues
    const httpUrl = url.replace("libsql://", "https://");
    const { createClient } = require("@libsql/client/http");
    client = createClient({ url: httpUrl, authToken });
  } else {
    // Local SQLite file
    const { createClient } = require("@libsql/client");
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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_competitor_date ON competitor_availability(date);
    CREATE INDEX IF NOT EXISTS idx_allocation_date ON hx_allocation(date);
    CREATE INDEX IF NOT EXISTS idx_stock_history_lookup ON stock_history(date, source, recorded_date);
  `);
}
