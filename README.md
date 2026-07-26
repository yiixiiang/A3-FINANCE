# A3 Management — Recreated Clean Build

A premium, role-based business operating system for A3 Group.

## Included
- Limousine and Sakura website booking workspaces
- Driver payout, 10% rebate and driver network
- Admin fleet, rates, drivers, catalogue, company and access control
- Income, expense, balance sheet, period reports, P&L and GST workspace
- English / Chinese A4 invoice and quotation workspaces
- Six vehicle classes and eight service rules
- Per Trip and Per Hour rate matrix
- Vercel Speed Insights
- GitHub Actions automatic Vercel deployment

## Local start
```bash
npm install
npm run dev
```

## Vercel
Create repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`, then push to `main`.
You may instead use Vercel's native Git integration and disable the included workflow to avoid duplicate deployments.


## Finance additions

- Expense records support receipt image/PDF upload and preview.
- Platform Earnings tracks gross sales, platform fees, GST deductions, net earnings and settlement status for LIMOUSINE.A3GROUP.SG, SAKURA.A3GROUP.SG and FOOD.A3GROUP.SG.
- Demo persistence uses browser localStorage; production should move attachments to object storage.


## Unified Rate Management

The administrator sidebar combines Vehicle Rate, Driver Fix Rate, and Client Fix Rate under one **Rate Management** workspace with dedicated tabs.

## Loading and performance

- Core overview/booking screens load separately from administration, finance, driver and document workspaces.
- Browser demonstration data writes are coalesced and deferred until the main thread is idle.
- Run `npm run typecheck` before deployment.
- Source archives should exclude `node_modules`, `.next` and `.git`; install dependencies with `npm ci` after extraction.

## User access verification

- User Access assignments now control the actual sidebar modules.
- Use the **Access preview** selector in the top bar to test an active user.
- The User Access table and edit form show the exact modules assigned to each account.
- Existing records that used the older labels such as `Booking`, `Rates`, or `GST Reports` are migrated automatically.

## Supabase SQL cloud sync

This build includes authenticated Supabase storage. Complete the steps in `SUPABASE_SETUP.md`, run `supabase/schema.sql`, add the two public environment variables to Vercel, and redeploy.

## V21 Cloud & Backup

Administrators can open **Fleet & Settings → Cloud & Backup** to verify Supabase, migrate local records, restore cloud records on another computer, and download a JSON backup. The saved Supabase session now resumes automatically after refreshing the page.

## V22 Multi-Device Sync Safety

V22 adds timestamp-aware Supabase merging, automatic online/focus synchronization, pending-save and conflict diagnostics, daily server-side backups, manual backup restore, and portable JSON backup import. Run `08-OPEN-V22-SQL-UPGRADE.cmd` before deploying with `09-DEPLOY-V22-SYNC-SAFETY.cmd`.

## V23 Cloud Audit & Activity History

V23 records save activity in the secure Supabase `a3_app_audit` table and shows recent changes in **Fleet & Settings → Cloud & Backup**. Run `11-OPEN-V23-SQL-UPGRADE.cmd`, then deploy with `12-DEPLOY-V23-AUDIT.cmd`.
