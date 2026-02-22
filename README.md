# Analytics Dashboard

A modern Analytics Dashboard built with **Next.js**, **TypeScript**, and **Tailwind CSS**, integrated with the **Bitrix24 REST API** to display deal analytics.

## Features

- **Bitrix24 integration** – Fetches deals via `crm.deal.list` with date range filter on `DATE_CREATE`
- **Date range picker** – Start and end date to filter deals by creation date
- **Summary card** – Total count of deals in the selected period
- **Bar chart** – Deal counts grouped by day or month (Recharts)
- **Top 10 table** – ID, Title, Opportunity, Status for the most recent deals
- **Dark theme** – Cursor-style dashboard layout
- **Loading states & error handling** – Clear feedback for API calls

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure Bitrix24 Webhook**

   - Copy the env template: `cp .env.local.example .env.local`
   - In Bitrix24: **Applications → Webhooks → Incoming webhook** – create one and copy the URL.
   - Set in `.env.local`:

   ```env
   NEXT_PUBLIC_BITRIX24_WEBHOOK_URL=https://your-portal.bitrix24.com/rest/1/your_webhook_code/
   ```

3. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Project structure

- `src/app/` – Next.js App Router (layout, page, API route)
- `src/app/api/deals/` – API route that calls Bitrix24 and returns deals for the date range
- `src/lib/bitrix.ts` – Bitrix24 API client using `crm.deal.list` and pagination
- `src/components/` – DateRangePicker, SummaryCard, DealsChart, DealsTable
- `src/types/bitrix.ts` – TypeScript types for Bitrix deal data

## Tech stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Recharts (bar chart)
- `fetch` for all API calls
