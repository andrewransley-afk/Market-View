import Database from "better-sqlite3";
import path from "path";

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH || "./data/market-view.db";
  const dir = path.dirname(dbPath);

  // Ensure directory exists
  const fs = require("fs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
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

  // Add tickets column if missing (migration for existing DBs)
  const cols = db.prepare("PRAGMA table_info(competitor_availability)").all() as { name: string }[];
  if (!cols.some(c => c.name === "tickets")) {
    db.exec("ALTER TABLE competitor_availability ADD COLUMN tickets INTEGER");
  }

  return db;
}
