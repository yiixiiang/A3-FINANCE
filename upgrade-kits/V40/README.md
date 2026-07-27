# V40 — RBAC and permission catalogue

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v40.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to V41.

## Implementation checklist

- [ ] Define permission keys and role mappings
- [ ] Enforce permissions in server routes and database functions
- [ ] Add role-management UI
- [ ] Test Admin, Manager, Accountant, Approver and Read Only

## Acceptance gate

Every protected action is denied server-side when permission is absent.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
