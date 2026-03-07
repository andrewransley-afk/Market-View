import { chromium, Browser, BrowserContext, Page } from "playwright";
import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

const SEARCH_URL =
  "https://www.getyourguide.com/en-gb/s/?q=warner+bros+studio+tour+london&searchSource=3";

export const getYourGuideScraper: CompetitorScraper = {
  name: "GetYourGuide",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const targetSet = new Set(targetDates);
    const lastTargetDate = targetDates[targetDates.length - 1];

    // Dates available on ANY listing count as available
    const availableDates = new Set<string>();

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
      });

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

      // Step 1: Search for all WB Studio Tour listings
      console.log("[GetYourGuide] Searching for WB Studio Tour listings...");
      await page.goto(SEARCH_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);

      const productUrls = await page.evaluate(() => {
        const links = document.querySelectorAll("a[data-activity-id]");
        const urls: string[] = [];
        const seen = new Set<string>();
        for (const a of Array.from(links)) {
          const href = (a as HTMLAnchorElement).href;
          // Extract the activity path to deduplicate
          const match = href.match(/(\/[^?#]+)/);
          const path = match ? match[1] : href;
          if (!seen.has(path)) {
            seen.add(path);
            urls.push(href.split("?")[0]); // Strip query params
          }
        }
        return urls;
      });

      // Filter to only WB/Harry Potter related listings
      const wbUrls = productUrls.filter(
        (u) =>
          u.toLowerCase().includes("warner") ||
          u.toLowerCase().includes("harry-potter")
      );

      console.log(
        `[GetYourGuide] Found ${wbUrls.length} WB Studio Tour listings`
      );

      // Step 2: Check each listing's calendar
      for (let i = 0; i < wbUrls.length; i++) {
        const url = wbUrls[i];
        const shortName = url.match(/\/([^/]+)-t\d+/)?.[1]?.slice(0, 50) || url;
        console.log(
          `[GetYourGuide] (${i + 1}/${wbUrls.length}) Checking: ${shortName}`
        );

        try {
          const dates = await scrapeProductCalendar(
            page,
            url,
            targetSet,
            lastTargetDate
          );
          for (const d of dates) {
            availableDates.add(d);
          }
          console.log(
            `[GetYourGuide]   -> ${dates.size} available dates found (total unique: ${availableDates.size}/${targetDates.length})`
          );

          // If every target date is already covered, stop early
          if (availableDates.size >= targetDates.length) {
            console.log("[GetYourGuide] All dates covered - skipping remaining listings");
            break;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[GetYourGuide]   -> FAILED: ${msg.slice(0, 100)}`
          );
        }

        // Brief pause between listings to avoid rate limiting
        if (i < wbUrls.length - 1) {
          await page.waitForTimeout(1000);
        }
      }

      // Build results: available if ANY listing had availability
      const results: { date: string; available: boolean }[] = [];
      for (const dateStr of targetDates) {
        const available = availableDates.has(dateStr);
        results.push({ date: dateStr, available });
        console.log(
          `[GetYourGuide] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`
        );
      }

      await browser.close();
      browser = null;
      return results;
    } finally {
      if (browser) await browser.close();
    }
  },
};

async function scrapeProductCalendar(
  page: Page,
  url: string,
  targetSet: Set<string>,
  lastTargetDate: string
): Promise<Set<string>> {
  const available = new Set<string>();

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000); // Let calendar JS hydrate

  // Some listings might not have a date picker (e.g. hotel packages)
  const dateBtn = page.locator("button:has-text('Select date')").first();
  if (!(await dateBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    // Try "Check availability" button as fallback
    const checkBtn = page.locator("button:has-text('Check availability')").first();
    if (await checkBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkBtn.click();
      await page.waitForTimeout(2000);
    } else {
      return available; // No calendar on this listing
    }
  } else {
    await dateBtn.click();
    await page.waitForTimeout(2000);
  }

  // Navigate through calendar months
  for (let nav = 0; nav < 15; nav++) {
    const calendarData = await page.evaluate(() => {
      const results: { date: string; disabled: boolean }[] = [];
      const containers = document.querySelectorAll(
        ".c-datepicker-day__container"
      );
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
            January: "01",
            February: "02",
            March: "03",
            April: "04",
            May: "05",
            June: "06",
            July: "07",
            August: "08",
            September: "09",
            October: "10",
            November: "11",
            December: "12",
          };
          const month = monthMap[monthName];
          if (month) {
            results.push({ date: `${year}-${month}-${day}`, disabled });
          }
        }
      }
      return results;
    });

    for (const day of calendarData) {
      if (!day.disabled && targetSet.has(day.date)) {
        available.add(day.date);
      }
    }

    // Check if we've covered all target dates
    const maxDate =
      calendarData.length > 0
        ? calendarData[calendarData.length - 1].date
        : "";
    if (maxDate >= lastTargetDate) break;

    const nextBtn = page.locator(
      "button[aria-label='Go forward 2 months']"
    );
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(1500);
    } else {
      break;
    }
  }

  return available;
}
