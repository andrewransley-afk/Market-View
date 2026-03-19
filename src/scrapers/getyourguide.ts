import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

// Location page for WB Studio Tour London — filter by date to check availability
const LOCATION_URL =
  "https://www.getyourguide.com/en-gb/warner-bros-studio-london-l4745/";
const API_CONCURRENCY = 3;

export const getYourGuideScraper: CompetitorScraper = {
  name: "GetYourGuide",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const scraperApiKey = process.env.SCRAPERAPI_KEY;

    if (scraperApiKey) {
      console.log("[GetYourGuide] Using ScraperAPI render mode");
      return scrapeViaApi(targetDates, scraperApiKey);
    }

    // Fallback: direct fetch (may get blocked without proxy)
    console.log("[GetYourGuide] Using direct fetch (no proxy)");
    return scrapeDirectFetch(targetDates);
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
          const targetUrl = `${LOCATION_URL}?date_from=${dateStr}&date_to=${dateStr}`;
          const apiUrl = `http://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render=true&country_code=gb&premium=true`;

          const res = await fetch(apiUrl, { signal: AbortSignal.timeout(45000) });
          if (!res.ok) {
            console.log(`[GetYourGuide] ${dateStr}: API error ${res.status}`);
            return { date: dateStr, available: true }; // assume available on error
          }

          const html = await res.text();

          // Check for activity cards on the page
          const available =
            html.includes("data-activity-id") ||
            html.includes("activity-card") ||
            html.includes("cardLink");

          console.log(
            `[GetYourGuide] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`
          );
          return { date: dateStr, available };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[GetYourGuide] ${dateStr}: ERROR - ${msg.slice(0, 80)}`);
          return { date: dateStr, available: true }; // assume available on error
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}

async function scrapeDirectFetch(
  targetDates: string[]
): Promise<{ date: string; available: boolean }[]> {
  const results: { date: string; available: boolean }[] = [];

  for (let i = 0; i < targetDates.length; i += API_CONCURRENCY) {
    const batch = targetDates.slice(i, i + API_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (dateStr) => {
        try {
          const url = `${LOCATION_URL}?date_from=${dateStr}&date_to=${dateStr}`;
          const res = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
              "Accept-Language": "en-GB,en;q=0.9",
            },
            signal: AbortSignal.timeout(20000),
          });

          if (!res.ok) {
            console.log(`[GetYourGuide] ${dateStr}: HTTP ${res.status}`);
            return { date: dateStr, available: true };
          }

          const html = await res.text();
          const available =
            html.includes("data-activity-id") ||
            html.includes("activity-card") ||
            html.includes("cardLink");

          console.log(
            `[GetYourGuide] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`
          );
          return { date: dateStr, available };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[GetYourGuide] ${dateStr}: ERROR - ${msg.slice(0, 80)}`);
          return { date: dateStr, available: true };
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}
