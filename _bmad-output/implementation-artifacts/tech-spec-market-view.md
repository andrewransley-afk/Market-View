---
title: 'Market View - Pricing Intelligence Dashboard'
slug: 'market-view'
created: '2026-03-06'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Node.js', 'TypeScript', 'Playwright', 'Express', 'SQLite', 'React', 'node-cron', 'Nodemailer', 'Vitest']
files_to_modify: ['src/scrapers/golden-tours.ts', 'src/scrapers/wb-direct.ts', 'src/scrapers/booking-com.ts', 'src/scrapers/get-your-guide.ts', 'src/scrapers/viator.ts', 'src/scrapers/premium-tours.ts', 'src/api/hx-rate-checker.ts', 'src/dashboard/server.ts', 'src/scheduler/daily-job.ts', 'src/email/alert-sender.ts', 'src/db/schema.ts', 'src/db/queries.ts', 'src/recommendation/engine.ts', 'src/scrapers/scraper-interface.ts']
code_patterns: ['modular-scrapers', 'express-dashboard', 'cron-scheduling', 'sqlite-storage']
test_patterns: ['vitest-unit', 'playwright-scraper-validation']
---

# Tech-Spec: Market View - Pricing Intelligence Dashboard

**Created:** 2026-03-06

## Overview

### Problem Statement

Andy at Hololectra's manually checks 6 competitor websites daily to assess Warner Brothers Studio Tour ticket availability across 60 days, then correlates that against his Holiday Extras (HX) allocation to make pricing decisions. This is time-consuming, error-prone, and means pricing opportunities are missed between manual checks.

### Solution

A web dashboard that automatically scrapes competitor availability daily at 8am, pulls Hololectra's allocation from the HX rate checker API, and presents a unified 60-day view with traffic-light competitor signals and pricing recommendations. Includes a daily email alert for actionable pricing opportunities.

### Scope

**In Scope:**

- HX rate checker API integration for own allocation (date + time slot)
- Playwright scrapers for 6 competitors: Golden Tours, WB Studio Tour Direct, Booking.com, GetYourGuide, Viator, Premium Tours
- Competitor signal: available (green) / sold out (red) per date across 60-day window
- Web dashboard with alert banner at top + traffic-light list view sorted by urgency
- Daily 8am scheduled scraping + email alert summary
- Pricing recommendation logic: more competitors sold out + Hololectra's has stock = raise price signal

**Out of Scope:**

- Automated price changes (recommendations only, Andy makes the decision)
- Competitor time-slot granularity (date-level availability only)
- Historical trend analysis (v1 is current-day snapshot only)
- Multiple products (WB Studio Tour only for v1)

## Context for Development

### Codebase Patterns

**Confirmed Clean Slate** — greenfield project, no existing codebase or legacy constraints.

**Architecture: Modular Monolith**

Single Node.js application with clearly separated concerns:

```
market-view/
  src/
    scrapers/              # One module per competitor (Playwright browser automation)
      golden-tours.ts
      wb-direct.ts
      booking-com.ts
      get-your-guide.ts
      viator.ts
      premium-tours.ts
      scraper-interface.ts # Shared interface all scrapers implement
      run-all.ts           # Orchestrator that runs all scrapers
    api/
      hx-rate-checker.ts   # HX allocation data integration
    dashboard/
      server.ts            # Express web server + API routes
      public/              # React frontend (Vite build output)
    scheduler/
      daily-job.ts         # node-cron 8am daily job
    email/
      alert-sender.ts      # Nodemailer daily email
    db/
      schema.ts            # SQLite schema + migrations
      queries.ts           # Data access layer
    recommendation/
      engine.ts            # Pricing recommendation logic
    types/
      index.ts             # Shared TypeScript types
  frontend/
    src/
      App.tsx              # Main dashboard component
      components/
        AlertBanner.tsx    # Urgent action banner
        DateList.tsx       # Traffic light list view
        TrafficLight.tsx   # Individual competitor indicator
  tests/
    scrapers/              # Scraper validation tests
    recommendation/        # Recommendation logic tests
    email/                 # Email formatting tests
```

**Patterns:**

- Each scraper implements a common `CompetitorScraper` interface returning `{ date: string, available: boolean }[]`
- SQLite for persistence — single file database, zero config
- Express serves both the dashboard UI and JSON API endpoints
- React frontend built with Vite, served as static files by Express
- node-cron handles the 8am daily schedule
- All config via environment variables (`.env` file)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| src/scrapers/scraper-interface.ts | Shared interface all competitor scrapers implement |
| src/scrapers/run-all.ts | Orchestrator that runs all scrapers sequentially |
| src/api/hx-rate-checker.ts | HX internal API integration (VPN required) |
| src/dashboard/server.ts | Express server — dashboard UI + API |
| src/scheduler/daily-job.ts | 8am cron job orchestrating scrape + email |
| src/recommendation/engine.ts | Pricing recommendation logic |
| src/db/schema.ts | SQLite database schema |
| src/db/queries.ts | Data access — read/write availability and allocation data |
| src/email/alert-sender.ts | Daily email alert formatting + sending |
| frontend/src/App.tsx | React dashboard main component |

### Technical Decisions

1. **Node.js + TypeScript** — modern, well-supported, excellent Playwright integration
2. **Playwright** — required for JavaScript-heavy competitor booking calendars with interactive date pickers
3. **SQLite** — simplest possible persistence, no database server needed, single file
4. **Express + React (Vite)** — lightweight dashboard served on a URL Andy can bookmark
5. **node-cron** — in-process scheduling, no external cron/task scheduler needed
6. **Nodemailer** — email delivery for daily alerts (SMTP config via env vars)
7. **Hosting** — single server/VPS accessible via URL. Must have VPN access to HX network for rate checker API. Dashboard served on a public or internal URL Andy can access from his browser.
8. **Vitest** — fast TypeScript-native test runner

## Implementation Plan

### Tasks

#### Phase 1: Foundation (Database + Types + Project Setup)

- [x] Task 1: Initialize project and install dependencies
  - File: `package.json`, `tsconfig.json`, `.env.example`
  - Action: `npm init`, install all runtime and dev dependencies, configure TypeScript, create `.env.example` with required variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_TO, HX_RATE_CHECKER_URL, PORT, DATABASE_PATH)
  - Notes: Use `tsx` for running TypeScript directly in dev

- [x] Task 2: Define shared TypeScript types
  - File: `src/types/index.ts`
  - Action: Create types for `CompetitorAvailability` (`{ competitor: string, date: string, available: boolean, scrapedAt: Date }`), `HXAllocation` (`{ date: string, timeSlot: string, ticketsAvailable: number }`), `DayOverview` (`{ date: string, allocation: HXAllocation[], competitors: CompetitorAvailability[], recommendation: 'raise' | 'hold' | 'lower', soldOutCount: number }`), `ScraperResult` (`{ competitor: string, results: { date: string, available: boolean }[] }`)
  - Notes: Single source of truth for all data shapes

- [x] Task 3: Create SQLite database schema and access layer
  - File: `src/db/schema.ts`, `src/db/queries.ts`
  - Action: Create two tables: `competitor_availability` (id, competitor, date, available, scraped_at) and `hx_allocation` (id, date, time_slot, tickets_available, scraped_at). Schema auto-creates on first run. Queries module provides: `upsertCompetitorAvailability()`, `upsertHXAllocation()`, `getAvailabilityForDateRange()`, `getLatestScrapeTime()`
  - Notes: Use `better-sqlite3` synchronous API for simplicity. Upsert by (competitor, date) and (date, time_slot) to avoid duplicates.

#### Phase 2: Data Collection (Scrapers + HX API)

- [x] Task 4: Create scraper interface and orchestrator
  - File: `src/scrapers/scraper-interface.ts`, `src/scrapers/run-all.ts`
  - Action: Define `CompetitorScraper` interface with `name: string` and `scrape(startDate: Date, days: number): Promise<{ date: string, available: boolean }[]>`. Orchestrator `runAllScrapers()` runs each scraper sequentially, stores results in DB, logs success/failure per scraper. If one scraper fails, continue with the others and log the error.
  - Notes: Sequential execution to avoid overloading browser resources. 60-day window from today.

- [x] Task 5: Implement Golden Tours scraper
  - File: `src/scrapers/golden-tours.ts`
  - Action: Launch Playwright browser, navigate to Golden Tours WB Studio Tour booking page, read the calendar widget for 60 days. For each date, check if the date element is selectable (available) or greyed out/disabled (sold out). Return array of `{ date, available }`.
  - Notes: Needs real site inspection to determine exact selectors. Calendar may require clicking "next month" to navigate through 60 days. Add retry logic for flaky page loads.

- [x] Task 6: Implement Warner Bros Studio Tour Direct scraper
  - File: `src/scrapers/wb-direct.ts`
  - Action: Same pattern as Task 5 but targeting the official WB Studio Tour booking site. Navigate to booking calendar, read date availability states for 60 days.
  - Notes: This is the primary market signal — when WB direct sells out, demand spills to resellers.

- [x] Task 7: Implement Booking.com scraper
  - File: `src/scrapers/booking-com.ts`
  - Action: Navigate to the WB Studio Tour experience/attraction page on Booking.com. Read the availability calendar for 60 days, extracting available/sold-out status per date.
  - Notes: Booking.com has sophisticated anti-bot measures. May need slower navigation, realistic user-agent, and careful rate limiting.

- [x] Task 8: Implement GetYourGuide scraper
  - File: `src/scrapers/get-your-guide.ts`
  - Action: Navigate to the WB Studio Tour listing on GetYourGuide. Read the booking calendar for 60 days, extracting date availability.
  - Notes: GetYourGuide uses a React-based calendar. May need to wait for dynamic content to load.

- [x] Task 9: Implement Viator scraper
  - File: `src/scrapers/viator.ts`
  - Action: Navigate to the WB Studio Tour listing on Viator. Read the booking calendar for 60 days, extracting date availability.
  - Notes: Viator is Tripadvisor's experiences platform. Similar SPA calendar pattern.

- [x] Task 10: Implement Premium Tours scraper
  - File: `src/scrapers/premium-tours.ts`
  - Action: Navigate to Premium Tours WB Studio Tour page. Read booking calendar for 60 days, extracting date availability.
  - Notes: Likely a simpler site than the large OTAs. May be easier to scrape.

- [x] Task 11: Implement HX Rate Checker API integration
  - File: `src/api/hx-rate-checker.ts`
  - Action: Connect to the HX rate checker at the configured URL. The SPA likely makes XHR/fetch calls to a REST API — inspect network traffic to find the underlying API endpoint. Call that API directly to fetch allocation data by date and time slot for the next 60 days. Parse response into `HXAllocation[]` and store in DB.
  - Notes: Requires VPN access. The URL contains `galaxyConnect/getProducts` with a `supplierId` param — this is likely the API route. May need authentication cookies/headers from the SPA session.

#### Phase 3: Intelligence (Recommendation Engine)

- [x] Task 12: Implement pricing recommendation engine
  - File: `src/recommendation/engine.ts`
  - Action: For each date in the 60-day window, calculate a recommendation based on: (a) count of competitors sold out, (b) whether Hololectra's has remaining stock. Logic: if 0-1 competitors sold out = "hold"; if 2-3 competitors sold out AND Hololectra's has stock = "raise"; if 4+ competitors sold out AND Hololectra's has stock = "raise" (strong signal); if Hololectra's has no stock = "hold" (nothing to price). Return `DayOverview[]` sorted by `soldOutCount` descending (most urgent first).
  - Notes: Keep logic simple and transparent. Andy makes the final call — this is advisory only.

#### Phase 4: Presentation (Dashboard + Email)

- [x] Task 13: Create Express server with API routes
  - File: `src/dashboard/server.ts`
  - Action: Express server serving: `GET /api/overview` — returns `DayOverview[]` for 60 days sorted by urgency; `GET /api/last-updated` — returns timestamp of most recent scrape; `GET /` — serves the React frontend static files. Server listens on configurable PORT (default 3000).
  - Notes: CORS not needed since frontend is served from same origin.

- [x] Task 14: Build React dashboard frontend
  - File: `frontend/src/App.tsx`, `frontend/src/components/AlertBanner.tsx`, `frontend/src/components/DateList.tsx`, `frontend/src/components/TrafficLight.tsx`
  - Action: Create the dashboard UI with three components: (1) **AlertBanner** — shows count of dates needing pricing action, e.g. "5 dates have pricing opportunities today". Only shows if there are dates with recommendation "raise". (2) **DateList** — table/list view with columns: Date (formatted as "Mon 10 Mar"), Your Stock (total tickets across time slots), then one traffic light column per competitor (green dot = available, red dot = sold out), and a Recommendation column ("Raise Price" in bold red, "Hold" in grey). Sorted by soldOutCount descending. (3) **TrafficLight** — simple coloured dot component (green circle or red circle). Include "Last updated: [timestamp]" at the top. Auto-refresh data every 5 minutes when page is open.
  - Notes: Keep styling clean and minimal. Use a system font stack. Mobile-responsive not required (desktop tool).

- [x] Task 15: Implement daily email alert
  - File: `src/email/alert-sender.ts`
  - Action: Generate and send an HTML email containing: subject line "Market View: [N] pricing opportunities today" (or "Market View: No action needed today"). Body contains a summary table of only the dates where recommendation is "raise", showing: date, Hololectra's stock, which competitors are sold out. If no opportunities, send a brief "all clear" email. Use Nodemailer with SMTP config from env vars.
  - Notes: Email should be scannable in under 10 seconds. Bold the most urgent dates (4+ competitors sold out).

#### Phase 5: Scheduling + Entry Point

- [x] Task 16: Implement daily scheduler
  - File: `src/scheduler/daily-job.ts`
  - Action: Use node-cron to schedule the daily job at `0 8 * * *` (8am). Job sequence: (1) run all competitor scrapers, (2) fetch HX allocation, (3) generate recommendations, (4) send email alert. Log start/end times and any errors. Expose a `runNow()` function for manual triggering.
  - Notes: Timezone must be set correctly (UK time — Europe/London).

- [x] Task 17: Create application entry point
  - File: `src/index.ts`
  - Action: Main entry point that: (1) initializes the SQLite database, (2) starts the Express dashboard server, (3) starts the cron scheduler. Also accept a `--run-now` CLI flag to trigger an immediate scrape (useful for first run and testing).
  - Notes: Log startup info: port, next scheduled run time, database path.

#### Phase 6: Configuration + Deployment

- [x] Task 18: Create environment configuration
  - File: `.env.example`, `README.md`
  - Action: Document all required environment variables. Create a README with: setup instructions (npm install, npx playwright install, configure .env), how to run (npm start), how to trigger a manual scrape (npm run scrape-now), how to access the dashboard (open browser to configured URL).
  - Notes: Keep README non-technical and clear — Andy may need to reference it.

### Acceptance Criteria

#### Data Collection

- [ ] AC-1: Given the app is running on a machine with VPN access, when the daily job runs, then HX allocation data is fetched and stored with date + time slot + ticket count for the next 60 days.

- [ ] AC-2: Given the daily job runs, when each competitor scraper executes, then for each of the 6 competitors, availability status (available/sold-out) is captured for each date in the next 60 days and stored in the database.

- [ ] AC-3: Given one competitor scraper fails (e.g. site changed layout), when the daily job runs, then the remaining scrapers still complete successfully and the failure is logged with the competitor name and error.

#### Recommendation Engine

- [ ] AC-4: Given competitor data shows 2+ competitors sold out on a date, when Hololectra's has remaining stock for that date, then the recommendation for that date is "raise".

- [ ] AC-5: Given competitor data shows 0-1 competitors sold out on a date, when the recommendation engine runs, then the recommendation is "hold" regardless of stock level.

- [ ] AC-6: Given Hololectra's has zero stock for a date, when the recommendation engine runs, then the recommendation is "hold" for that date (nothing to price).

#### Dashboard

- [ ] AC-7: Given the dashboard is open in a browser, when the page loads, then an alert banner shows the count of dates with "raise" recommendations (e.g. "5 dates have pricing opportunities today"), or no banner if there are none.

- [ ] AC-8: Given the dashboard is loaded, when the user views the list, then each row shows: formatted date, total Hololectra's stock, one green/red traffic light dot per competitor, and the pricing recommendation — sorted with the most urgent dates (highest soldOutCount) at the top.

- [ ] AC-9: Given the dashboard is open, when 5 minutes pass, then the data automatically refreshes without the user needing to reload the page.

#### Email Alert

- [ ] AC-10: Given the daily 8am job completes, when there are dates with "raise" recommendations, then an email is sent with subject "Market View: [N] pricing opportunities today" containing a table of those dates with stock levels and sold-out competitor names.

- [ ] AC-11: Given the daily 8am job completes, when there are no dates with "raise" recommendations, then an email is sent with subject "Market View: No action needed today" with a brief all-clear message.

#### Scheduling

- [ ] AC-12: Given the application is running, when the clock hits 8:00 AM UK time, then the full scrape + recommend + email pipeline executes automatically.

- [ ] AC-13: Given the application is started with `--run-now` flag, when it launches, then an immediate scrape cycle runs in addition to starting the scheduler.

## Additional Context

### Dependencies

**Runtime:**
- `express` — web server
- `playwright` — browser automation for competitor scraping
- `better-sqlite3` — SQLite driver
- `node-cron` — job scheduling
- `nodemailer` — email sending
- `react`, `react-dom` — dashboard frontend
- `dotenv` — environment variable loading

**Dev:**
- `typescript` — type safety
- `vite` — frontend build tool
- `vitest` — test framework
- `@playwright/test` — scraper validation tests
- `tsx` — TypeScript execution
- `@types/express`, `@types/better-sqlite3`, `@types/node-cron`, `@types/nodemailer` — type definitions

**External Services:**
- SMTP server for sending emails (e.g. Gmail SMTP, SendGrid, or company mail server)
- HX VPN access for rate checker API
- Server/VPS with public URL for dashboard access

### Testing Strategy

- **Unit tests (Vitest):** Recommendation engine logic (threshold calculations, edge cases), email formatting (HTML output, subject lines), database queries (upsert, date range filtering)
- **Scraper validation (Playwright Test):** Each scraper tested against live sites to verify selectors still work — acts as early warning when competitor sites change their UI. These are inherently fragile and expected to need maintenance.
- **Integration tests:** Full scrape-store-recommend pipeline with mock data injected into SQLite, verifying correct recommendations and email content
- **Manual testing:** First-run walkthrough: trigger manual scrape, verify dashboard shows data, verify email arrives

### Notes

**High-risk items:**
- Competitor site scraping is inherently fragile — any site redesign will break the corresponding scraper. Each scraper should fail gracefully and independently.
- Booking.com has aggressive anti-bot measures — may need special handling (slower interactions, realistic browser fingerprint). If Booking.com proves too difficult, it can be deprioritised.
- HX rate checker API structure is unknown until we can inspect network traffic on VPN. The integration may need adjustment once we see the actual API responses.

**Known limitations (v1):**
- No user authentication on dashboard (anyone with the URL can view it)
- No historical data or trend analysis
- Single product (WB Studio Tour) only
- Recommendation is rule-based, not ML-based

**Future considerations (out of scope):**
- Historical trend charts showing competitor sellout patterns over time
- Multiple product support
- Automated price adjustment via HX API
- Mobile-responsive dashboard
- Slack/Teams integration as alternative to email
- More granular recommendation tiers with suggested price points
