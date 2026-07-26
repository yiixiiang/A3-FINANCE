# FINANCE1 V11 Update

## Independent Balance Sheet

- Removed Company Management ownership from the Balance Sheet.
- Removed the AEJKY company selector and AEJKY label from Balance Sheet screen, CSV, WhatsApp statement, and Print/PDF.
- The hierarchy is now `Balance Sheet → Partner X → BP`, not `AEJKY → Partner X → BP`.
- All balance partners and records migrate to a single global Balance Sheet scope.
- Existing X, J, BP, HENG, 213, custom partner, and AB0003 X → BP records are preserved.
- Invoices and quotations remain company-specific; this change applies only to Balance Sheet records.

## Validation

- TypeScript validation passed with `tsc --noEmit --incremental false`.
