import path from "path";
import fs from "fs";
import { CompetitorScraper } from "../types";
import { generateDateRange } from "./scraper-interface";
import { setHXSessionValid } from "../dashboard/server";

const WB_PRODUCT_CODE = "WBHXGC001";
const AVAILABILITY_URL =
  "https://rate-checker.internalapps.holidayextras.com/#/galaxyConnect/getProductAvailability?isTestEnvironment=false&supplierId=abe869be-e545-4e59-ab86-211e4f776642";
const COOKIE_FILE = path.join(process.cwd(), "data", "hx-cookies.json");

function loadCookies(): any[] | null {
  try {
    if (!fs.existsSync(COOKIE_FILE)) return null;
    return JSON.parse(fs.readFileSync(COOKIE_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export const wbDirectScraper: CompetitorScraper = {
  name: "WB Studio Tour Direct",

  async scrape(startDate: Date, days: number) {
    const results: { date: string; available: boolean; tickets?: number }[] = [];

    const cookies = loadCookies();
    if (!cookies) {
      console.log("[WB Direct] No HX cookies. Run: npm run hx-login");
      return results;
    }

    const targetDates = new Set(generateDateRange(startDate, days));

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox"],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    // Inject all saved cookies
    await context.addCookies(cookies);

    try {
      const page = await context.newPage();

      console.log("[WB Direct] Loading HX rate checker...");
      await page.goto(AVAILABILITY_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(5000);

      // Check for expired session
      const isLoginPage = await page.evaluate(() => {
        return (
          document.title.includes("Sign in") ||
          document.title.includes("Cloudflare") ||
          document.body.textContent?.includes("Sign in") === true
        );
      });

      if (isLoginPage) {
        console.log("[WB Direct] HX session expired. Run: npm run hx-login");
        setHXSessionValid(false);
        return results;
      }

      setHXSessionValid(true);

      // Fill form with WB product code
      await page.fill("#code", WB_PRODUCT_CODE);
      await page.fill("#quantity", "1");

      const tomorrow = new Date(startDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endDate = new Date(tomorrow);
      endDate.setDate(endDate.getDate() + days);
      const startStr = `${tomorrow.toISOString().split("T")[0]}T00:00`;
      const endStr = `${endDate.toISOString().split("T")[0]}T23:59`;

      await page.fill("#startDateTime", startStr);
      await page.fill("#endDateTime", endStr);
      console.log(
        `[WB Direct] Product: ${WB_PRODUCT_CODE}, dates: ${startStr} to ${endStr}`
      );

      // Click Send
      const sendBtn = page
        .locator("button:has-text('Send'), input[type='submit']:has-text('Send')")
        .first();
      if (await sendBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await sendBtn.click();
        await page.waitForTimeout(10000);
      } else {
        console.log("[WB Direct] No Send button found");
        return results;
      }

      // Wait for React Data Table rows
      await page
        .locator("[class*='rdt_TableRow'], table tr")
        .first()
        .waitFor({ timeout: 20000 })
        .catch(() => null);
      await page.waitForTimeout(3000);

      // Extract table data
      const tableData = await page.evaluate(() => {
        const rows: string[][] = [];
        const rdtRows = document.querySelectorAll("[class*='rdt_TableRow']");
        if (rdtRows.length > 0) {
          for (const row of Array.from(rdtRows)) {
            const cells = row.querySelectorAll("[class*='rdt_TableCell']");
            if (cells.length >= 3) {
              rows.push(
                Array.from(cells).map((c) => (c.textContent || "").trim())
              );
            }
          }
        }
        if (rows.length === 0) {
          for (const row of Array.from(
            document.querySelectorAll("table tbody tr, table tr")
          )) {
            const cells = row.querySelectorAll("td");
            if (cells.length >= 3) {
              rows.push(
                Array.from(cells).map((c) => (c.textContent || "").trim())
              );
            }
          }
        }
        return rows;
      });

      console.log(`[WB Direct] Found ${tableData.length} table rows`);

      const ticketsByDate = new Map<string, number>();

      for (const cells of tableData) {
        let tourDate = "";
        let tickets = 0;
        let isAvailable = false;

        for (const cell of cells) {
          const dateMatch = cell.match(
            /^(20\d{2}-\d{2}-\d{2})[T ](\d{2}:\d{2}):\d{2}$/
          );
          if (dateMatch && !tourDate) {
            tourDate = dateMatch[1];
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
          ticketsByDate.set(
            tourDate,
            (ticketsByDate.get(tourDate) || 0) + tickets
          );
        }
      }

      for (const dateStr of targetDates) {
        const totalTickets = ticketsByDate.get(dateStr) || 0;
        results.push({
          date: dateStr,
          available: totalTickets > 0,
          tickets: totalTickets,
        });
      }

      const availCount = results.filter((r) => r.available).length;
      console.log(
        `[WB Direct] ${results.length} dates, ${availCount} available`
      );
    } finally {
      await browser.close();
    }

    return results;
  },
};
