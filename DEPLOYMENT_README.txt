A3 Finance deployable source.

Required Vercel environment variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Recommended commands:
  npm ci
  npm run build

The database must include migrations through:
  supabase/migrations/024_company_scoped_admin_short_driver_links.sql
