import { initDatabase } from "./db/schema";
import { upsertPriceChange } from "./db/queries";

// Price changes from Google Sheet comparison: March 3rd tab → March 11th tab
// Column C = yield increment (amount added on top of base price)
// These are the dates where the yield changed between the two tabs

const changes: { tourDate: string; oldYield: number; newYield: number }[] = [
  { tourDate: "2026-03-28", oldYield: 100, newYield: 120 },
  { tourDate: "2026-03-29", oldYield: 60, newYield: 80 },
  { tourDate: "2026-03-30", oldYield: 60, newYield: 80 },
  { tourDate: "2026-03-31", oldYield: 60, newYield: 80 },
  { tourDate: "2026-04-01", oldYield: 60, newYield: 80 },
  { tourDate: "2026-04-02", oldYield: 60, newYield: 80 },
  { tourDate: "2026-04-13", oldYield: 35, newYield: 20 },
  { tourDate: "2026-04-14", oldYield: 35, newYield: 20 },
  { tourDate: "2026-04-15", oldYield: 35, newYield: 20 },
  { tourDate: "2026-04-16", oldYield: 35, newYield: 20 },
  { tourDate: "2026-04-18", oldYield: 100, newYield: 130 },
  { tourDate: "2026-05-01", oldYield: 25, newYield: 45 },
  { tourDate: "2026-05-03", oldYield: 25, newYield: 45 },
];

initDatabase();

for (const c of changes) {
  const increment = c.newYield - c.oldYield;
  // Store the increment as newPrice, old yield as oldPrice
  upsertPriceChange(c.tourDate, c.oldYield, increment, `Yield change on 11/03: £${c.oldYield} → £${c.newYield}`, "2026-03-11");
  console.log(`${c.tourDate}: ${increment > 0 ? "+" : ""}£${increment} (£${c.oldYield} → £${c.newYield})`);
}

console.log(`\nImported ${changes.length} price changes from yield sheet.`);
