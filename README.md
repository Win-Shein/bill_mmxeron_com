# Billing System (Node.js + SQLite)

Zoho Books လိုမျိုး billing / invoicing system တစ်ခု။ Express REST API backend နဲ့ vanilla-JS single-page frontend ကို SQLite database ပေါ်မှာ တည်ဆောက်ထားပါတယ်။ Default currency က **Euro (€)** ဖြစ်ပြီး **VPS · VPN · Domain · Hosting · App · License** ရောင်းချမှုနဲ့ **Web Building · Web / Server / App Maintenance** service တွေအတွက် item category နဲ့ billing cycle (one-time / monthly / quarterly / yearly) များ ပါဝင်ပါတယ်။

## Features

- **Dashboard** — total billed, collected, outstanding, overdue + collections chart, top customers, recent invoices
- **Customers** — CRUD, search, per-customer billing totals
- **Items / Products & Services** — CRUD, category (VPS/VPN/Domain/Hosting/App/License/Web Building/Web·Server·App Maintenance), billing cycle, price, tax rate, optional stock tracking, category filter
- **Invoices** — Excel-style grid with row numbers, **daily view by default** + date-range filter (Today / This Month / All), Edit · Print (PDF) · Delete actions, running totals, one-click **Export to Excel (CSV)**; line items, auto numbering, discount + tax, statuses (draft / sent / partial / paid / overdue / void), PDF export
- **Payments** — record partial/full payments; invoice status auto-updates
- **Reports** — date-filtered receivables aging, **monthly summary (လစဉ်ချုပ်)** with billed/collected/outstanding, top-selling items, outstanding-invoices grid with row numbers + CSV export
- **Settings** — **company logo upload (PNG/JPG/SVG)** shown in sidebar & on invoice PDFs, company profile, currency (€ default), default tax, invoice prefix & numbering, **language (English / မြန်မာ)**, light/dark theme
- **UI / UX** — fully **responsive** (off-canvas sidebar drawer on mobile), **live date & time** in the top bar on every page, **light / dark theme** toggle, **bilingual (English / Myanmar)** interface, serial-numbered grids and Export-to-Excel across Customers, Items, Payments, Invoices & Reports, payment method filter
- **Single-user / personal** — email/password **login** (session cookies, scrypt hashing) for one account; no roles, no plans, no team management, no platform admin

## Default account (after `npm run seed`)

| Account | Login |
|---|---|
| Admin | `admin@example.com` / `admin1234` |

If you skip the seed and start with an empty database, the first account is created via the one-time sign-up (`/api/auth/register`), which then becomes the single login.

## Tech stack

| Layer     | Choice |
|-----------|--------|
| Runtime   | Node.js |
| Server    | Express |
| Database  | SQLite (`better-sqlite3`) |
| PDF       | PDFKit |
| Frontend  | Vanilla JS SPA (no build step) |

## Getting started

```bash
npm install
npm run seed     # (optional) load sample data
npm start
```

Then open http://localhost:3000

`npm run dev` runs with `--watch` for auto-restart during development.

## Project layout

```
billing/
├── server.js              # Express app + route mounting
├── db/
│   ├── schema.sql         # SQLite schema
│   ├── database.js        # connection + schema bootstrap
│   └── seed.js            # demo data
├── lib/
│   ├── invoiceService.js  # totals/status recalculation
│   └── pdf.js             # invoice PDF generation
├── routes/                # REST endpoints
│   ├── dashboard.js  customers.js  items.js
│   ├── invoices.js   payments.js   reports.js  settings.js
└── public/                # frontend (index.html, css, js)
```

The SQLite file is created automatically at `data/billing.db` on first run.

## API overview

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/dashboard` | dashboard metrics |
| GET/POST | `/api/customers` | list / create customers |
| PUT/DELETE | `/api/customers/:id` | update / delete |
| GET/POST | `/api/items` | list / create items |
| GET/POST | `/api/invoices` | list / create invoices |
| PUT | `/api/invoices/:id` | update invoice + line items |
| PATCH | `/api/invoices/:id/status` | change status |
| GET | `/api/invoices/:id/pdf` | download PDF |
| GET/POST | `/api/payments` | list / record payments |
| GET | `/api/reports/aging` · `/by-item` · `/revenue` | reports |
| GET/PUT | `/api/settings` | company settings |
