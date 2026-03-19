import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

const BASE_URL =
  "https://www.booking.com/attractions/gb/pryjfn92beny-tour-of-warner-bros-studio.en-gb.html";

const KEYWORDS = ["ticket-selector", "timeslot-selector", "ticket-selector-row"];

export const bookingComScraper: CompetitorScraper = {
  name: "Booking.com",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const results: { date: string; available: boolean }[] = [];

    for (const dateStr of targetDates) {
      try {
        const url = `${BASE_URL}?date=${dateStr}`;
        const available = await streamCheckKeywords(url, KEYWORDS);
        console.log(`[Booking.com] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`);
        results.push({ date: dateStr, available });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[Booking.com] ${dateStr}: ERROR - ${msg.slice(0, 80)}`);
        results.push({ date: dateStr, available: false });
      }
      // Yield to event loop so Express can serve progress requests
      await new Promise(r => setTimeout(r, 500));
    }

    return results;
  },
};

/** Stream response body in chunks, checking for keywords without buffering the full HTML */
async function streamCheckKeywords(url: string, keywords: string[]): Promise<boolean> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "en-GB,en;q=0.9",
    },
    signal: AbortSignal.timeout(20000),
  });
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
