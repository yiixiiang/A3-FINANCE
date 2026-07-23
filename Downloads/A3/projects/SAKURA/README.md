# Sakura Entertainment Website

A fast, responsive bilingual nightclub website built with Next.js and prepared for Vercel.

## Included

- Premium Sakura-inspired responsive homepage
- Complete English / Simplified Chinese switch
- Events and drink promotions
- WhatsApp and Telegram table-booking form
- Telegram bot commands for bookings, promotions, hours and contact details
- Telegram booking notifications sent to a private admin chat or group
- Mobile navigation and floating booking buttons
- Contact, social media and A3 Finance links
- SEO metadata, sitemap, robots.txt and web app manifest
- Custom 404 page and basic security headers
- No Supabase or database dependency

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create the local environment file:

```bash
cp .env.example .env.local
```

Windows Command Prompt:

```cmd
copy .env.example .env.local
```

3. Replace every placeholder in `.env.local`.

4. Run the website:

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Vercel environment variables

```env
NEXT_PUBLIC_SITE_URL=https://sakura.a3group.sg
NEXT_PUBLIC_BOOKING_WHATSAPP=65XXXXXXXX
NEXT_PUBLIC_VENUE_ADDRESS=Your complete venue address
NEXT_PUBLIC_TIKTOK_URL=https://www.tiktok.com/@your-account
NEXT_PUBLIC_FACEBOOK_URL=https://www.facebook.com/your-page
NEXT_PUBLIC_INSTAGRAM_URL=https://www.instagram.com/your-account
NEXT_PUBLIC_A3_FINANCE_URL=https://finance.a3group.sg
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=YourSakuraBot
TELEGRAM_BOT_TOKEN=Your_BotFather_token
TELEGRAM_ADMIN_CHAT_ID=Your_private_or_group_chat_id
TELEGRAM_WEBHOOK_SECRET=Your_long_random_secret
```

Use only digits for `NEXT_PUBLIC_BOOKING_WHATSAPP`, including country code. Example format: `6591234567`.

The Telegram token, admin chat ID and webhook secret are server-only values. Never add `NEXT_PUBLIC_` to those three names and never commit the real values to GitHub.

## Telegram bot setup

1. Open Telegram and create a bot through `@BotFather` using `/newbot`.
2. Copy the bot token into `TELEGRAM_BOT_TOKEN`.
3. Set the bot username without `@` in `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
4. Create a webhook secret containing only letters, numbers, underscores or hyphens. It must be at least 16 characters.
5. Add `NEXT_PUBLIC_SITE_URL`, the bot username, bot token and webhook secret to Vercel, then deploy the website.
6. Put the same four values in `.env.local` and connect the production webhook:

```bash
npm run telegram:setup
```

7. Open the new bot in Telegram, tap **Start**, and send `/chatid`.
8. Copy the returned number into `TELEGRAM_ADMIN_CHAT_ID` in Vercel. For a group, add the bot to the group and send `/chatid` inside that group; group IDs are usually negative.
9. Redeploy after adding the admin chat ID.

The setup script registers these commands:

- `/start`
- `/book`
- `/promotions`
- `/hours`
- `/contact`
- `/chatid`

The webhook endpoint is:

```text
https://YOUR_DOMAIN/api/telegram/webhook
```

The website booking endpoint is:

```text
https://YOUR_DOMAIN/api/telegram/booking
```

## Checks

```bash
npm run typecheck
npm run build
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Import that repository into Vercel.
3. Add all environment variables shown above.
4. Deploy.
5. Add `sakura.a3group.sg` under **Project Settings → Domains**.
6. Run `npm run telegram:setup` after the production domain is live.

For Cloudflare DNS, create a CNAME record:

- **Name:** `sakura`
- **Target:** `cname.vercel-dns.com`
- **Proxy status:** DNS only during initial verification

Attach only `sakura.a3group.sg` to this Vercel project. Do not attach `a3group.sg`, `www.a3group.sg`, `finance.a3group.sg`, `limousine.a3group.sg`, or a wildcard domain.
