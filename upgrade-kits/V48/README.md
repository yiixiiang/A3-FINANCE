# V48 — Multi-company and multi-currency

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v48.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to V49.

## Implementation checklist

- [ ] Add exchange-rate sources and locking
- [ ] Post realised/unrealised FX adjustments
- [ ] Create consolidation and eliminations
- [ ] Enforce company isolation

## Acceptance gate

Entity ledgers remain isolated and consolidation balances after eliminations.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
