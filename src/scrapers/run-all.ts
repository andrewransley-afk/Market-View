import { CompetitorScraper } from "../types";
import { upsertCompetitorAvailability, recordStockSnapshot } from "../db/queries";
import { goldenToursScraper } from "./golden-tours";
import { wbDirectScraper } from "./wb-direct";
import { bookingComScraper } from "./booking-com";
import { premiumToursScraper } from "./premium-tours";
import { getYourGuideScraper } from "./getyourguide";

const ALL_SCRAPERS: CompetitorScraper[] = [
  wbDirectScraper,
  goldenToursScraper,
  bookingComScraper,
  premiumToursScraper,
  getYourGuideScraper,
];

export interface ScrapeReport {
  competitor: string;
  success: boolean;
  datesScraped: number;
  error?: string;
}

export async function runAllScrapers(
  days: number = 60
): Promise<ScrapeReport[]> {
  const startDate = new Date();
  const reports: ScrapeReport[] = [];

  for (const scraper of ALL_SCRAPERS) {
    console.log(`[Scraper] Starting: ${scraper.name}`);
    const startTime = Date.now();

    try {
      const results = await scraper.scrape(startDate, days);

      // Aggregate WB tickets per date for stock history
      const wbDailyTickets = new Map<string, number>();

      for (const result of results) {
        upsertCompetitorAvailability(
          scraper.name,
          result.date,
          result.available,
          result.tickets
        );

        // Record WB stock history
        if (scraper.name === "WB Studio Tour Direct" && result.tickets !== undefined) {
          wbDailyTickets.set(
            result.date,
            (wbDailyTickets.get(result.date) || 0) + result.tickets
          );
        }
      }

      for (const [date, tickets] of wbDailyTickets) {
        recordStockSnapshot(date, "wb", tickets);
      }

      // Record competitor availability snapshots (1=available, 0=sold out)
      if (scraper.name !== "WB Studio Tour Direct") {
        const shortName = {
          "Golden Tours": "golden",
          "Booking.com": "booking",
          "Premium Tours": "premium",
          "GetYourGuide": "gyg",
        }[scraper.name];
        if (shortName) {
          for (const result of results) {
            recordStockSnapshot(result.date, shortName, result.available ? 1 : 0);
          }
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[Scraper] ${scraper.name}: ${results.length} dates scraped in ${elapsed}s`
      );

      reports.push({
        competitor: scraper.name,
        success: true,
        datesScraped: results.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Scraper] ${scraper.name} FAILED: ${message}`);

      reports.push({
        competitor: scraper.name,
        success: false,
        datesScraped: 0,
        error: message,
      });
    }
  }

  return reports;
}
