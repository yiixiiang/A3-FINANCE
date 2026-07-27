# V50 — Production hardening and sign-off

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v50.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to Vrelease.

## Implementation checklist

- [ ] Run dependency, security and RLS review
- [ ] Load/performance test critical workflows
- [ ] Complete backup restore and disaster-recovery drill
- [ ] Create release checklist, runbooks and user acceptance sign-off

## Acceptance gate

Production release passes build, security, restore, accounting and UAT gates.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
