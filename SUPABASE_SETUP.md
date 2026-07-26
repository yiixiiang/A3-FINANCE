# A3 Finance — Supabase Setup

## 1. Create the SQL table

Open **Supabase Dashboard → SQL Editor**, paste the complete contents of `supabase/schema.sql`, then click **Run**.

## 2. Authentication

A3 Finance uses the email and password stored for each active user in **User Access** to sign in to Supabase Auth.

On the first successful A3 login, the app attempts to create the matching Supabase Auth account automatically. When Supabase email confirmation is enabled, confirm the email and sign in again. Alternatively, create the user in **Supabase Dashboard → Authentication → Users** before the first login.

The initial local administrator is:

- App username: `admin`
- App email: `admin@a3group.sg`
- App password: `admin123`

For production, change the administrator email and password in User Access and create the same credentials in Supabase Auth.

## 3. Vercel environment variables

Add these variables to the Vercel project for Production, Preview and Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Then redeploy the website.

## 4. First sync

When a user signs in successfully:

- If their Supabase storage is empty, all existing A3 browser records are uploaded.
- If cloud records exist, cloud records are loaded into the browser.
- Later Add, Edit, Delete and Save actions are written to both the browser and Supabase.
- Financial, company, driver, invoice, quotation, rate and balance records are synced.
- The local `a3-user-access` record is intentionally not uploaded because the legacy app stores local passwords in that record. Supabase Auth protects the cloud account password instead.
- Each Supabase Auth user can read and change only their own rows because Row Level Security is enabled.
