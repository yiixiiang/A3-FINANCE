# A3 Management Finance 1.2.0

A multi-company finance and operations system for A3 Group, built with Next.js 16.2.11, React 19, TypeScript and Supabase.

## Included modules

- Authentication, company access and user management
- Company profiles and branding
- Drivers, jobs and driver payouts
- Customers, quotations and customer invoices
- Accounts Receivable and customer payment allocation
- Suppliers, Accounts Payable and supplier credit allocation
- Bank reconciliation and cash accounts
- GST reporting and tax control
- Profit & Loss, Balance Sheet and Cash Flow reports
- Financial periods, audit controls and backup tools
- Multi-company driver network and company-locked recruitment links
- Private driver vehicle-document uploads
- AEJKY Limousine public quotation website at `/limousine`

## Requirements

- Node.js 20 LTS or newer
- npm 10 or newer
- A Supabase project

## Install

1. Extract the project into a new folder. Do not copy an old `.next` or `node_modules` folder into it.
2. Copy `.env.example` to `.env.local`.
3. Enter the real Supabase values in `.env.local`. `NEXT_PUBLIC_SUPABASE_URL` must be a complete URL such as `https://your-project-ref.supabase.co`; do not use the dashboard URL or only the project reference.
4. Keep `NEXT_PUBLIC_SITE_URL=https://finance.a3group.sg` for production.
5. Install and validate:

```bash
npm ci
npm run verify
npm run lint
npm run typecheck
npm run build
npm run dev
```

Open `http://localhost:3000` during local development.

## Supabase migrations

### Fresh database

Run the migrations in filename order from `000_phase0_foundation.sql` through `023_repair_driver_login_links.sql`, with one exception:

- Run either `017_018_019_PHASES_8_9_10_ALL_IN_ONE.sql`
- Or run `017_balance_sheet_reporting.sql`, `018_cash_flow_statement.sql` and `019_final_consolidation_control.sql` individually
- Do not run both versions of Phases 8–10

Then run migrations `020`, `021`, `022` and `023` in order.

### Existing Phase 7 database

Run either the combined Phases 8–10 migration or the three individual migrations, followed by:

```text
020_driver_network_and_company_signup.sql
021_driver_vehicle_document_uploads.sql
022_public_limousine_website.sql
023_repair_driver_login_links.sql
```

Back up the project and Supabase database before applying production migrations.

## Production deployment

Deploy this project only to:

```text
https://finance.a3group.sg
```

Set these environment variables in Vercel before deploying:

```text
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

The three AEJKY contact variables are optional.

## Security

- Never commit or share `.env.local`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in Client Components or browser code.
- Use the anon key only for browser-side Supabase access.
- Keep Row Level Security enabled and apply all supplied migrations.

## Useful commands

```bash
npm run dev        # Start local development
npm run build      # Create a production build
npm run start      # Run the production build
npm run lint       # Run ESLint
npm run typecheck  # Run strict TypeScript checking
npm run verify     # Validate required files, migrations and project safeguards
npm run clean      # Remove generated build caches and obsolete migration leftovers
```
