A3 FINANCE V26 – FULL AUTOMATIC MULTI-DEVICE UPGRADE

This package upgrades an existing A3-FINANCE project.

Included
- Keeps the primary login stable: admin / admin123.
- Synchronizes User Access records through Supabase.
- Automatically attempts Supabase sign-in when an A3 user signs in.
- Automatically creates the matching Supabase account on first sign-in when Supabase email signup is enabled.
- Runs automatic synchronization every 30 seconds while the app is open.
- Synchronizes immediately when the device reconnects, returns to the app, or regains focus.
- Flushes pending saves when the page closes.
- Preserves existing income, expense, driver, invoice, quotation, company and booking records.
- Creates a timestamped rollback backup before editing source files.
- Runs npm install, TypeScript validation, production build, Git commit and Git push.

Before installation
1. Confirm the laptop has the correct master records.
2. Download a Local JSON backup from Cloud & Backup.
3. Supabase must contain the tables from the latest schema.
4. In Supabase Authentication settings, Email provider must be enabled.
5. To allow automatic first-login account creation, Enable email signups.

Install
Extract this ZIP. Open PowerShell in the extracted folder and run:

powershell -ExecutionPolicy Bypass -File .\INSTALL-V26-FULL-AUTO-SYNC.ps1

Enter your A3-FINANCE project folder when prompted.

After Vercel deploys
- Main laptop: sign in as admin, open Cloud & Backup, Verify connection, Upload local records once.
- Other devices: sign in, open Cloud & Backup, Verify connection, Restore cloud records once.
- Future saves synchronize automatically.

Supabase users
Each A3 user must have a valid email and password of at least 6 characters. On first sign-in, the app attempts to sign in to Supabase. When the account does not exist and email signup is enabled, the app creates it automatically. If email confirmation is enabled, confirm the email once.

Rollback
Run ROLLBACK-V26.ps1 and enter the same project folder.
