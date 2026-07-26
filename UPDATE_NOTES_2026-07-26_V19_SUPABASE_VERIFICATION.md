# V19 Supabase verification

- Added a live Supabase status indicator in the application header.
- Added `/api/health` for production environment verification.
- Added `supabase/verify.sql` to verify the table, RLS policies, trigger, and Auth user count.
- Added `05-VERIFY-SUPABASE-AND-WEBSITE.cmd` with a secure password prompt.
- The verifier tests Auth, RLS SELECT, temporary INSERT/DELETE, and the production health endpoint.
- The temporary database record is removed immediately after the test.
