# A3 Finance — Admin Password & Login Security Upgrade

## What changed

- Removed the administrator username/password hint from the public login page.
- Added a **Change password** button in the signed-in header.
- Added current-password verification, confirmation matching, and a 10-character minimum.
- Fixed a bug that reset the primary administrator password back to the hard-coded default whenever user records were normalized.
- Updates the corresponding Supabase Auth user when a valid cloud administrator session is available.
- Keeps local authentication functional when Supabase is not configured or is temporarily unavailable.
- Added `npm run check` (`typecheck` + production build).
- Added `outputFileTracingRoot` to avoid the multiple-lockfile workspace warning.

## Install safely

1. Back up the current FINANCE folder.
2. Keep your existing `.env.local`; this package intentionally does not include secrets.
3. Extract this ZIP over the project and allow replacement of source files.
4. Run:

```cmd
npm install
npm run check
npm run dev
```

## Change the administrator password

1. Sign in.
2. Click **Change password** in the top-right header.
3. Enter the current password.
4. Enter and confirm a new password of at least 10 characters.
5. Click **Update password**.

For an untouched installation, the legacy bootstrap login is `admin` with password `admin123`. It is no longer displayed on the website. Change it immediately after signing in.

## Supabase note

To update the Supabase Auth password as well, `.env.local` / Vercel must contain:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
PRIMARY_ADMIN_EMAIL=admin@a3group.sg
NEXT_PUBLIC_SITE_URL=https://your-domain.example
```

The signed-in cloud account must be the email specified by `PRIMARY_ADMIN_EMAIL`.

## Verification performed

- `npm run typecheck`: passed.
- Production build was started, but the isolated build environment could not download the Linux Next.js SWC package because its package proxy returned HTTP 503. Run `npm run check` locally; your Windows installation already has the appropriate dependency path.
