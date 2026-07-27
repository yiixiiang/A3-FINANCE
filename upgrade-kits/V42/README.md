# V42 — Fixed assets

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v42.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to V43.

## Implementation checklist

- [ ] Create asset register UI
- [ ] Post acquisition and disposal journals
- [ ] Run depreciation schedule
- [ ] Reconcile asset ledger to GL

## Acceptance gate

Depreciation and disposal journals balance and match the asset register.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
