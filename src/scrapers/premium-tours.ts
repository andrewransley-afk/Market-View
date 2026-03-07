import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";

// Premium Tours uses Ventrata via a proxied API on their domain
const PRODUCT_ID = "40759d13-f0b5-4559-8846-090aa9d224b5";
const OPTION_ID = "DEFAULT";
const UNIT_ID = "unit_832db5c1-98e9-4be0-9442-d88ec0b6a50e"; // Adult

export const premiumToursScraper: CompetitorScraper = {
  name: "Premium Tours",

  async scrape(startDate: Date, days: number) {
    const targetDates = generateDateRange(startDate, days);
    const startStr = targetDates[0];
    const endStr = targetDates[targetDates.length - 1];

    const params = new URLSearchParams({
      productId: PRODUCT_ID,
      optionId: OPTION_ID,
      localDateStart: startStr,
      localDateEnd: endStr,
      "units[0][id]": UNIT_ID,
      "units[0][quantity]": "1",
    });

    const url = `https://www.premiumtours.co.uk/api/octo/availability/calendar?${params}`;

    const response = await fetch(url, {
      headers: {
        "Octo-Origin": "https://www.premiumtours.co.uk",
        "Octo-Capabilities":
          "octo/content,octo/pricing,octo/questions,octo/pickups,octo/extras,octo/packages,octo/rentals",
        "Octo-Env": "live",
        Referer: "https://www.premiumtours.co.uk/",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Premium Tours API returned ${response.status}`);
    }

    const data: { localDate: string; available: boolean; status: string }[] =
      await response.json();

    const availMap = new Map<string, boolean>();
    for (const day of data) {
      availMap.set(day.localDate, day.available);
    }

    const results: { date: string; available: boolean }[] = [];
    for (const dateStr of targetDates) {
      const available = availMap.get(dateStr) ?? false;
      results.push({ date: dateStr, available });
      console.log(
        `[Premium Tours] ${dateStr}: ${available ? "AVAILABLE" : "SOLD OUT"}`
      );
    }

    return results;
  },
};
