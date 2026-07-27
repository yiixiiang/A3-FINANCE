# Cloud Sync recovery

1. Deploy this package and keep these Vercel Production variables configured:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
2. In the app, open **Cloud & Backup**.
3. Under **Reconnect Cloud Sync**, enter the exact email and password from Supabase Authentication.
4. Select **Connect and sync**, then **Verify connection**.

The website login and Supabase password may be different. Failed Supabase logins no longer trigger automatic sign-up.
