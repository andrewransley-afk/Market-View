import { chromium } from "playwright";
import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

const BASE_URL =
  "https://www.booking.com/attractions/gb/pryjfn92beny-tour-of-warner-bros-studio.en-gb.html";

export const bookingComScraper: CompetitorScraper = {
  name: "Booking.com",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const results: { date: string; available: boolean }[] = [];

    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox"],
    });

    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
      });

      // Accept cookies on first load
      const setupPage = await context.newPage();
      await setupPage.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      const acceptBtn = setupPage.locator("#onetrust-accept-btn-handler");
      if (await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await acceptBtn.click();
        await setupPage.waitForTimeout(1000);
      }
      await setupPage.close();

      // Check dates one at a time to minimise memory
      for (const dateStr of targetDates) {
        const page = await context.newPage();
        try {
          await page.goto(`${BASE_URL}?date=${dateStr}`, {
            waitUntil: "domcontentloaded",
            timeout: 20000,
          });
          await page.waitForTimeout(4000);

          const hasTickets = await page
            .locator(
              "[data-testid='ticket-selector'], [data-testid='timeslot-selector'], [data-testid='ticket-selector-row']"
            )
            .count()
            .catch(() => 0);

          const available = hasTickets > 0;
          console.log(`[Booking.com] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`);
          results.push({ date: dateStr, available });
        } catch {
          console.log(`[Booking.com] ${dateStr}: ERROR (marking unavailable)`);
          results.push({ date: dateStr, available: false });
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }

    return results;
  },
};
