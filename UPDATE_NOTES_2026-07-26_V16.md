# FINANCE1 V16 Update

## Record Management: Partner A/B/C/D Sections

- Every newly added Balance Sheet partner now starts with four record sections: A, B, C and D.
- Each section can be enabled or disabled.
- Each section has an editable section name, opening balance and percentage.
- Partner currency can be set to SGD or THB.
- At least one section must remain enabled.

## Record Add / Edit

- Select the partner section (A/B/C/D).
- Enter an optional base amount and percentage.
- The system calculates a suggested amount automatically.
- The calculated amount remains editable before saving.
- Add and Deduct transaction types are supported.
- Saved records retain section, base amount, percentage and final amount.

## Statements and Sharing

- A/B/C/D balances, selected-period amounts, percentages and totals appear in the partner statement.
- CSV and Print/PDF include section, base amount, percentage and final amount.
- WhatsApp, Telegram and WeChat messages show final values and percentages without the old “Self Key × percentage” formula wording.

## Validation

- TypeScript validation passed with `npm run typecheck`.
- Production build was not completed in the Linux workspace because Next.js attempted to download a Linux SWC package and the package gateway returned HTTP 503.
