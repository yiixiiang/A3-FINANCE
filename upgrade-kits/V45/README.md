# V45 — CRM, suppliers and procurement

## Apply

1. Back up the database and source.
2. Run `supabase/migrations-v39-v50/v45.sql` in a non-production environment.
3. Implement and test the items below.
4. Run `npm run check` and `npm run build`.
5. Record evidence before moving to V46.

## Implementation checklist

- [ ] Build customer and supplier masters
- [ ] Add quotation/order/purchase workflows
- [ ] Connect invoices and bills to accounting
- [ ] Add ageing and duplicate-document checks

## Acceptance gate

Sales and purchasing documents create correct accounting records.

## Rollback

Restore the pre-version database backup and source tag. Schema migrations intentionally avoid destructive drops, but application code must still be rolled back together with the database state.
