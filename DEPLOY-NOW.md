# Deploy this package to Vercel

1. Create a **new Vercel project** rather than reusing a project with stale settings.
2. Upload/import the folder whose root contains `package.json`.
3. Framework Preset: **Next.js**.
4. Root Directory: leave blank / `.`.
5. Build Command: `npm run build`.
6. Output Directory: leave blank. Do not set `public`, `dist`, `out`, or `.next` manually.
7. Install Command: `npm ci`.
8. Node.js Version: `22.x`.
9. Deploy and open the generated `*.vercel.app` deployment URL.

If using an existing Vercel project, clear Root Directory and Output Directory before redeploying. A stale Root Directory or Output Directory produces a Vercel 404 even when `src/app/page.tsx` exists.
