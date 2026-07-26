# FINANCE1 V8 Update

## Clean X + J + P Balance Sheet

- Replaced the crowded card grid with four numbered statement sections.
- Section 1: Last Balance X, selected-period X, Total Balance X.
- Section 2: Last Balance J, selected-period J record, Balance J, Self Key Amount, J at 2%, Total Payable J.
- Section 3: P at 3% of Self Key Amount.
- Section 4: Total Payable J + Total Balance X.
- Record table now shows only Date, Description, Balance X, Balance J, Self Key Amount and Actions.
- Removed repeated J/P/final-total columns from every record row.
- Simplified Add/Edit record form with one calculation summary.
- Print/PDF changed to a clean A4 portrait statement.
- CSV and WhatsApp statement follow the same clean order.
- This Week remains Monday to Sunday; This Month and custom date range remain available.

## Validation

- TypeScript validation passed.
- Production build cannot run in the Linux workspace because the supplied dependencies contain Windows SWC binaries. Run npm install and npm run build on Windows.
