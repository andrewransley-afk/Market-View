import { chromium } from "playwright";
import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

// Location page for WB Studio Tour London — filter by date to check availability
const LOCATION_URL =
  "https://www.getyourguide.com/en-gb/warner-bros-studio-london-l4745/";
const CONCURRENCY = 3;

export const getYourGuideScraper: CompetitorScraper = {
  name: "GetYourGuide",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const results: { date: string; available: boolean }[] = [];

    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        viewport: { width: 1440, height: 900 },
        locale: "en-GB",
      });

      // Verify the page loads correctly first
      const setupPage = await context.newPage();
      await setupPage.goto(LOCATION_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await setupPage.waitForTimeout(3000);

      const title = await setupPage.title();
      if (title.includes("Tokyo") || !title.toLowerCase().includes("warner")) {
        console.log(`[GetYourGuide] Blocked or redirected (title: ${title.substring(0, 50)})`);
        await browser.close();
        return targetDates.map((date) => ({ date, available: true }));
      }
      await setupPage.close();

      // Check dates in batches
      for (let i = 0; i < targetDates.length; i += CONCURRENCY) {
        const batch = targetDates.slice(i, i + CONCURRENCY);
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
    const url = `${LOCATION_URL}?date_from=${dateStr}&date_to=${dateStr}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3000);

    // Count activity cards — if activities show for this date, there's availability
    const activities = await page
      .locator("[data-activity-id]")
      .count()
      .catch(() => 0);

    const available = activities > 0;
    console.log(
      `[GetYourGuide] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"} (${activities} activities)`
    );
    return { date: dateStr, available };
  } catch {
    console.log(`[GetYourGuide] ${dateStr}: ERROR (marking available)`);
    return { date: dateStr, available: true };
  } finally {
    await page.close();
  }
}
