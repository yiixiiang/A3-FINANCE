# Architecture

The application is split to keep the first screen responsive:

- `src/components/management-app.tsx`: lightweight navigation shell plus the overview and booking entry screens.
- `src/components/management-modules.tsx`: rate, driver, finance, document and administration workspaces loaded on demand.
- `src/lib/browser-storage.ts`: coalesced browser persistence that defers serialization/writes until the main thread is idle and flushes on page hide.
- `src/lib/file-to-data.ts`: validated local file conversion for previews and demonstration storage.
- `src/lib/data.ts`: role, vehicle, service, rate and demonstration data.
- `src/app`: Next.js routing, metadata, global styles and Speed Insights.

Production integrations should replace demonstration data with a database/API layer, object storage for attachments and server-side role enforcement.
