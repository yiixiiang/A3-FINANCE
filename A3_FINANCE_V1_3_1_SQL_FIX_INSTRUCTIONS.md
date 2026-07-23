# A3 Finance 1.3.1 SQL Fix

The error below means the database did not yet have migration 020 installed:

```text
ERROR: 42P01: relation "public.driver_signup_links" does not exist
```

## Correct action

1. Open **Supabase Dashboard → SQL Editor**.
2. Create a new query.
3. Paste the complete contents of:
   `A3_FINANCE_V1_3_COMPLETE_DATABASE_INSTALL.sql`
4. Click **Run** once.
5. At the bottom, confirm all four result columns are `true`:
   - `driver_signup_links_ready`
   - `driver_signup_applications_ready`
   - `driver_documents_ready`
   - `short_signup_codes_ready`
6. Then deploy the A3 Finance V1.3 source to Vercel.

## Important

- The previously failed V1.3 query started with `BEGIN`; PostgreSQL rolled it back after the error, so rerunning the corrected installer is safe.
- This complete installer expects the A3 Finance base database through migration 019 to already exist.
- Do not run migration 024 alone on a database that does not contain migration 020 and 021.
