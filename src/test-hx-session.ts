import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const COOKIE_FILE = path.join(process.cwd(), "data", "hx-cookies.json");
const URL =
  "https://rate-checker.internalapps.holidayextras.com/#/galaxyConnect/getProductAvailability?isTestEnvironment=false&supplierId=abe869be-e545-4e59-ab86-211e4f776642";

async function test() {
  const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf-8"));
  console.log(`Loaded ${cookies.length} cookies`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies(cookies);

  const page = await context.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  const title = await page.title();
  const isLoginPage = title.includes("Sign in") || title.includes("Cloudflare");

  console.log("Page title:", title);
  console.log("Session valid:", !isLoginPage);

  await browser.close();
}

test().catch(console.error);
