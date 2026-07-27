# V44 — Payroll foundation

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v44.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to V45.

## Implementation checklist

- [ ] Secure employee/pay-run access
- [ ] Calculate gross, deductions and net
- [ ] Post payroll journals
- [ ] Export payment and statutory files only after jurisdiction review

## Acceptance gate

A test pay run balances and sensitive data is access controlled.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
