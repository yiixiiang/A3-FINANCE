# Supabase User Sync Upgrade

The User Access module now creates and updates accounts in Supabase Authentication before saving the local permissions record.

## Required environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
PRIMARY_ADMIN_EMAIL=admin@a3group.sg
```

`SUPABASE_SERVICE_ROLE_KEY` is also supported as an alternative server variable name. Never expose either server key through a `NEXT_PUBLIC_` variable.

After editing `.env.local`, stop Next.js, remove `.next`, and restart it.

## Administrator requirement

The cloud session used in A3 Finance must belong to the email configured by `PRIMARY_ADMIN_EMAIL`. This prevents ordinary users from invoking the server-side Auth administration API.

## Behaviour

- Add User: creates the Supabase Auth user, then saves the A3 Finance access record.
- Edit User: updates email, metadata, and optionally password in Supabase, then updates the local access record.
- Delete User: deletes the Supabase Auth user, then deletes the local access record.
- Failed cloud operations do not save partial local changes.
