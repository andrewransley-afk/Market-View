import { chromium } from "playwright";
import path from "path";

const PROFILE_DIR = path.join(process.cwd(), "data", "hx-browser-profile");
const URL =
  "https://rate-checker.internalapps.holidayextras.com/#/galaxyConnect/getProducts?isTestEnvironment=false&supplierId=abe869be-e545-4e59-ab86-211e4f776642";

async function test() {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 },
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(5000);
  const title = await page.title();
  const bodyText = (
    await page.evaluate(() => document.body.textContent || "")
  ).slice(0, 500);
  console.log("Title:", title);
  console.log("Body:", bodyText.slice(0, 300));
  const isLogin =
    title.includes("Sign in") ||
    title.includes("Cloudflare") ||
    bodyText.includes("Sign in");
  console.log("Is login page:", isLogin);
  console.log("Session valid:", !isLogin);
  await ctx.close();
}

test().catch(console.error);
