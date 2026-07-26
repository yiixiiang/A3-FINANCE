# FINANCE1 V22 activation

1. Extract V22 directly into `C:\Users\Admin\Downloads\A3\projects\FINANCE`.
2. Run `08-OPEN-V22-SQL-UPGRADE.cmd`.
3. Paste the copied SQL into Supabase SQL Editor and click Run.
4. Run `09-DEPLOY-V22-SYNC-SAFETY.cmd`.
5. Sign out and sign in once after production deployment.
6. Open **Fleet & Settings → Cloud & Backup**.
7. Confirm Cloud Connected, Pending Saves = 0, and Cloud Backups is available.
8. Click **Create backup now**.
9. Add a small test record, click **Sync now**, refresh the browser, and confirm the record remains.
10. Run `10-OPEN-V22-VERIFICATION.cmd` for the final dashboard links.
