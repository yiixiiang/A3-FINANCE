# FINANCE1 update — 26 July 2026

## Company and documents
- Company Management now stores bank, account, PayNow and payment instructions per company.
- Invoice and quotation PDFs use a redesigned corporate A4 layout.
- Bank/payment details appear automatically in document PDFs.
- Limousine Company quotations show service items and rates without subtotal or total sections.
- The print action opens the generated professional PDF for printing or saving.

## Reporting
- Today, This Week, This Month and This Year filters are available across income, expenses, platform earnings, profit and loss, driver payouts, invoices and quotations.
- Driver payout periods use trip date when available.

## Partner balance ledger
- Added Balance Sheet records for HENG, J, X, BP and 213.
- Period amount, previous carried balance and total closing balance calculate automatically.
- Supports today, weekly, monthly and yearly views, CSV export and printing.

## Validation
- `npm run typecheck` passes.
- Run `npm install` after extracting, then `npm run dev` or `npm run build`.

## Balance Sheet V3
- Balance Sheet partners remain fully individual; no consolidated PB/BP or X+J grouping replaces their own ledgers.
- Added partner directory with Add Partner, edit partner, WhatsApp number and safe removal controls.
- Added default P partner alongside HENG, J, X, BP and 213.
- Balance period options are limited to This Week, This Month and Select Date.
- This Week is always Monday through Sunday.
- Date From and Date To are displayed on-screen and on the printable individual statement.
- Custom period enables both date inputs.
- Added X/J/P automatic percentage calculation for the selected date range:
  - X = selected-period base balance
  - J = X × 2%
  - P = X × 3%
  - Total Amount = X + J
- Added individual partner statement selection, CSV export, Print/PDF and one-by-one WhatsApp sharing.
- Added individual add/edit/delete transaction controls.

## Balance Sheet V4 — AEJKY BP import
- Imported all 36 AB0003 BP descriptions and signed THB amounts into the AEJKY company balance ledger.
- BP stores only Description and THB Amount; MYR is calculated automatically using the fixed formula THB ÷ 7.55.
- Imported negative amounts remain deductions.
- BP records can be edited and deleted directly; edits recalculate MYR immediately.
- The migration targets AEJKY explicitly instead of relying on the first or currently selected company.
- Full imported range is 01 Oct 2023 to 16 Jul 2026.

## V5 — Single X Balance Sheet Record
- Removed partner-based Balance Sheet storage and display.
- Every existing and imported Balance Sheet entry is migrated to the single `X` record ledger.
- The AEJKY AB0003 import remains editable and is stored as normal Balance Sheet records under X.
- All X records use Description + THB Amount, with MYR calculated automatically using THB ÷ 7.55.
- Add, edit, delete, date filtering, carry-forward balance, CSV, print/PDF, and WhatsApp sharing all use the same Balance Sheet Record data.
- Available periods remain This Week (Monday–Sunday), This Month, and Select Date.
- X/J/P calculation remains: J = X × 2%, P = X × 3%, Total Amount = X + J.
