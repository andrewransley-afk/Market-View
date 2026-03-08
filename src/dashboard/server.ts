import express from "express";
import path from "path";
import { generateRecommendations } from "../recommendation/engine";
import {
  getLatestScrapeTime,
  getDateHistory,
  upsertCompetitorAvailability,
  upsertHXAllocation,
  importStockSnapshot,
  getSetting,
  setSetting,
} from "../db/queries";
import { runDailyJob } from "../scheduler/daily-job";

let scrapeRunning = false;

export interface HXCookies {
  cfAppSession: string;
  savedAt: string;
  savedBy: string;
}

export async function getHXCookies(): Promise<HXCookies | null> {
  try {
    const json = await getSetting("hx_cookies");
    if (!json) return null;
    const data = JSON.parse(json);
    if (!data.cfAppSession) return null;
    return data;
  } catch {
    return null;
  }
}

async function saveHXCookies(cfAppSession: string, savedBy: string): Promise<void> {
  const data: HXCookies = {
    cfAppSession,
    savedAt: new Date().toISOString(),
    savedBy,
  };
  await setSetting("hx_cookies", JSON.stringify(data));
}

// Track whether last scrape had a valid HX session
let hxSessionValid = false;

export function setHXSessionValid(valid: boolean): void {
  hxSessionValid = valid;
}

export function createServer(): express.Express {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // API routes
  app.post("/api/scrape", async (_req, res) => {
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

  app.get("/api/overview", async (_req, res) => {
    try {
      const overview = await generateRecommendations(90);
      res.json(overview);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[API] /api/overview error:", message);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/date-history/:date", async (req, res) => {
    try {
      const history = await getDateHistory(req.params.date);
      res.json(history);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/hx-status", async (_req, res) => {
    const cookies = await getHXCookies();
    res.json({
      connected: cookies !== null,
      valid: hxSessionValid,
      savedAt: cookies?.savedAt || null,
      savedBy: cookies?.savedBy || null,
    });
  });

  app.post("/api/hx-cookies", async (req, res) => {
    const { cfAppSession, name } = req.body;
    if (!cfAppSession || typeof cfAppSession !== "string") {
      res.status(400).json({ error: "Missing cfAppSession" });
      return;
    }
    await saveHXCookies(cfAppSession.trim(), name || "Unknown");
    hxSessionValid = true;
    console.log(`[HX] Cookies saved by ${name || "Unknown"}`);
    res.json({ status: "saved" });
  });

  app.get("/api/last-updated", async (_req, res) => {
    try {
      const lastUpdated = await getLatestScrapeTime();
      res.json({ lastUpdated });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // Import endpoint: receive scrape data from local machine
  app.post("/api/import", async (req, res) => {
    const apiKey = process.env.API_KEY;
    if (apiKey && req.headers["x-api-key"] !== apiKey) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    const { competitors, hxAllocations, stockSnapshots } = req.body;
    let imported = 0;

    if (Array.isArray(competitors)) {
      for (const r of competitors) {
        await upsertCompetitorAvailability(r.competitor, r.date, r.available, r.tickets);
        imported++;
      }
    }

    if (Array.isArray(hxAllocations)) {
      for (const a of hxAllocations) {
        await upsertHXAllocation(a.date, a.timeSlot, a.ticketsAvailable);
        imported++;
      }
    }

    if (Array.isArray(stockSnapshots)) {
      for (const s of stockSnapshots) {
        await importStockSnapshot(s.date, s.source, s.tickets, s.recordedDate);
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
