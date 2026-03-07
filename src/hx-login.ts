import { chromium } from "playwright";
import path from "path";

const PROFILE_DIR = path.join(process.cwd(), "data", "hx-browser-profile");
const RATE_CHECKER_URL =
  process.env.HX_RATE_CHECKER_URL ||
  "https://rate-checker.internalapps.holidayextras.com/#/galaxyConnect/getProducts?isTestEnvironment=false&supplierId=abe869be-e545-4e59-ab86-211e4f776642";

async function login() {
  console.log("Opening browser for HX Rate Checker login...");
  console.log("Please sign in with your Google account.");
  console.log("Once you see the rate checker page, close the browser window.\n");

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(RATE_CHECKER_URL);

  // Wait for the user to log in and close the browser
  await new Promise<void>((resolve) => {
    context.on("close", () => resolve());
  });

  console.log("\nLogin session saved. The daily scrape will now use this session.");
  console.log("If it expires, just run: npm run hx-login");
}

login().catch(console.error);
