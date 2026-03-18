import dotenv from "dotenv";
dotenv.config();

import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { initDatabase } from "./db/schema";
import { setSetting } from "./db/queries";

const RATE_CHECKER_URL =
  "https://rate-checker.internalapps.holidayextras.com/#/galaxyConnect/getProductAvailability?isTestEnvironment=false&supplierId=abe869be-e545-4e59-ab86-211e4f776642";
const COOKIE_FILE = path.join(process.cwd(), "data", "hx-cookies.json");

async function login() {
  initDatabase();

  console.log("Opening browser for HX Rate Checker login...");
  console.log("Sign in with Google, then WAIT for the rate checker page to fully load.");
  console.log("Once you see the form with fields like 'code', 'quantity', etc — close the browser.\n");

  const browser = await chromium.launch({
    headless: false,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(RATE_CHECKER_URL);

  // Wait until we're actually on the rate checker (not login page)
  console.log("Waiting for you to sign in and the rate checker to load...");
  try {
    // Wait for the #code input field which is on the actual rate checker page
    await page.waitForSelector("#code", { timeout: 300000 });
    console.log("Rate checker loaded! Saving all cookies...");
    await page.waitForTimeout(2000);
  } catch {
    console.log("Timed out waiting for rate checker to load.");
    await browser.close();
    return;
  }

  // Grab ALL cookies from the browser (all domains)
  const allCookies = await context.cookies();

  // Filter to only Cloudflare/rate-checker related cookies
  const relevantCookies = allCookies.filter(
    (c) =>
      c.domain.includes("holidayextras") ||
      c.domain.includes("cloudflareaccess") ||
      c.domain.includes("cloudflare")
  );

  console.log(`\nAll cookies (${allCookies.length} total):`);
  for (const c of allCookies) {
    console.log(`  ${c.name} -> ${c.domain}`);
  }

  console.log(`\nRelevant cookies (${relevantCookies.length}):`);
  for (const c of relevantCookies) {
    console.log(`  ${c.name} -> ${c.domain}`);
  }

  // Save to file
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(relevantCookies, null, 2));
  console.log(`\nSaved ${relevantCookies.length} cookies to ${COOKIE_FILE}`);

  // Also save to DB
  setSetting("hx_cookies_full", JSON.stringify(relevantCookies));

  await browser.close();
  console.log("Done! Run a scrape to test: npm run scrape-now");
}

login().catch(console.error);
