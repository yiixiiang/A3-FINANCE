# A3 Finance corrective upgrade

This package preserves the supplied `.env.local` and Supabase configuration.

## Included corrections

- Coalesces and defers cloud-status events to prevent React cross-component state updates during render.
- Keeps shared-driver loading read-only during render.
- Adds `npm run check` (`typecheck` followed by production build).
- Pins Next.js output file tracing to this project directory, avoiding false workspace-root warnings caused by parent lockfiles.
- Preserves and verifies the A3 Group SG logo in `public/brand` and metadata.
- Adds complete Open Graph and Twitter metadata with `NEXT_PUBLIC_SITE_URL` support.

## Commands

```cmd
npm install
npm run check
npm run dev
```

For Vercel, configure the values from `.env.local` in Project Settings > Environment Variables. Do not commit private service-role or secret keys to Git.
