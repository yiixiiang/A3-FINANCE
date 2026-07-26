# FINANCE1 V21 — Supabase Cloud Center

## Added

- New administrator-only **Cloud & Backup** module.
- Automatic cloud-session resume after a page refresh.
- Supabase connection verification with local/cloud record counts.
- Manual **Sync now** action.
- Manual **Upload local records** action for first-time migration.
- Manual **Restore cloud records** action for a new computer.
- Downloadable JSON backup of all syncable browser records.
- Clear first-time activation checklist and cloud error messages.
- Existing A3 login remains available even when Supabase is offline.

## Safety

- User Access records remain local-only.
- Upload and restore actions require confirmation.
- Restore replaces only matching cloud-managed keys; unrelated local-only keys remain.
- Supabase Row Level Security continues to restrict records to the authenticated user.

## Deployment

Run `07-DEPLOY-CLOUD-CENTER.cmd` after extracting V21 into the FINANCE project folder.
