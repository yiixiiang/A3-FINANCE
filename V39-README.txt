A3 Finance V39 - Fleet Public API Verification Fix

Fixes:
- Active vehicles saved under Fleet & Photos are now always returned by /api/public/rate-matrix.
- Vehicle Rates order is preserved.
- Newly added fleet vehicles without a rate column are published with S$0 rates until rates are configured.
- Publish verification no longer fails when Fleet & Photos contains an active vehicle that has not yet been added to Vehicle Rates.

After deployment:
1. Open Limousine Management > Fleet & Photos.
2. Save the fleet.
3. Publish to Limousine Website.
4. Open Vehicle Rates and add prices for any vehicle showing S$0.
5. Publish Vehicle Rates.
