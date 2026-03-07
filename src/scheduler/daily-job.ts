import cron from "node-cron";
import { runAllScrapers } from "../scrapers/run-all";
import { fetchHXAllocation } from "../api/hx-rate-checker";
import { generateRecommendations } from "../recommendation/engine";
import { sendDailyAlert } from "../email/alert-sender";

export async function runDailyJob(): Promise<void> {
  const startTime = Date.now();
  console.log(`[Job] Daily scrape started at ${new Date().toISOString()}`);

  try {
    // 1. Run all competitor scrapers
    console.log("[Job] Step 1/4: Scraping competitors...");
    const reports = await runAllScrapers(90);
    const successful = reports.filter((r) => r.success).length;
    const failed = reports.filter((r) => !r.success).length;
    console.log(
      `[Job] Scrapers complete: ${successful} succeeded, ${failed} failed`
    );

    // 2. Fetch HX allocation
    console.log("[Job] Step 2/4: Fetching HX allocation...");
    const allocations = await fetchHXAllocation(90);
    console.log(`[Job] HX allocation: ${allocations.length} records`);

    // 3. Generate recommendations
    console.log("[Job] Step 3/4: Generating recommendations...");
    const recommendations = generateRecommendations(90);
    const raiseCount = recommendations.filter(
      (r) => r.recommendation === "raise"
    ).length;
    console.log(
      `[Job] Recommendations: ${raiseCount} dates flagged for price raise`
    );

    // 4. Send email alert
    console.log("[Job] Step 4/4: Sending email alert...");
    await sendDailyAlert(recommendations);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Job] Daily scrape complete in ${elapsed}s`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Job] Daily scrape FAILED: ${message}`);
  }
}

export function startScheduler(): void {
  const schedule = process.env.CRON_SCHEDULE || "0 8 * * *";

  cron.schedule(
    schedule,
    () => {
      runDailyJob();
    },
    { timezone: "Europe/London" }
  );

  console.log(
    `[Scheduler] Daily job scheduled: ${schedule} (Europe/London)`
  );
}
