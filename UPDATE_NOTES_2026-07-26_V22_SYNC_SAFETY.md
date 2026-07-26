# FINANCE1 V22 — Multi-Device Sync Safety

## Added

- Automatic cloud synchronization every 90 seconds while the browser is online and visible.
- Immediate retry when the browser reconnects, regains focus, or returns to the foreground.
- Per-record-group synchronization timestamps instead of blindly replacing every local value.
- Multi-device conflict detection with newest-change resolution and an administrator audit history.
- Pending cloud-save counter and last-successful-sync timestamp.
- Supabase `a3_app_backups` table protected by Row Level Security.
- Automatic daily cloud backup, manual backup, recent backup history, and one-click backup restore.
- Portable JSON backup import as well as download.
- Pre-first-sync local safety snapshot when the backup table is ready.
- V22 database upgrade, deployment, and verification Windows scripts.

## Safety rules

- User Access remains local-only.
- First cloud synchronization continues to prefer established cloud records, but records a conflict audit and attempts a pre-sync safety backup first.
- Later conflicts use the newest update timestamp and retain an audit entry showing which side was kept.
- Only the authenticated Supabase user can read, create, or delete their own backup rows.
- The newest 10 cloud backups are retained.
- Cloud failures never block local A3 login or local record editing.

## Activation

1. Run `08-OPEN-V22-SQL-UPGRADE.cmd` and execute the copied SQL in Supabase.
2. Run `09-DEPLOY-V22-SYNC-SAFETY.cmd`.
3. Run `10-OPEN-V22-VERIFICATION.cmd` and complete the on-screen checks.
