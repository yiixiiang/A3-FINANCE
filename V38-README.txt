A3 Finance V38 - Invalid Cloud Response Fix

Fixes:
- Publishing Fleet & Photos no longer uploads every Finance CMS storage key.
- Vehicle rates, fleet and additional charges publish only their relevant records.
- Vehicle photos are resized to a maximum dimension of 1280 px and compressed before saving.
- Cloud responses now show useful HTTP errors instead of only “Invalid cloud response”.
- Large combined cloud requests are split by storage record.

Deployment:
Upload the contents of the FINANCE folder to the root of the Finance GitHub repository connected to Vercel.
After deployment, reselect any previously large vehicle image, save the vehicle, then publish again.

Required Vercel environment variables:
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
Optional: PRIMARY_ADMIN_EMAIL
