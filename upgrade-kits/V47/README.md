# V47 — BI dashboards and KPI snapshots

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v47.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to V48.

## Implementation checklist

- [ ] Define governed KPI formulas
- [ ] Create scheduled snapshots
- [ ] Add drill-down to source transactions
- [ ] Test totals against ledger reports

## Acceptance gate

Dashboard totals tie to the underlying ledger for the same period.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
