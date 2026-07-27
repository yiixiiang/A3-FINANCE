# V49 — External integrations

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v49.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to V50.

## Implementation checklist

- [ ] Add idempotent inbound/outbound job queue
- [ ] Store provider references and retry state
- [ ] Implement webhook signature verification in application code
- [ ] Add e-invoice mapping and sandbox tests

## Acceptance gate

Retries do not duplicate transactions and failed jobs are recoverable.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
