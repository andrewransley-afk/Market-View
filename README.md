# Market View

Pricing intelligence dashboard for Hololectra's Warner Brothers Studio Tour tickets.

Shows your HX allocation alongside competitor availability across the next 60 days, with traffic-light signals and pricing recommendations.

## Setup

1. **Install dependencies:**

   ```
   npm install
   npx playwright install chromium
   ```

2. **Configure environment:**

   Copy `.env.example` to `.env` and fill in your values:

   ```
   cp .env.example .env
   ```

   You'll need:
   - SMTP details for email alerts (host, port, user, password)
   - The email address to send alerts to
   - VPN access to the HX rate checker

3. **Start the app:**

   ```
   npm start
   ```

   This starts the dashboard server and the daily 8am scheduler.

4. **Open the dashboard:**

   Go to `http://localhost:3000` in your browser.

## Running a Manual Scrape

To trigger an immediate scrape (useful for first run):

```
npm run scrape-now
```

This runs the full pipeline: scrape competitors, fetch HX allocation, generate recommendations, and send the email alert.

## How It Works

- **Daily at 8am** (UK time): Automatically checks all 6 competitor sites and your HX allocation
- **Dashboard**: Shows a traffic-light view — green dots mean the competitor has tickets, red dots mean sold out
- **Email**: You get a daily summary of dates where competitors are selling out and you have stock
- **Recommendation**: When 2+ competitors are sold out on a date and you have stock, it flags "Raise Price"

## Competitors Monitored

1. Golden Tours
2. Warner Bros Studio Tour Direct
3. Booking.com
4. GetYourGuide
5. Viator
6. Premium Tours
