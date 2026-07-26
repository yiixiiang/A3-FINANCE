# A3 Finance V26

## Full automatic multi-device synchronization

- User Access is no longer local-only.
- Cloud sync interval changes from 90 seconds to 30 seconds.
- Existing online, focus, visibility and page-close synchronization remains active.
- The cloud application version is raised to 26.

## Automatic cloud onboarding

The existing cloud sign-in routine already attempts password sign-in first and then email signup when the Supabase account does not exist. V26 keeps this automatic onboarding flow and improves the login error handling so cloud failures are visible without destroying local records.

## Stable primary administrator

The canonical administrator is always repaired to:

- username: `admin`
- email: `admin@a3group.sg`
- password: `admin123`
- active ADMIN with all modules

The permission revision is raised to 7.

## Safety

The installer backs up every modified file before applying changes and performs typecheck and production build validation.
