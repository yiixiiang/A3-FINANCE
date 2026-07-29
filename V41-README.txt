FINANCE V41 — FLEET VEHICLE NAME SYNC

Fixes:
- Fleet & Vehicle Photos now uses the exact same vehicle names as Vehicle Rate.
- Old duplicate/mismatched fleet names are consolidated by display order.
- Existing photos, capacities and descriptions are preserved where possible.
- Vehicle names are read-only in Fleet & Photos.
- Rename/add/delete vehicle types under Limousine Management > Vehicle Rate.
- Saving or publishing Fleet & Photos automatically aligns the fleet to Vehicle Rate.

Deployment:
1. Replace the Finance project files with this package.
2. Deploy to Vercel.
3. Open Limousine Management > Fleet & Photos.
4. Check the photos/capacities, Save draft, then Publish to Limousine Website.
