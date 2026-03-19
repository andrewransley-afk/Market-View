import { chromium } from "playwright";
import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

const LOCATION_URL =
  "https://www.getyourguide.com/en-gb/warner-bros-studio-london-l4745/";

export const getYourGuideScraper: CompetitorScraper = {
  name: "GetYourGuide",

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
        viewport: { width: 1440, height: 900 },
        locale: "en-GB",
      });

      // Verify we're not being redirected
      const setupPage = await context.newPage();
      await setupPage.goto(LOCATION_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await setupPage.waitForTimeout(3000);
      const title = await setupPage.title();
      if (title.includes("Tokyo") || !title.toLowerCase().includes("warner")) {
        console.log(`[GetYourGuide] Blocked or redirected (title: ${title.substring(0, 50)})`);
        await browser.close();
        return targetDates.map((date) => ({ date, available: true }));
      }
      await setupPage.close();

      // Check dates one at a time to minimise memory
      for (const dateStr of targetDates) {
        const page = await context.newPage();
        try {
          await page.goto(
            `${LOCATION_URL}?date_from=${dateStr}&date_to=${dateStr}`,
            { waitUntil: "domcontentloaded", timeout: 20000 }
          );
          await page.waitForTimeout(3000);

          const activities = await page
            .locator("[data-activity-id]")
            .count()
            .catch(() => 0);

          const available = activities > 0;
          console.log(
            `[GetYourGuide] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"} (${activities} activities)`
          );
          results.push({ date: dateStr, available });
        } catch {
          console.log(`[GetYourGuide] ${dateStr}: ERROR (marking available)`);
          results.push({ date: dateStr, available: true });
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
