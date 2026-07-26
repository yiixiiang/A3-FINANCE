# FINANCE1 V10 — AB0003 moved to X → BP

## Record location
- All existing AB0003 imported lines now belong to AEJKY → Partner X → BP.
- AB0003 is no longer imported into the standalone BP partner record.
- V10 migration removes earlier AB0003 imported copies before recreating them under X → BP, preventing duplicates.

## Currency separation
- Partner X main balance remains SGD.
- X → BP remains THB.
- THB records are excluded from X SGD balance and from the X balance used by Partner J calculations.
- The fixed reference exchange rate metadata remains THB ÷ 7.55.

## X screen and statements
- Partner X now shows its SGD balance and a separate nested X → BP (THB) section.
- The nested BP section shows Balance, selected week/month/date amount and Total.
- AB0003 rows can be edited or deleted individually.
- New X → BP records can be added directly.
- CSV, WhatsApp and Print/PDF outputs include both X SGD and X → BP THB as separate sections.

## Validation
- TypeScript validation passed with `npm run typecheck`.
