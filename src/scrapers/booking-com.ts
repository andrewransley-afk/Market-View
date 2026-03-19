import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

const BASE_URL =
  "https://www.booking.com/attractions/gb/pryjfn92beny-tour-of-warner-bros-studio.en-gb.html";

const KEYWORDS = ["ticket-selector", "timeslot-selector", "ticket-selector-row"];

export const bookingComScraper: CompetitorScraper = {
  name: "Booking.com",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const scraperApiKey = process.env.SCRAPERAPI_KEY;
    const results: { date: string; available: boolean }[] = [];

    for (const dateStr of targetDates) {
      try {
        const targetUrl = `${BASE_URL}?date=${dateStr}`;
        let url: string;

        if (scraperApiKey) {
          url = `http://api.scraperapi.com/?api_key=${scraperApiKey}&url=${encodeURIComponent(targetUrl)}&render=true&country_code=gb`;
        } else {
          url = targetUrl;
        }

        const available = await streamCheckKeywords(url, KEYWORDS);
        console.log(`[Booking.com] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`);
        results.push({ date: dateStr, available });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[Booking.com] ${dateStr}: ERROR - ${msg.slice(0, 80)}`);
        results.push({ date: dateStr, available: false });
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
  let overlap = ""; // carry-over from previous chunk for keywords spanning chunk boundaries

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

      // Keep last N chars to catch keywords split across chunks
      overlap = chunk.slice(-50);
    }
  } finally {
    reader.releaseLock();
  }

  return false;
}
