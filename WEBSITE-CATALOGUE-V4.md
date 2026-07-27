# Website Catalogue v4.0

Finance and public websites remain separate projects. Finance only manages catalogue data and exposes it through the public API.

## Permissions
- Super Admin: Food, Nightclub and Limousine catalogues.
- Company Admin assigned to Food & Beverage: Food catalogue only.
- Company Admin assigned to Nightlife / Entertainment: Nightclub catalogue only.
- Company Admin assigned to Limousine Company: Limousine catalogue only.

## Features
- Add, edit, save and delete catalogue items.
- Upload, replace and remove pictures.
- Remove all visible catalogue items and picture references.
- Food: add/edit/delete stalls and menu items.
- Nightclub: Tower, Beer, Brandy, Whisky, Vodka, Gin, Rum, Tequila, Wine, Champagne, Cocktails, Promotions and Other.
- Limousine: Vehicles, airport transfers, point-to-point, hourly services, weddings, packages and Other.

## Public API
- `/api/public/website-catalogue?site=food`
- `/api/public/website-catalogue?site=nightclub`
- `/api/public/website-catalogue?site=limousine`
- Optional company filter: `&company_id=COM-001`

This release uses new storage keys and therefore starts the catalogue clean. Existing v3 menu records and pictures are not shown or published.
