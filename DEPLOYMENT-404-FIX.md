# Root 404 deployment fix

The project previously contained both `app/` and `src/app/`. Next.js treated the root `app/` directory as the application router and ignored `src/app/`, so `/` had no page and returned 404.

Fixed by moving the public vehicle-rates API route to:

`src/app/api/public/vehicle-rates/route.ts`

and removing the duplicate root `app/` directory.

For Vercel, deploy this folder as the project root. The ZIP is flattened so `package.json`, `src/`, and `public/` are at the archive root.
