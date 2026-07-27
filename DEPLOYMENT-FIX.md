# A3 Finance root-route and Vercel deployment fix

This package contains the complete Next.js project with a valid root route at
`src/app/page.tsx`. Opening `/` renders the A3 Finance application instead of a
404 page.

## Install and verify

Keep your existing `.env.local` file. Then run:

```cmd
npm install
npm run check
npm run dev
```

Open `http://localhost:3000` and confirm the application loads.

## Vercel production variables

Configure these in Vercel Project Settings > Environment Variables:

- `NEXT_PUBLIC_SITE_URL=https://finance.a3group.sg`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (or the server key name supported by your deployment)
- `PRIMARY_ADMIN_EMAIL`

Redeploy after changing environment variables.

## Domain assignment

In Vercel Project Settings > Domains, ensure `finance.a3group.sg` belongs to
this Finance project. Remove it from any other project before assigning it here.
