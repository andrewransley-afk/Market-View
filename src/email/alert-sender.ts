import nodemailer from "nodemailer";
import { DayOverview } from "../types";

function formatDateForEmail(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function buildEmailHTML(opportunities: DayOverview[]): string {
  if (opportunities.length === 0) {
    return `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #155724;">All Clear</h2>
        <p>No pricing action needed today. All competitor availability is healthy across the next 60 days.</p>
        <p style="color: #888; font-size: 12px;">Market View - Hololectra's Pricing Intelligence</p>
      </div>
    `;
  }

  const rows = opportunities
    .map((day) => {
      const soldOut = day.competitors
        .filter((c) => !c.available)
        .map((c) => c.competitor)
        .join(", ");

      const isStrong = day.soldOutCount >= 4;
      const style = isStrong ? "font-weight: bold; color: #dc3545;" : "";

      return `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; ${style}">${formatDateForEmail(day.date)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; ${style}">${day.totalStock}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${day.soldOutCount}/6</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 12px;">${soldOut}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc3545;">Pricing Opportunities Today</h2>
      <p>${opportunities.length} date${opportunities.length > 1 ? "s" : ""} where competitors are selling out and you have stock.</p>

      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <thead>
          <tr style="background: #2c3e50; color: white;">
            <th style="padding: 10px 12px; text-align: left;">Date</th>
            <th style="padding: 10px 12px; text-align: left;">Your Stock</th>
            <th style="padding: 10px 12px; text-align: left;">Sold Out</th>
            <th style="padding: 10px 12px; text-align: left;">Competitors Sold Out</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <p style="margin-top: 20px; color: #888; font-size: 12px;">
        Market View - Hololectra's Pricing Intelligence<br>
        Bold rows = 4+ competitors sold out (strong signal)
      </p>
    </div>
  `;
}

export async function sendDailyAlert(
  allOverviews: DayOverview[]
): Promise<void> {
  const opportunities = allOverviews.filter(
    (d) => d.recommendation !== "hold"
  );

  const subject =
    opportunities.length > 0
      ? `Market View: ${opportunities.length} pricing opportunities today`
      : "Market View: No action needed today";

  const html = buildEmailHTML(opportunities);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: process.env.EMAIL_TO,
    subject,
    html,
  });

  console.log(`[Email] Sent: "${subject}" to ${process.env.EMAIL_TO}`);
}
