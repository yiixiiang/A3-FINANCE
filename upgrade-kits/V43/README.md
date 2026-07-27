# V43 — Inventory and costing

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v43.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to V44.

## Implementation checklist

- [ ] Create items, warehouses and movements UI
- [ ] Choose FIFO or weighted-average policy
- [ ] Post inventory and COGS journals
- [ ] Prevent negative stock when configured

## Acceptance gate

Stock quantities and inventory value reconcile to the GL.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
