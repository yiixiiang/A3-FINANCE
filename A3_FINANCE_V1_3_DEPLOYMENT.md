# A3 Finance 1.3.1 Deployment

## Required order

1. Back up the production Supabase database.
2. Open Supabase SQL Editor and run:
   `A3_FINANCE_V1_3_COMPLETE_DATABASE_INSTALL.sql`
   This installs missing migrations 020, 021 and 023 before applying 024.
3. Confirm every administrator has the correct rows in `user_company_access`.
4. Deploy the source to the Vercel project serving `finance.a3group.sg`.
5. Confirm the Vercel environment variables are present.
6. Test the five acceptance checks below.

## Acceptance checks

1. `finance.a3group.sg/limousine` returns 404 and no public limousine link appears inside Finance.
2. Driver Network creates links in the format `/d/XXXXXXXXXX` and the copied complete URL opens the correct company form.
3. The public form does not request NRIC/passport or driving licence number/class/expiry.
4. Approving a pending application creates or links the driver and creates a login automatically when needed. Save the one-time temporary password shown after approval.
5. A Company Administrator sees only assigned companies and only users fully contained in those assigned companies.

## Important behavior

- Existing long `/driver-signup/<uuid>` links remain supported for backward compatibility.
- The standalone limousine website API and database quotation table remain available; only the public limousine pages inside A3 Finance were removed.
- An administrator with no `user_company_access` row is intentionally blocked until company access is assigned.
