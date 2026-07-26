# FINANCE1 V15 — Company Management Delete

## Company Management
- Added **Delete selected company** beside **Edit selected company**.
- Added **Delete** action on every company row.
- Delete requires an administrator with access to all companies.
- A confirmation warning names the exact company and explains the affected records.
- At least one company must remain, preventing the application from being left without a valid company.

## Safe deletion scope
Deleting a company removes only data owned by that company:
- Company profile and document settings
- Company clients and their client-rate tables
- Income and expense records
- Invoices and quotations
- Driver claims
- User accounts assigned to the deleted company are unassigned and suspended

The independent Partner Balance Sheet is not company-owned and is not deleted or changed.

## Validation
- TypeScript validation passed with `tsc --noEmit --incremental false`.
