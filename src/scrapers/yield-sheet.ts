import { upsertYieldRate } from "../db/queries";

const SHEET_ID = "1MlesY91H74KMSWA9W1Rhha5q9SlG4VuSxyCQN4k0BxM";
const SHEET_HTML_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview`;

function parseTabDate(name: string): Date | null {
  // Tab names use mixed formats: "11/03/26", "02.03.26", "21.01.26", "EBO 29.01.2026"
  // Strip any prefix text like "EBO "
  const cleaned = name.replace(/^[A-Za-z]+\s+/, "").trim();
  // Split on / or .
  const parts = cleaned.split(/[\/\.]/);
  if (parts.length !== 3) return null;
  let [dd, mm, yy] = parts;
  // Handle 2-digit vs 4-digit year
  if (yy.length === 2) yy = "20" + yy;
  const d = new Date(`${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

async function findLatestTabGid(): Promise<string> {
  console.log("[Yield Sheet] Finding latest tab...");
  const res = await fetch(SHEET_HTML_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch sheet HTML: ${res.status}`);

  const html = await res.text();
  // Extract tab items: {name: "11/03/26", gid: "396452062"}
  const itemRegex = /items\.push\(\{name:\s*"([^"]*)".*?gid:\s*"([^"]*)"/g;
  let match;
  let latestDate: Date | null = null;
  let latestGid = "0";
  let latestName = "";

  while ((match = itemRegex.exec(html)) !== null) {
    const name = match[1].replace(/\\\//g, "/");
    const gid = match[2];
    const d = parseTabDate(name);
    if (d && (!latestDate || d > latestDate)) {
      latestDate = d;
      latestGid = gid;
      latestName = name;
    }
  }

  console.log(`[Yield Sheet] Latest tab: "${latestName}" (gid=${latestGid})`);
  return latestGid;
}

function parseTourDate(ddmmyyyy: string): string | null {
  const parts = ddmmyyyy.trim().split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parsePound(val: string): number | null {
  const cleaned = val.replace(/[£,\s]/g, "");
  if (cleaned === "" || isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

export async function fetchYieldRates(): Promise<number> {
  console.log("[Yield Sheet] Fetching yield rates from Google Sheet...");

  const gid = await findLatestTabGid();
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;

  const res = await fetch(csvUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to fetch yield sheet: ${res.status}`);
  }

  const csv = await res.text();
  const lines = csv.split("\n");

  let count = 0;
  // Skip header rows (first 3 lines), data starts at line 4
  for (let i = 3; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 3) continue;

    const dateStr = parseTourDate(cols[1]);
    if (!dateStr) continue;

    const yieldAmount = parsePound(cols[2]);
    if (yieldAmount === null) continue;

    upsertYieldRate(dateStr, yieldAmount);
    count++;
  }

  console.log(`[Yield Sheet] Updated ${count} yield rates from tab gid=${gid}.`);
  return count;
}
