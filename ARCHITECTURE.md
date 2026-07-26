# Architecture

The application is split to keep the first screen responsive:

- `src/components/management-app.tsx`: lightweight navigation shell plus the overview and booking entry screens.
- `src/components/management-modules.tsx`: rate, driver, finance, document and administration workspaces loaded on demand.
- `src/lib/browser-storage.ts`: coalesced browser persistence that defers serialization/writes until the main thread is idle and flushes on page hide.
- `src/lib/file-to-data.ts`: validated local file conversion for previews and demonstration storage.
- `src/lib/data.ts`: role, vehicle, service, rate and demonstration data.
- `src/app`: Next.js routing, metadata, global styles and Speed Insights.

Production integrations should replace demonstration data with a database/API layer, object storage for attachments and server-side role enforcement.

## V23 cloud audit

`browser-storage.ts` records save metadata into a local audit queue. `supabase-cloud.ts` uploads queued entries to `a3_app_audit` after authenticated writes or synchronization. Supabase RLS limits each user to their own audit entries. The Cloud & Backup module lists, exports, and clears the authenticated user's audit history.
