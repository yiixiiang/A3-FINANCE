# FINANCE1 V9 — Partner Balance Sheet

## Separate partner records
- Five default partners per company: BP, J, X, HENG and 213.
- Each partner has its own records, date filter, totals, CSV, PDF/print and WhatsApp statement.
- Add Partner, Edit Partner and Delete Partner are available.
- Every record supports Add, Edit, Delete and Save.

## Periods
- This Week uses Monday to Sunday.
- This Month uses the calendar month.
- Select Date supports required From and To dates.
- The selected date range is shown on screen and on the statement.

## Partner BP
- Currency: THB.
- Shows Balance, selected-period amount and Total.
- AB0003 lines remain imported under AEJKY → BP in THB.
- The fixed THB/MYR reference rate remains 7.55 in imported record metadata.

## Partner J
- Currency: SGD.
- A selected-period amount = selected Self Key Amount × 3%.
- B selected-period amount = selected Self Key Amount × 2%.
- BP selected-period amount = selected Self Key Amount × 2%.
- A, B and BP balances carry forward automatically from earlier Self Key records.
- J Balance = A Total − B Total.
- X Balance is pulled from Partner X.
- X + J Total = X Balance + J Balance.

## Partner X
- Currency: SGD.
- Default opening balance: SGD 5,877.00.
- Has its own independent records and statement.

## Partners HENG and 213
- Currency: SGD.
- A Balance carries forward automatically.
- A This Week/Month/Selected Date equals the total Self Key Amount recorded for that period.
- A Total = A Balance + selected-period Self Key Amount.

## Validation
- TypeScript validation passed with `npx tsc --noEmit`.
- Production build is not available in the Linux packaging workspace because the supplied dependencies contain Windows SWC binaries.
