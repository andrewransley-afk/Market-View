import { chromium, LaunchOptions } from "playwright";
import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

const BASE_URL =
  "https://www.booking.com/attractions/gb/pryjfn92beny-tour-of-warner-bros-studio.en-gb.html";
const CONCURRENCY = 5;
const API_CONCURRENCY = 3; // ScraperAPI concurrent requests

export const bookingComScraper: CompetitorScraper = {
  name: "Booking.com",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const scraperApiKey = process.env.SCRAPERAPI_KEY;

    // Use ScraperAPI render mode if available (fetches rendered HTML server-side)
    if (scraperApiKey) {
      console.log("[Booking.com] Using ScraperAPI render mode");
      return scrapeViaApi(targetDates, scraperApiKey);
    }

    // Fallback: direct Playwright (works locally)
    console.log("[Booking.com] Using direct Playwright (no proxy)");
    return scrapeViaPlaywright(targetDates);
  },
};

async function scrapeViaApi(
  targetDates: string[],
  apiKey: string
): Promise<{ date: string; available: boolean }[]> {
  const results: { date: string; available: boolean }[] = [];

  for (let i = 0; i < targetDates.length; i += API_CONCURRENCY) {
    const batch = targetDates.slice(i, i + API_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (dateStr) => {
        try {
          const targetUrl = `${BASE_URL}?date=${dateStr}`;
          const apiUrl = `http://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render=true&country_code=gb`;

          const res = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
          if (!res.ok) {
            console.log(`[Booking.com] ${dateStr}: API error ${res.status}`);
            return { date: dateStr, available: false };
          }

          const html = await res.text();
          const available =
            html.includes("ticket-selector") ||
            html.includes("timeslot-selector") ||
            html.includes("ticket-selector-row");

          console.log(`[Booking.com] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`);
          return { date: dateStr, available };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[Booking.com] ${dateStr}: ERROR - ${msg.slice(0, 80)}`);
          return { date: dateStr, available: false };
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}

async function scrapeViaPlaywright(
  targetDates: string[]
): Promise<{ date: string; available: boolean }[]> {
  const results: { date: string; available: boolean }[] = [];
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const setupPage = await context.newPage();
    await setupPage.goto(BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const acceptBtn = setupPage.locator("#onetrust-accept-btn-handler");
    if (await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await acceptBtn.click();
      await setupPage.waitForTimeout(1000);
    }
    await setupPage.close();

    for (let i = 0; i < targetDates.length; i += CONCURRENCY) {
      const batch = targetDates.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (dateStr) => {
          const page = await context.newPage();
          try {
            await page.goto(`${BASE_URL}?date=${dateStr}`, {
              waitUntil: "domcontentloaded",
              timeout: 20000,
            });
            await page.waitForTimeout(5000);

            const hasTickets = await page
              .locator(
                "[data-testid='ticket-selector'], [data-testid='timeslot-selector'], [data-testid='ticket-selector-row']"
              )
              .count()
              .catch(() => 0);

            const available = hasTickets > 0;
            console.log(`[Booking.com] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`);
            return { date: dateStr, available };
          } catch {
            console.log(`[Booking.com] ${dateStr}: ERROR (marking unavailable)`);
            return { date: dateStr, available: false };
          } finally {
            await page.close();
          }
        })
      );
      results.push(...batchResults);
    }
  } finally {
    await browser.close();
  }

  return results;
}
