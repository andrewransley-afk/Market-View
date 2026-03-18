import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH || "./data/market-view.db";
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

export function initDatabase(): void {
  const db = getDatabase();

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

    CREATE TABLE IF NOT EXISTS price_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tour_date TEXT NOT NULL,
      old_price REAL,
      new_price REAL NOT NULL,
      note TEXT,
      hx_stock_at_change INTEGER,
      wb_stock_at_change INTEGER,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      changed_date TEXT NOT NULL DEFAULT (date('now')),
      UNIQUE(tour_date)
    );

    CREATE INDEX IF NOT EXISTS idx_price_changes_date ON price_changes(tour_date);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS yield_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tour_date TEXT NOT NULL UNIQUE,
      yield_amount REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_competitor_date ON competitor_availability(date);
    CREATE INDEX IF NOT EXISTS idx_allocation_date ON hx_allocation(date);
    CREATE INDEX IF NOT EXISTS idx_stock_history_lookup ON stock_history(date, source, recorded_date);
    CREATE INDEX IF NOT EXISTS idx_yield_rates_date ON yield_rates(tour_date);
  `);

  // Migration: allow multiple price changes per tour_date (one per changed_date)
  const tableInfo = db.prepare(`PRAGMA table_info(price_changes)`).all() as any[];
  if (tableInfo.length > 0) {
    // Check if old UNIQUE(tour_date) constraint exists by trying to find the index
    const indexes = db.prepare(`PRAGMA index_list(price_changes)`).all() as any[];
    const needsMigration = indexes.some((idx: any) => {
      const cols = db.prepare(`PRAGMA index_info('${idx.name}')`).all() as any[];
      return cols.length === 1 && cols[0].name === "tour_date" && idx.unique === 1;
    });

    if (needsMigration) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS price_changes_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tour_date TEXT NOT NULL,
          old_price REAL,
          new_price REAL NOT NULL,
          note TEXT,
          hx_stock_at_change INTEGER,
          wb_stock_at_change INTEGER,
          changed_at TEXT NOT NULL DEFAULT (datetime('now')),
          changed_date TEXT NOT NULL DEFAULT (date('now')),
          UNIQUE(tour_date, changed_date)
        );
        INSERT OR IGNORE INTO price_changes_new SELECT * FROM price_changes;
        DROP TABLE price_changes;
        ALTER TABLE price_changes_new RENAME TO price_changes;
        CREATE INDEX IF NOT EXISTS idx_price_changes_date ON price_changes(tour_date);
      `);
    }
  }
}
