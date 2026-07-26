# A3 Finance V18 — Supabase activation

Run these files in order from the FINANCE project folder:

1. `01-RUN-SUPABASE-SQL.cmd`
   - Copies `supabase/schema.sql` to the clipboard.
   - Opens the correct Supabase SQL Editor.
   - Paste and run the SQL.

2. `02-OPEN-SUPABASE-USERS.cmd`
   - Create or confirm the A3 Finance login in Supabase Authentication.
   - Its email/password must match the login configured in A3 Finance User Access.

3. `03-SET-VERCEL-ENV-AND-DEPLOY.cmd`
   - Creates `.env.local`.
   - Links the existing Vercel project when necessary.
   - Adds both Supabase variables to Production, Preview and Development.
   - Installs, validates, builds and deploys production.

4. `04-PUSH-GITHUB-SAFELY.cmd` (optional)
   - Commits and pushes the source to `yiixiiang/A3-FINANCE` without force-pushing.

## First cloud sync

After deployment, sign in to A3 Finance using the matching Supabase Auth account. Existing local browser records are uploaded when the user has no cloud rows. Use the same login on another computer to verify the records load from Supabase.

## V19 final verification

After deploying, run `05-VERIFY-SUPABASE-AND-WEBSITE.cmd`.
It verifies the Supabase login, `a3_app_storage` access through RLS, a temporary write/delete, and the website `/api/health` endpoint.
