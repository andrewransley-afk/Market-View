export interface CompetitorAvailability {
  competitor: string;
  date: string; // YYYY-MM-DD
  available: boolean;
  tickets?: number;
  scrapedAt: Date;
}

export interface HXAllocation {
  date: string; // YYYY-MM-DD
  timeSlot: string;
  ticketsAvailable: number;
}

export interface StockChange {
  now: number | null;
  d1: number | null;  // 24h ago
  d7: number | null;  // 7 days ago
}

export interface DayOverview {
  date: string; // YYYY-MM-DD
  allocation: HXAllocation[];
  totalStock: number;
  competitors: CompetitorAvailability[];
  recommendation: "wb-low" | "yield" | "wb-sold-out" | "hold";
  soldOutCount: number;
  wbTrend?: StockChange;
  hxTrend?: StockChange;
}

export interface ScraperResult {
  competitor: string;
  results: { date: string; available: boolean }[];
}

export interface CompetitorScraper {
  name: string;
  scrape(startDate: Date, days: number): Promise<{ date: string; available: boolean; tickets?: number }[]>;
}
