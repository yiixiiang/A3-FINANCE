# V41 — Workflow and posting controls

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v41.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to V42.

## Implementation checklist

- [ ] Add configurable approval routes
- [ ] Lock posted journals
- [ ] Support reversals rather than deletion
- [ ] Add maker-checker tests

## Acceptance gate

Posted transactions are immutable and approvals are auditable.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
