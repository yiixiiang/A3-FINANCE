# V39 — Database integration completion

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v39.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to V40.

## Implementation checklist

- [ ] Replace remaining localStorage writes with repository calls
- [ ] Connect journals, approvals, budgets and reconciliation screens
- [ ] Add optimistic concurrency/version columns
- [ ] Add integration tests for save-refresh-edit

## Acceptance gate

All financial records survive refresh and a second device sees committed data.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
