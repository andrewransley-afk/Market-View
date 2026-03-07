import { chromium } from "playwright";
import path from "path";

const PROFILE_DIR = path.join(process.cwd(), "data", "hx-browser-profile");
const URL =
  "https://rate-checker.internalapps.holidayextras.com/#/galaxyConnect/getProductAvailability?isTestEnvironment=false&supplierId=abe869be-e545-4e59-ab86-211e4f776642";

async function diagnose() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 },
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    const title = await page.title();
    console.log(`Page title: ${title}`);

    await page.screenshot({ path: "data/hx-avail-page.png", fullPage: true });
    console.log("Screenshot 1: data/hx-avail-page.png");

    // Get all form elements to understand the form structure
    const formEls = await page.evaluate(() => {
      const results: string[] = [];
      const els = document.querySelectorAll("input, select, button, textarea, label");
      for (const el of Array.from(els).slice(0, 40)) {
        const tag = el.tagName.toLowerCase();
        const type = (el as HTMLInputElement).type || "";
        const name = (el as HTMLInputElement).name || "";
        const value = (el as HTMLInputElement).value || "";
        const placeholder = (el as HTMLInputElement).placeholder || "";
        const text = (el.textContent || "").trim().slice(0, 60);
        const cls = typeof el.className === "string" ? el.className.slice(0, 60) : "";
        const id = el.id || "";
        results.push(`<${tag} id="${id}" type="${type}" name="${name}" value="${value.slice(0, 40)}" placeholder="${placeholder}" class="${cls}"> "${text}"`);
      }
      return results;
    });

    console.log("\nForm elements:");
    formEls.forEach((e) => console.log(`  ${e}`));

    // Fill form using exact field IDs
    await page.fill("#code", "API-WBC000310");
    await page.fill("#quantity", "1");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + 60);
    const startStr = `${tomorrow.toISOString().split("T")[0]}T00:00`;
    const endStr = `${endDate.toISOString().split("T")[0]}T23:59`;
    await page.fill("#startDateTime", startStr);
    await page.fill("#endDateTime", endStr);
    console.log(`\nFilled form: code=API-WBC000310, dates=${startStr} to ${endStr}`);

    // Click Send
    const sendBtn = page.locator("button:has-text('Send')").first();
    if (await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("Clicking Send...");
      await sendBtn.click();
      await page.waitForTimeout(12000);

      await page.screenshot({ path: "data/hx-avail-results.png", fullPage: true });
      console.log("Screenshot 2: data/hx-avail-results.png");

      // Check for React Data Table and standard tables
      const tableInfo = await page.evaluate(() => {
        const results: string[] = [];

        // React Data Table
        const rdtRows = document.querySelectorAll("[class*='rdt_TableRow']");
        results.push(`React Data Table rows: ${rdtRows.length}`);
        for (const row of Array.from(rdtRows).slice(0, 5)) {
          const cells = row.querySelectorAll("[class*='rdt_TableCell']");
          const cellTexts = Array.from(cells).map(c => (c.textContent || "").trim().slice(0, 50));
          results.push(`  RDT: [${cellTexts.join(" | ")}]`);
        }

        // Standard tables
        const tables = document.querySelectorAll("table");
        results.push(`\nStandard tables: ${tables.length}`);
        for (const table of Array.from(tables)) {
          const rows = table.querySelectorAll("tr");
          results.push(`  Table with ${rows.length} rows`);
          for (const row of Array.from(rows).slice(0, 5)) {
            const cells = row.querySelectorAll("td, th");
            const cellTexts = Array.from(cells).map(c => (c.textContent || "").trim().slice(0, 50));
            results.push(`    [${cellTexts.join(" | ")}]`);
          }
        }

        // Any JSON response block
        const preEls = document.querySelectorAll("pre, code, [class*='json'], [class*='response']");
        results.push(`\nPre/code/json elements: ${preEls.length}`);
        for (const el of Array.from(preEls).slice(0, 3)) {
          const text = (el.textContent || "").trim().slice(0, 500);
          results.push(`  ${text}`);
        }

        return results;
      });

      console.log("\nResults info:");
      tableInfo.forEach((t) => console.log(`  ${t}`));
    } else {
      console.log("No Send button found");
    }

  } catch (err: any) {
    console.error(`FAILED: ${err.message}`);
  } finally {
    await context.close();
  }
}

diagnose();
