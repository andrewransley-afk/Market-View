import { chromium } from "playwright";
import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

// Direct product URL for WB Studio Tour
const PRODUCT_URL =
  "https://www.getyourguide.com/en-gb/london-l57/warner-bros-studio-tour-london-the-making-of-harry-potter-t64285/";

export const getYourGuideScraper: CompetitorScraper = {
  name: "GetYourGuide",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const scraperApiKey = process.env.SCRAPERAPI_KEY;

    if (scraperApiKey) {
      console.log("[GetYourGuide] Using ScraperAPI render mode");
      return scrapeViaApi(targetDates, scraperApiKey);
    }

    console.log("[GetYourGuide] Using direct Playwright (no proxy)");
    return scrapeViaPlaywright(targetDates);
  },
};

async function scrapeViaApi(
  targetDates: string[],
  apiKey: string
): Promise<{ date: string; available: boolean }[]> {
  // GetYourGuide uses a calendar widget — we need to fetch the page and check
  // which dates are enabled. We'll fetch the product page and parse the calendar data.
  const results: { date: string; available: boolean }[] = [];

  try {
    // Fetch the main product page with render mode
    const apiUrl = `http://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(PRODUCT_URL)}&render=true&country_code=gb&premium=true&wait_for_selector=.c-datepicker-day__container`;

    console.log("[GetYourGuide] Fetching product page...");
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(60000) });

    if (!res.ok) {
      console.log(`[GetYourGuide] API error ${res.status} — marking all as available`);
      return targetDates.map((date) => ({ date, available: true }));
    }

    const html = await res.text();

    // Parse available dates from the calendar HTML
    // GetYourGuide calendar days have aria-label like "Wednesday, 26 March 2026"
    // Disabled days have class "c-datepicker-day--disabled"
    const availableDates = new Set<string>();
    const dayRegex = /aria-label="[^"]*?(\d+)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})"[^>]*class="[^"]*c-datepicker-day__container([^"]*)">/g;

    const monthMap: Record<string, string> = {
      January: "01", February: "02", March: "03", April: "04",
      May: "05", June: "06", July: "07", August: "08",
      September: "09", October: "10", November: "11", December: "12",
    };

    let match;
    while ((match = dayRegex.exec(html)) !== null) {
      const day = match[1].padStart(2, "0");
      const month = monthMap[match[2]];
      const year = match[3];
      const classes = match[4];
      if (month && !classes.includes("disabled")) {
        availableDates.add(`${year}-${month}-${day}`);
      }
    }

    console.log(`[GetYourGuide] Found ${availableDates.size} available dates in calendar`);

    for (const dateStr of targetDates) {
      // If we got calendar data, use it. If not, mark as available (benefit of doubt)
      const available = availableDates.size > 0 ? availableDates.has(dateStr) : true;
      console.log(`[GetYourGuide] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`);
      results.push({ date: dateStr, available });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GetYourGuide] Error: ${msg.slice(0, 100)}`);
    // On error, mark all as available (don't penalise with false sold-out)
    return targetDates.map((date) => ({ date, available: true }));
  }

  return results;
}

async function scrapeViaPlaywright(
  targetDates: string[]
): Promise<{ date: string; available: boolean }[]> {
  const availableDates = new Set<string>();
  const targetSet = new Set(targetDates);
  const lastTargetDate = targetDates[targetDates.length - 1];

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
      locale: "en-GB",
    });

    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    await page.goto(PRODUCT_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Click date selector
    const dateBtn = page.locator("button:has-text('Select date')").first();
    if (await dateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dateBtn.click();
      await page.waitForTimeout(2000);
    }

    // Navigate through calendar
    for (let nav = 0; nav < 15; nav++) {
      const calendarData = await page.evaluate(() => {
        const results: { date: string; disabled: boolean }[] = [];
        const containers = document.querySelectorAll(".c-datepicker-day__container");
        for (const el of Array.from(containers)) {
          const ariaLabel = el.getAttribute("aria-label") || "";
          const disabled =
            el.classList.contains("c-datepicker-day--disabled") ||
            el.getAttribute("aria-disabled") === "true";

          const match = ariaLabel.match(/\w+,\s+(\d+)\s+(\w+)\s+(\d{4})/);
          if (match) {
            const day = match[1].padStart(2, "0");
            const monthName = match[2];
            const year = match[3];
            const monthMap: Record<string, string> = {
              January: "01", February: "02", March: "03", April: "04",
              May: "05", June: "06", July: "07", August: "08",
              September: "09", October: "10", November: "11", December: "12",
            };
            const month = monthMap[monthName];
            if (month) results.push({ date: `${year}-${month}-${day}`, disabled });
          }
        }
        return results;
      });

      for (const day of calendarData) {
        if (!day.disabled && targetSet.has(day.date)) availableDates.add(day.date);
      }

      const maxDate = calendarData.length > 0 ? calendarData[calendarData.length - 1].date : "";
      if (maxDate >= lastTargetDate) break;

      const nextBtn = page.locator("button[aria-label='Go forward 2 months']");
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(1500);
      } else {
        break;
      }
    }
  } finally {
    await browser.close();
  }

  return targetDates.map((dateStr) => {
    const available = availableDates.has(dateStr);
    console.log(`[GetYourGuide] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`);
    return { date: dateStr, available };
  });
}
