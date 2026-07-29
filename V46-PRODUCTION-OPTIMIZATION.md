# Finance V46 Production Optimization

- One public action only: **Publish All to Limousine Website**.
- Fleet, synchronized vehicle names, rate rules, and additional charges upload in one workflow.
- Removed sectional publish actions and obsolete Load & Publish controls.
- Starter data buttons now load drafts only; publishing remains controlled by Publish All.
- Public API verification checks the final unified active fleet after upload.
- Fleet is the single source of truth for public vehicle names and order.
- Improved responsive tables, sticky publishing control, mobile actions, and section navigation.
- Removed packaged build caches, dependencies, repository metadata, backups, and old upgrade artifacts.

Validation:
- `npm run typecheck` passed.
- `npm run build` could not finish because the sandbox package mirror did not contain the required Next.js SWC binary.
