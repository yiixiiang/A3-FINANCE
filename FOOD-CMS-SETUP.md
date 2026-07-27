# A3 Food CMS in Finance

Open **Admin → Website Food Catalogue**.

Each published item controls the public Food website:
- Stall and menu group
- English and Chinese names
- Description
- Price and currency
- Photo URL or uploaded photo
- Available / Sold out
- Display order

After saving changes, run Cloud Sync. The public endpoint is:
`https://finance.a3group.sg/api/public/website-catalogue?site=food`

For production, public image URLs are recommended. Direct uploads are limited to 1.5 MB because they are stored inside the synchronized catalogue record.
