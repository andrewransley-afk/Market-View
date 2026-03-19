import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

const LOCATION_URL =
  "https://www.getyourguide.com/en-gb/warner-bros-studio-london-l4745/";

const KEYWORDS = ["data-activity-id", "activity-card"];

export const getYourGuideScraper: CompetitorScraper = {
  name: "GetYourGuide",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const scraperApiKey = process.env.SCRAPERAPI_KEY;
    const results: { date: string; available: boolean }[] = [];

    for (const dateStr of targetDates) {
      try {
        const targetUrl = `${LOCATION_URL}?date_from=${dateStr}&date_to=${dateStr}`;
        let url: string;

        if (scraperApiKey) {
          url = `http://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(targetUrl)}&render=true&country_code=gb`;
        } else {
          url = targetUrl;
        }

        const available = await streamCheckKeywords(url, KEYWORDS);
        console.log(`[GetYourGuide] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`);
        results.push({ date: dateStr, available });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[GetYourGuide] ${dateStr}: ERROR - ${msg.slice(0, 80)}`);
        results.push({ date: dateStr, available: true });
      }
    }

    return results;
  },
};

/** Stream response body in chunks, checking for keywords without buffering the full HTML */
async function streamCheckKeywords(url: string, keywords: string[]): Promise<boolean> {
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!res.ok || !res.body) return false;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let overlap = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = overlap + decoder.decode(value, { stream: true });

      for (const kw of keywords) {
        if (chunk.includes(kw)) {
          reader.cancel();
          return true;
        }
      }

      overlap = chunk.slice(-50);
    }
  } finally {
    reader.releaseLock();
  }

  return false;
}
