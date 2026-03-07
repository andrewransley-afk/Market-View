import { chromium } from "playwright";
import { HXAllocation } from "../types";
import { upsertHXAllocation, recordStockSnapshot } from "../db/queries";
import { generateDateRange } from "../scrapers/scraper-interface";
import { getHXCookies, setHXSessionValid } from "../dashboard/server";

const PRODUCT_CODE = "API-WBC000310";
const BASE_URL = "https://rate-checker.internalapps.holidayextras.com";
const AVAILABILITY_URL = `${BASE_URL}/#/galaxyConnect/getProductAvailability?isTestEnvironment=false&supplierId=abe869be-e545-4e59-ab86-211e4f776642`;

export async function fetchHXAllocation(
  days: number = 90
): Promise<HXAllocation[]> {
  const cookies = getHXCookies();
  if (!cookies) {
    console.log("[HX] No cookies saved. Click 'Connect HX' on the dashboard.");
    return [];
  }

  const targetDates = new Set(generateDateRange(new Date(), days));
  const allocations: HXAllocation[] = [];

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    // Inject the Cloudflare Access cookies
    await context.addCookies([
      {
        name: "CF_AppSession",
        value: cookies.cfAppSession,
        domain: "rate-checker.internalapps.holidayextras.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
      },
    ]);

    const page = await context.newPage();

    console.log("[HX] Loading rate checker (getProductAvailability)...");
    await page.goto(AVAILABILITY_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    // Check if we're on the login page (session expired)
    const isLoginPage = await page.evaluate(() => {
      return (
        document.title.includes("Sign in") ||
        document.title.includes("Cloudflare") ||
        document.body.textContent?.includes("Sign in") === true
      );
    });

    if (isLoginPage) {
      console.log("[HX] Session expired. Someone needs to reconnect HX on the dashboard.");
      setHXSessionValid(false);
      return [];
    }

    setHXSessionValid(true);

    // Fill in the form fields
    await page.fill("#code", PRODUCT_CODE);
    console.log(`[HX] Filled product code: ${PRODUCT_CODE}`);

    await page.fill("#quantity", "1");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + days);
    const startStr = `${tomorrow.toISOString().split("T")[0]}T00:00`;
    const endStr = `${endDate.toISOString().split("T")[0]}T23:59`;

    await page.fill("#startDateTime", startStr);
    await page.fill("#endDateTime", endStr);
    console.log(`[HX] Set date range: ${startStr} to ${endStr}`);

    // Click "Send" button
    const sendBtn = page
      .locator("button:has-text('Send'), input[type='submit']:has-text('Send')")
      .first();
    if (await sendBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("[HX] Clicking Send...");
      await sendBtn.click();
      await page.waitForTimeout(10000);
    } else {
      console.log("[HX] No Send button found");
      return [];
    }

    // Wait for table rows
    await page
      .locator(
        "[class*='rdt_TableRow'], [class*='rdt_Table'] [role='row'], table tr"
      )
      .first()
      .waitFor({ timeout: 20000 })
      .catch(() => null);
    await page.waitForTimeout(3000);

    // Extract table data
    const tableData = await page.evaluate(() => {
      const rows: string[][] = [];

      const rdtRows = document.querySelectorAll(
        "[class*='rdt_TableRow'], [class*='rdt_Table'] [role='row']"
      );
      if (rdtRows.length > 0) {
        for (const row of Array.from(rdtRows)) {
          const cells = row.querySelectorAll(
            "[class*='rdt_TableCell'], [role='cell'], div[class*='cell']"
          );
          if (cells.length >= 3) {
            const cellTexts = Array.from(cells).map((c) =>
              (c.textContent || "").trim()
            );
            rows.push(cellTexts);
          }
        }
      }

      if (rows.length === 0) {
        const tableRows = document.querySelectorAll("table tbody tr, table tr");
        for (const row of Array.from(tableRows)) {
          const cells = row.querySelectorAll("td");
          if (cells.length >= 3) {
            const cellTexts = Array.from(cells).map((c) =>
              (c.textContent || "").trim()
            );
            rows.push(cellTexts);
          }
        }
      }

      return rows;
    });

    console.log(`[HX] Found ${tableData.length} table rows`);

    for (const cells of tableData) {
      let tourDate = "";
      let timeSlot = "";
      let tickets = 0;
      let isAvailable = false;

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i].trim();

        const dateMatch = cell.match(
          /^(20\d{2}-\d{2}-\d{2})[T ]((\d{2}:\d{2}):\d{2})$/
        );
        if (dateMatch && !tourDate) {
          if (targetDates.has(dateMatch[1])) {
            tourDate = dateMatch[1];
            timeSlot = dateMatch[3];
          }
        }

        if (cell.match(/^\d{1,3}$/) && parseInt(cell) <= 500) {
          tickets = parseInt(cell);
        }

        if (
          cell.toLowerCase() === "available" ||
          cell.toLowerCase() === "confirmed"
        ) {
          isAvailable = true;
        }
      }

      if (tourDate && isAvailable && tickets > 0) {
        allocations.push({
          date: tourDate,
          timeSlot,
          ticketsAvailable: tickets,
        });
      }
    }

    // Store in database
    const hxDailyTickets = new Map<string, number>();
    for (const alloc of allocations) {
      await upsertHXAllocation(alloc.date, alloc.timeSlot, alloc.ticketsAvailable);
      hxDailyTickets.set(
        alloc.date,
        (hxDailyTickets.get(alloc.date) || 0) + alloc.ticketsAvailable
      );
    }

    for (const [date, tickets] of hxDailyTickets) {
      await recordStockSnapshot(date, "hx", tickets);
    }

    console.log(`[HX] ${allocations.length} allocation records stored`);
  } finally {
    await browser.close();
  }

  return allocations;
}
