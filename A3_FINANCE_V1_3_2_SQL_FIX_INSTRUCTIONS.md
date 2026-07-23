# A3 Finance V1.3.2 — PostgreSQL ERROR 21000 Fix

The previous complete installer could stop with:

`ON CONFLICT DO UPDATE command cannot affect row a second time`

This release removes every installation-time multi-row `ON CONFLICT DO UPDATE` operation from migrations 020, 021, 023, and 024. Existing rows are updated first, and only missing rows are inserted afterward.

## Run now

1. Open Supabase **SQL Editor**.
2. Create a new query.
3. Paste the full contents of `A3_FINANCE_V1_3_2_COMPLETE_DATABASE_INSTALL_CARDINALITY_SAFE.sql`.
4. Run the entire file once.
5. Confirm the final result shows all four values as `true`:
   - `driver_signup_links_ready`
   - `driver_signup_applications_ready`
   - `driver_documents_ready`
   - `short_signup_codes_ready`

The script is safe after a partial V1.3.1 execution because each migration section is transaction-wrapped and repeatable.

Do not run the superseded V1.3 or V1.3.1 SQL installers again.
