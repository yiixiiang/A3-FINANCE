# V46 — AI review and anomaly queue

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v46.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to V47.

## Implementation checklist

- [ ] Keep AI advisory-only
- [ ] Redact sensitive data before external model calls
- [ ] Store findings with evidence and reviewer decision
- [ ] Add false-positive and audit tests

## Acceptance gate

No AI action posts transactions automatically; every finding is reviewable.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
