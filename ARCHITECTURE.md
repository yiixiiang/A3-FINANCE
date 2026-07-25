# Architecture

This clean rebuild separates:
- `src/lib/data.ts`: role, vehicle, service, rate and demonstration data
- `src/components/management-app.tsx`: application shell and module views
- `src/app`: Next.js routing, metadata, global styles and Speed Insights

Production integrations should replace demonstration data with a database/API layer and server-side role enforcement.
