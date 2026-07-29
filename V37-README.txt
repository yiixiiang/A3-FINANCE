A3 Finance V37

Changes
- Sidebar and page title renamed from Rate Management to Limousine Management.
- Fleet & Vehicle Photos now has explicit Save draft and Publish to Limousine Website actions.
- Fleet publishing now uploads local CMS records to Supabase before verifying the public API.
- Vehicle rates and additional charges publishing use the same cloud-push workflow.
- Fleet save/publish displays clear success or error messages.
- Edit and delete changes require republishing before they affect the live website.

Deployment
1. Upload the contents of this FINANCE folder to the GitHub repository connected to finance.a3group.sg.
2. Allow Vercel to redeploy.
3. Open Finance > Limousine Management > Fleet & Photos.
4. Edit a vehicle and save it.
5. Select Publish to Limousine Website.
6. Confirm Cloud & Backup is connected if an error appears.
