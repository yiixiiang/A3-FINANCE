A3 FINANCE V27 COMPLETE SET
===========================

This is a complete project source package, not a patch-only ZIP.

V27 updates:
- Stable canonical administrator recovery
- Administrator login: admin / admin123
- Administrator cloud email: admin@a3group.sg
- Permission migration revision 6
- Supabase auto-sync every 30 seconds while online and visible
- Immediate sync on focus, reconnect and app visibility
- Existing V24 cloud backup, conflict handling and audit history retained
- Full Next.js source, Supabase SQL, deployment scripts and documentation included

IMPORTANT SECURITY DESIGN
- User Access remains local-only because it currently contains passwords.
- Do not put user passwords into a general cloud-storage table.
- Each cloud-enabled user needs a matching confirmed Supabase Auth account.

INSTALL
1. Back up the current project.
2. Copy this complete folder over the project, excluding .env.local.
3. Run npm install.
4. Run npm run typecheck.
5. Run npm run build.
6. Commit and push to GitHub; Vercel will deploy.
7. On the main computer, verify cloud connection and upload local records once.
8. On other devices, verify connection and restore cloud records once.

PACKAGE VALIDATION
- TypeScript typecheck passed in the packaging environment.
- The production build could not finish in the packaging container because the Linux Next.js SWC native binary was unavailable there. The installer runs npm install and npm run build on your Windows project before deployment.
