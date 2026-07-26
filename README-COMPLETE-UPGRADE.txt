A3 FINANCE V24 - FULL COMPLETE UPGRADE
======================================

This is a complete standalone package. You do not need to install V17, V18,
V19, V20, V21, V22, or V23 first.

INSTALL LOCATION
----------------
Extract every file directly into:
C:\Users\Admin\Downloads\A3\projects\FINANCE

RUN IN THIS ORDER
-----------------
1. 01-OPEN-AND-RUN-COMPLETE-SQL.cmd
2. 02-SETUP-BUILD-AND-DEPLOY.cmd
3. 03-PUSH-GITHUB-SAFELY.cmd
4. 04-VERIFY-COMPLETE-UPGRADE.cmd

SUPABASE AUTH USER
------------------
Create/confirm a user in Supabase Authentication. Its email and password must
match the A3 Finance user credentials used for cloud synchronization.

RECOVERY LOGIN
--------------
A3 local administrator recovery login:
Username: admin
Password: admin123

SECURITY
--------
- The package includes only the Supabase publishable browser key.
- It does not include the database password or service_role secret.
- .env.local is excluded from Git by .gitignore.
- Supabase tables use Row Level Security.

FULL INCLUDED DATABASE TABLES
-----------------------------
- a3_app_storage: synchronized application data
- a3_app_backups: cloud backup history
- a3_app_audit: cloud activity history

MAIN INCLUDED APPLICATION FEATURES
----------------------------------
- Company Management with delete protection
- Company bank information
- Professional invoice and quotation PDFs
- English/Chinese limousine terms
- Company logo and chop on PDFs
- Driver Report and Driver Network
- Job-based fixed driver payout tiers
- Today / This Week / This Month / This Year reports
- Partner Balance Sheet and Record Management
- Add/Edit/Delete/Save and deductions
- Custom partner A/B/C/D sections and percentages
- WhatsApp, Telegram and WeChat sharing
- Supabase cloud sync, conflict handling and reconnect
- Cloud backups, JSON backup import/export
- Cloud audit and activity CSV export
- Health and database verification tools
