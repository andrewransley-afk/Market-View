import { CompetitorScraper } from "../types";
import { formatDate, generateDateRange } from "./scraper-interface";

// Golden Tours uses Ventrata checkout widget with a public API
const VENTRATA_API_KEY = "7f73b869-f1d0-4ff9-9911-fa826d9df234";
const PRODUCT_ID = "cb1c51e6-58c4-457a-8928-f89d44c06799";
const OPTION_ID = "b541442e-3b11-4556-aa11-2aa0ef4cf5c1"; // London Departures

export const goldenToursScraper: CompetitorScraper = {
  name: "Golden Tours",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const startStr = targetDates[0];
    const endStr = targetDates[targetDates.length - 1];

    const params = new URLSearchParams({
      productId: PRODUCT_ID,
      optionId: OPTION_ID,
      localDateStart: startStr,
      localDateEnd: endStr,
      "units[0][id]": "unit_8ea875bd-6fd2-4c2e-b21d-20a610b79e4a",
      "units[0][quantity]": "1",
    });

    const url = `https://checkout-api.ventrata.com/octo/availability/calendar?${params}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${VENTRATA_API_KEY}`,
        "Octo-Origin": "https://www.goldentours.com",
        "Octo-Capabilities": "octo/content,octo/pricing,octo/extras,octo/offers",
        "Octo-Env": "live",
        Referer: "https://www.goldentours.com/",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Ventrata API returned ${response.status}`);
    }

    const data: { localDate: string; available: boolean; status: string }[] =
      await response.json();

    // Build a map of API results
    const availMap = new Map<string, boolean>();
    for (const day of data) {
      availMap.set(day.localDate, day.available);
    }

    // Map to our target dates
    const results: { date: string; available: boolean }[] = [];
    for (const dateStr of targetDates) {
      const available = availMap.get(dateStr) ?? false;
      results.push({ date: dateStr, available });
      console.log(
        `[Golden Tours] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`
      );
    }

    return results;
  },
};
