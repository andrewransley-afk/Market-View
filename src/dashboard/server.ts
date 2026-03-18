import express from "express";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import os from "os";
import { chromium } from "playwright";
import { generateRecommendations } from "../recommendation/engine";
import {
  getLatestScrapeTime,
  getDateHistory,
  setSetting,
  getAvailableHistoricalDates,
  getHistoricalOverview,
  upsertPriceChange,
  getPriceChange,
  getPriceChangeHistory,
  getAllPriceChanges,
  getPriceChangeImpact,
  getAllYieldRates,
} from "../db/queries";
import { runDailyJob } from "../scheduler/daily-job";
import { getScrapeProgress } from "../scrapers/run-all";
import { fetchYieldRates } from "../scrapers/yield-sheet";

let scrapeRunning = false;

const COOKIE_FILE = path.join(process.cwd(), "data", "hx-cookies.json");

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
    if (scrapeRunning) {
      res.json({ status: "already_running" });
      return;
    }
    scrapeRunning = true;
    res.json({ status: "started" });
    try {
      await Promise.all([runDailyJob(), fetchYieldRates().catch(e => console.error("[Yield Sheet] Error:", e))]);
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
      const priceChanges = getAllPriceChanges();
      const pcMap = new Map(priceChanges.map(pc => [pc.tourDate, pc]));
      const yieldRates = getAllYieldRates();
      const yieldMap = new Map(yieldRates.map(yr => [yr.tourDate, yr.yieldAmount]));
      const enriched = overview.map((day: any) => {
        const pc = pcMap.get(day.date);
        const yieldRate = yieldMap.get(day.date);
        return {
          ...day,
          ...(pc ? { priceChange: pc } : {}),
          ...(yieldRate !== undefined ? { yieldRate } : {}),
        };
      });
      res.json(enriched);
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
    const profileExists = fs.existsSync(COOKIE_FILE);
    res.json({
      connected: profileExists,
      valid: hxSessionValid,
    });
  });

  let hxLoginRunning = false;

  app.post("/api/hx-login", async (_req, res) => {
    if (hxLoginRunning) {
      res.json({ status: "already_running" });
      return;
    }
    hxLoginRunning = true;
    res.json({ status: "started" });

    const RATE_CHECKER_URL =
      "https://rate-checker.internalapps.holidayextras.com/#/galaxyConnect/getProductAvailability?isTestEnvironment=false&supplierId=abe869be-e545-4e59-ab86-211e4f776642";

    try {
      const browser = await chromium.launch({
        headless: false,
      });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();
      await page.goto(RATE_CHECKER_URL);

      console.log("[HX Login] Browser opened — waiting for sign-in...");

      // Wait for the rate checker form to load (means sign-in succeeded)
      try {
        await page.waitForSelector("#code", { timeout: 300000 });
        console.log("[HX Login] Sign-in detected, saving cookies...");
        await page.waitForTimeout(2000);
      } catch {
        console.log("[HX Login] Timed out waiting for sign-in.");
        await browser.close();
        hxLoginRunning = false;
        return;
      }

      // Grab all relevant cookies
      const allCookies = await context.cookies();
      const relevantCookies = allCookies.filter(
        (c) =>
          c.domain.includes("holidayextras") ||
          c.domain.includes("cloudflareaccess") ||
          c.domain.includes("cloudflare")
      );

      fs.writeFileSync(COOKIE_FILE, JSON.stringify(relevantCookies, null, 2));
      setSetting("hx_cookies_full", JSON.stringify(relevantCookies));
      hxSessionValid = true;

      console.log(`[HX Login] Saved ${relevantCookies.length} cookies`);
      await browser.close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[HX Login] Error:", msg);
    } finally {
      hxLoginRunning = false;
    }
  });

  app.get("/api/hx-login-status", (_req, res) => {
    res.json({ running: hxLoginRunning });
  });

  app.get("/api/scrape-progress", (_req, res) => {
    res.json(getScrapeProgress());
  });

  app.get("/api/historical-dates", (_req, res) => {
    try {
      res.json(getAvailableHistoricalDates());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/historical/:date", (req, res) => {
    try {
      res.json(getHistoricalOverview(req.params.date));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // --- Price Changes ---
  app.get("/api/price-changes", (_req, res) => {
    try {
      res.json(getAllPriceChanges());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/price-change/:date", (req, res) => {
    try {
      const pc = getPriceChange(req.params.date);
      const history = getPriceChangeHistory(req.params.date);
      const impact = getPriceChangeImpact(req.params.date);
      res.json({ priceChange: pc, history, impact });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/price-change", (req, res) => {
    const { tourDate, oldPrice, newPrice, note } = req.body;
    if (!tourDate || newPrice === undefined) {
      res.status(400).json({ error: "Missing tourDate or newPrice" });
      return;
    }
    try {
      upsertPriceChange(tourDate, oldPrice ?? null, newPrice, note ?? null);
      res.json({ status: "saved" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
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

  app.post("/api/publish", async (_req, res) => {
    try {
      // 1. Collect current data
      const overview = generateRecommendations(90);
      const priceChanges = getAllPriceChanges();
      const pcMap = new Map(priceChanges.map(pc => [pc.tourDate, pc]));
      const yieldRates = getAllYieldRates();
      const yieldMap = new Map(yieldRates.map(yr => [yr.tourDate, yr.yieldAmount]));
      const enriched = overview.map((day: any) => {
        const pc = pcMap.get(day.date);
        const yieldRate = yieldMap.get(day.date);
        return { ...day, ...(pc ? { priceChange: pc } : {}), ...(yieldRate !== undefined ? { yieldRate } : {}) };
      });
      const lastUpdated = getLatestScrapeTime();

      // Date history for each tour date
      const dateHistoryMap: Record<string, any> = {};
      for (const day of enriched) {
        dateHistoryMap[day.date] = getDateHistory(day.date);
      }

      // Price change detail for dates with changes
      const priceChangeDetailMap: Record<string, any> = {};
      for (const pc of priceChanges) {
        priceChangeDetailMap[pc.tourDate] = {
          priceChange: getPriceChange(pc.tourDate),
          history: getPriceChangeHistory(pc.tourDate),
          impact: getPriceChangeImpact(pc.tourDate),
        };
      }

      // Historical dates and snapshots
      const historicalDates = getAvailableHistoricalDates();
      const historicalSnapshots: Record<string, any> = {};
      for (const hd of historicalDates) {
        historicalSnapshots[hd] = getHistoricalOverview(hd);
      }

      // 2. Read and transform HTML
      const publicDir = path.join(__dirname, "public");
      let html = fs.readFileSync(path.join(publicDir, "index.html"), "utf-8");

      // Base64-encode assets
      const fontPath = path.join(publicDir, "harry-beast.woff2");
      const logoPath = path.join(publicDir, "logo-hp.svg");
      const fontB64 = fs.existsSync(fontPath) ? fs.readFileSync(fontPath).toString("base64") : "";
      const logoB64 = fs.existsSync(logoPath) ? fs.readFileSync(logoPath).toString("base64") : "";

      // Inline font
      if (fontB64) {
        html = html.replace('src: url("/harry-beast.woff2") format("woff2")', `src: url("data:font/woff2;base64,${fontB64}") format("woff2")`);
      }
      // Inline logo
      if (logoB64) {
        html = html.replace('src="/logo-hp.svg"', `src="data:image/svg+xml;base64,${logoB64}"`);
      }

      // Remove html2pdf script tag
      html = html.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2pdf[^"]*"><\/script>\n?/, "");

      // Inject static data and mode flag before the main script
      const staticData = JSON.stringify({
        overview: enriched,
        lastUpdated,
        dateHistory: dateHistoryMap,
        priceChangeDetail: priceChangeDetailMap,
        historicalDates,
        historicalSnapshots,
      });
      html = html.replace("<script>", `<script>window.__STATIC_MODE__=true;window.__STATIC_DATA__=${staticData};</script>\n  <script>`);

      // Replace loadData to use embedded data
      html = html.replace(
        /async function loadData\(\)[\s\S]*?^    \}/m,
        `async function loadData() {\n      const { overview, lastUpdated } = window.__STATIC_DATA__;\n      render(overview, lastUpdated);\n    }`
      );

      // Remove auto-refresh and HX check
      html = html.replace("loadData().then(() => checkHXStatus());", "loadData();");
      html = html.replace("setInterval(loadData, 5 * 60 * 1000);", "");

      // Strip interactive buttons, replace with snapshot label
      html = html.replace(
        /<div style="display:flex;gap:12px;justify-content:center;align-items:center;margin-top:18px">[\s\S]*?<\/div>\n\s*<\/div>/,
        `<div style="text-align:center;margin-top:18px;color:var(--text-muted);font-size:12px;font-style:italic">Read-only snapshot</div>\n        </div>`
      );

      // 3. Push to gh-pages
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "market-view-publish-"));
      fs.writeFileSync(path.join(tmpDir, "index.html"), html);

      const remoteUrl = execSync("git remote get-url origin", { cwd: process.cwd() }).toString().trim();
      const gitOpts = { cwd: tmpDir };
      execSync("git init", gitOpts);
      execSync("git checkout -b gh-pages", gitOpts);
      execSync("git add index.html", gitOpts);
      execSync('git commit -m "Update Market View snapshot"', gitOpts);
      execSync(`git remote add origin ${remoteUrl}`, gitOpts);
      execSync("git push --force origin gh-pages", gitOpts);

      fs.rmSync(tmpDir, { recursive: true, force: true });

      // Derive GitHub Pages URL from remote
      const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      const pagesUrl = match ? `https://${match[1]}.github.io/${match[2]}/` : "Check your GitHub Pages settings";

      res.json({ status: "published", url: pagesUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Publish] Error:", message);
      res.status(500).json({ error: message });
    }
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
