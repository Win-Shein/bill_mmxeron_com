# Billing System (Node.js + SQLite)

Zoho Books လိုမျိုး billing / invoicing system တစ်ခု။ Express REST API backend နဲ့ vanilla-JS single-page frontend ကို SQLite database ပေါ်မှာ တည်ဆောက်ထားပါတယ်။ Default currency က **Euro (€)** ဖြစ်ပြီး **VPS · VPN · Domain · Hosting · App · License** ရောင်းချမှုနဲ့ **Web Building · Web / Server / App Maintenance** service တွေအတွက် item category နဲ့ billing cycle (one-time / monthly / quarterly / yearly) များ ပါဝင်ပါတယ်။

## Features

- **Dashboard** — total billed, collected, outstanding, overdue + collections chart, top customers, recent invoices
- **Customers** — CRUD, search, per-customer billing totals
- **Items / Products & Services** — CRUD, category (VPS/VPN/Domain/Hosting/App/License/Web Building/Web·Server·App Maintenance), billing cycle, price, tax rate, optional stock tracking, category filter
- **Invoices** — Excel-style grid with row numbers, **daily view by default** + date-range filter (Today / This Month / All), Edit · Print (PDF) · Delete actions, running totals, one-click **Export to Excel (CSV)**; line items, auto numbering, discount + tax, statuses (draft / sent / partial / paid / overdue / void), PDF export
- **Payments** — record partial/full payments; invoice status auto-updates
- **Reports** — date-filtered receivables aging, **monthly summary (လစဉ်ချုပ်)** with billed/collected/outstanding, top-selling items, outstanding-invoices grid with row numbers + CSV export
- **Settings** — **company logo upload (PNG/JPG/SVG)** shown on the **login screen**, sidebar & on invoice PDFs, company profile, currency (€ default), default tax, invoice prefix & numbering, **account email & password change**, **language (English / မြန်မာ)**, light/dark theme
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
| Database  | SQLite (`node:sqlite`, built-in) |
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

## Replacing the logo

1. Sign in and open **Settings → Company Logo**, upload a PNG/JPG/SVG (max ~1MB) and click **Save Settings**.
2. The same logo is then shown on the **login screen**, in the sidebar, and on invoice PDFs. If no logo is uploaded, the default `₿` mark is used.

## Deployment & security

The app ships with sensible defaults but **you must set a few environment variables in production**:

| Variable | Purpose |
|---|---|
| `NODE_ENV=production` | Enables secure cookies, HSTS and generic error messages. |
| `SESSION_SECRET` | **Required** in production — a long random string (e.g. `openssl rand -hex 32`). The server refuses to start without it. |
| `PORT` | HTTP port (default `3000`). |
| `TRUST_PROXY=1` | Set when running behind a reverse proxy (nginx/Caddy/PaaS) so the real client IP and HTTPS are detected. Leave unset when exposed directly. |
| `DB_PATH` | Optional custom path for the SQLite file. |

```bash
# example (Linux)
NODE_ENV=production SESSION_SECRET=$(openssl rand -hex 32) TRUST_PROXY=1 npm start
```

Built-in protections:

- **scrypt** password hashing (salted, timing-safe comparison)
- HTTP-only, SameSite=Lax session cookies (Secure in production); session ID is regenerated on login
- **Rate limiting** on login / register / email / password endpoints (in-memory)
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS (production)
- Parameterised SQL everywhere (no string-built queries); user data HTML-escaped in the UI

Additional checklist before going live:

- [ ] Put the app behind **HTTPS** (reverse proxy with a TLS certificate).
- [ ] **Change the default seeded password** (`admin1234`) immediately, and update the email in **Settings → Account**.
- [ ] If you deploy an **empty** database, the first sign-up creates the account — register yourself right after deploy (or run `npm run seed` first) so nobody else can claim it.
- [ ] Run `npm audit` and keep dependencies patched.
- [ ] Back up `data/billing.db` regularly (it holds all your data).
- [ ] Restrict filesystem permissions on `data/` to the service user.

Notes / not included: no CSRF tokens (SameSite=Lax covers the common cases), no 2FA, and the rate limiter is per-process (use a shared store if you scale to multiple instances).

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
| GET | `/api/branding` | public company name + logo (login screen) |
| POST | `/api/auth/login` · `/logout` | sign in / sign out |
| GET | `/api/auth/me` | current user |
| PUT | `/api/auth/email` · `/api/auth/password` | change account email / password |
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
