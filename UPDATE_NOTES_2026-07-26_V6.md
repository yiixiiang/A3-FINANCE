# FINANCE1 V6 Update

## Invoice PDF assets
- English and Chinese invoice/quotation PDF generation now waits for uploaded company images to decode before rendering.
- The selected company's logo is rendered in the PDF masthead.
- The selected company's chop is rendered in the PDF authorisation/footer area.
- Exact PDF preview refreshes when logo, chop, or their configured dimensions change.
- Download, print, sharing, and combined invoice PDF functions use the asynchronous asset-safe renderer.

## X + J + P combined balance sheet
- X, J, and P are displayed on one combined statement.
- X remains the recorded base balance.
- J is calculated automatically as X x 2%.
- P is calculated automatically as X x 3%.
- Payable total remains X + J.
- Date From and Date To appear on screen, CSV, WhatsApp text, and Print/PDF.
- Weekly view remains Monday to Sunday.
- Each record row shows X, J, P, and X + J together.
- Previous X balance and closing X balance remain visible on the same sheet.

## Validation
- TypeScript validation passed.
- Production build was not available in the Linux packaging environment because the supplied dependency folder contains Windows SWC binaries. Run npm install and npm run build on Windows.
