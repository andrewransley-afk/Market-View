import express from "express";
import path from "path";
import fs from "fs";
import { generateRecommendations } from "../recommendation/engine";
import {
  getLatestScrapeTime,
  getDateHistory,
  upsertCompetitorAvailability,
  upsertHXAllocation,
  recordStockSnapshot,
} from "../db/queries";
import { runDailyJob } from "../scheduler/daily-job";

let scrapeRunning = false;

const COOKIE_FILE = path.join(process.cwd(), "data", "hx-cookies.json");

export interface HXCookies {
  cfAppSession: string;
  savedAt: string;
  savedBy: string;
}

export function getHXCookies(): HXCookies | null {
  try {
    if (!fs.existsSync(COOKIE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf-8"));
    if (!data.cfAppSession) return null;
    return data;
  } catch {
    return null;
  }
}

function saveHXCookies(cfAppSession: string, savedBy: string): void {
  const data: HXCookies = {
    cfAppSession,
    savedAt: new Date().toISOString(),
    savedBy,
  };
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(data, null, 2));
}

// Track whether last scrape had a valid HX session
let hxSessionValid = false;

export function setHXSessionValid(valid: boolean): void {
  hxSessionValid = valid;
}

export function createServer(): express.Express {
  const app = express();
  app.use(express.json());

  // API routes
  app.post("/api/scrape", async (_req, res) => {
    if (process.env.DASHBOARD_ONLY === "true") {
      res.json({ status: "dashboard_only", message: "Scraping disabled on cloud. Data is pushed from local machine." });
      return;
    }
    if (scrapeRunning) {
      res.json({ status: "already_running" });
      return;
    }
    scrapeRunning = true;
    res.json({ status: "started" });
    try {
      await runDailyJob();
    } finally {
      scrapeRunning = false;
    }
  });

  app.get("/api/scrape-status", (_req, res) => {
    res.json({ running: scrapeRunning });
  });

  app.get("/api/overview", (_req, res) => {
    try {
      const overview = generateRecommendations(90);
      res.json(overview);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[API] /api/overview error:", message);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/date-history/:date", (req, res) => {
    try {
      const history = getDateHistory(req.params.date);
      res.json(history);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/hx-status", (_req, res) => {
    const cookies = getHXCookies();
    res.json({
      connected: cookies !== null,
      valid: hxSessionValid,
      savedAt: cookies?.savedAt || null,
      savedBy: cookies?.savedBy || null,
    });
  });

  app.post("/api/hx-cookies", (req, res) => {
    const { cfAppSession, name } = req.body;
    if (!cfAppSession || typeof cfAppSession !== "string") {
      res.status(400).json({ error: "Missing cfAppSession" });
      return;
    }
    saveHXCookies(cfAppSession.trim(), name || "Unknown");
    hxSessionValid = true; // Assume valid until next scrape proves otherwise
    console.log(`[HX] Cookies saved by ${name || "Unknown"}`);
    res.json({ status: "saved" });
  });

  app.get("/api/last-updated", (_req, res) => {
    try {
      const lastUpdated = getLatestScrapeTime();
      res.json({ lastUpdated });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // Import endpoint: receive scrape data from local machine
  app.post("/api/import", (req, res) => {
    const apiKey = process.env.API_KEY;
    if (apiKey && req.headers["x-api-key"] !== apiKey) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    const { competitors, hxAllocations, stockSnapshots } = req.body;
    let imported = 0;

    if (Array.isArray(competitors)) {
      for (const r of competitors) {
        upsertCompetitorAvailability(r.competitor, r.date, r.available, r.tickets);
        imported++;
      }
    }

    if (Array.isArray(hxAllocations)) {
      for (const a of hxAllocations) {
        upsertHXAllocation(a.date, a.timeSlot, a.ticketsAvailable);
        imported++;
      }
    }

    if (Array.isArray(stockSnapshots)) {
      for (const s of stockSnapshots) {
        recordStockSnapshot(s.date, s.source, s.tickets);
        imported++;
      }
    }

    console.log(`[Import] Received ${imported} records`);
    res.json({ status: "ok", imported });
  });

  // Serve frontend static files
  app.use(express.static(path.join(__dirname, "public")));

  // SPA fallback (Express 5 requires named param for catch-all)
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  return app;
}

export function startServer(): void {
  const port = parseInt(process.env.PORT || "3000", 10);
  const app = createServer();

  app.listen(port, () => {
    console.log(`[Dashboard] Market View running at http://localhost:${port}`);
  });
}
