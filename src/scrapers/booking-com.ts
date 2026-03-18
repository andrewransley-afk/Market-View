import { chromium, LaunchOptions } from "playwright";
import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

const BASE_URL =
  "https://www.booking.com/attractions/gb/pryjfn92beny-tour-of-warner-bros-studio.en-gb.html";
const CONCURRENCY = 5;
const PROXY_CONCURRENCY = 2; // Lower concurrency when using proxy to conserve credits

export const bookingComScraper: CompetitorScraper = {
  name: "Booking.com",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const results: { date: string; available: boolean }[] = [];

    const scraperApiKey = process.env.SCRAPERAPI_KEY;
    const launchOpts: LaunchOptions = { headless: true };
    if (scraperApiKey) {
      launchOpts.proxy = {
        server: "http://proxy-server.scraperapi.com:8001",
        username: "scraperapi.country_code=gb.premium=true",
        password: scraperApiKey,
      };
      console.log("[Booking.com] Using ScraperAPI premium proxy for IP rotation");
    }
    const concurrency = scraperApiKey ? PROXY_CONCURRENCY : CONCURRENCY;

    const browser = await chromium.launch(launchOpts);

    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });

      // Accept cookies on initial load
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

      // Check dates in batches
      for (let i = 0; i < targetDates.length; i += concurrency) {
        const batch = targetDates.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map((dateStr) => checkDate(context, dateStr))
        );
        results.push(...batchResults);
      }
    } finally {
      await browser.close();
    }

    return results;
  },
};

async function checkDate(
  context: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>>,
  dateStr: string
): Promise<{ date: string; available: boolean }> {
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}?date=${dateStr}`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await page.waitForTimeout(5000);

    // Check for positive signals: ticket selector or timeslot elements
    const hasTickets = await page
      .locator(
        "[data-testid='ticket-selector'], [data-testid='timeslot-selector'], [data-testid='ticket-selector-row']"
      )
      .count()
      .catch(() => 0);

    const available = hasTickets > 0;
    console.log(
      `[Booking.com] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`
    );
    return { date: dateStr, available };
  } catch {
    console.log(`[Booking.com] ${dateStr}: ERROR (marking unavailable)`);
    return { date: dateStr, available: false };
  } finally {
    await page.close();
  }
}
