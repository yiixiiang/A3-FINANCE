# FINANCE1 V17 — Supabase SQL Cloud Sync

## Added

- Supabase project URL and publishable key configuration.
- Authenticated Supabase cloud login using each A3 user's email and password.
- Automatic first-time upload of existing browser business records.
- Automatic cloud hydration on later sign-ins and other computers.
- Continuous Add/Edit/Delete/Save mirroring to Supabase.
- `public.a3_app_storage` SQL table with per-user Row Level Security.
- Access-token refresh and queued cloud writes.
- Supabase setup guide and Vercel environment-variable instructions.
- Cloud sync indicator in the application sidebar.

## Security

- Uses only the public Supabase publishable key in the browser.
- Does not require or include the service-role secret or database password.
- Cloud rows are restricted to `auth.uid()` through RLS.
- The legacy local User Access record is not uploaded because it includes local passwords. Supabase Auth handles the cloud password.

## Validation

- `npm run typecheck` passed.
- Production build could not run in this Linux workspace because the supplied dependency set does not contain a Linux Next.js SWC binary and the fallback download service returned 503.
