# FINANCE1 V7 Update

## X + J + P combined balance sheet

- Uses SGD only.
- Each editable record contains:
  - Balance X (recorded SGD)
  - Balance J (recorded SGD)
  - Self Key Amount (SGD)
- J for the selected week/month/custom date range is calculated as Self Key Amount × 2%.
- Total Payable J is Balance J + selected-period J.
- P is calculated as Self Key Amount × 3%.
- Total J + Balance X is Total Payable J + Closing Balance X.
- Last-time X balance and closing X balance remain visible.
- Date From / Date To appear in screen view, CSV, WhatsApp statement and Print/PDF.
- Weekly periods run Monday to Sunday.
- Add, edit and delete support all three input values.
- Existing balance records migrate into the new SGD schema without being deleted.

## Validation

- TypeScript check passed.
- Linux production build remains unavailable in this workspace because the uploaded dependencies do not contain the Linux Next.js SWC binary.
