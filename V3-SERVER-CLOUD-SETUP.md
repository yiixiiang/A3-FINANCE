# A3 Finance v3 Server Cloud Sync

Set the following variables in Vercel Production, Preview, and Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PRIMARY_ADMIN_EMAIL` (optional; selects the owner Auth user)
- `NEXT_PUBLIC_SITE_URL`

The service-role key is used only by `app/api/cloud/route.ts`. It is never exposed to the browser.

At least one Supabase Authentication user must exist because the existing cloud tables use a foreign key to `auth.users`. A GitHub-created user is supported; no GitHub login is required inside the finance website.
