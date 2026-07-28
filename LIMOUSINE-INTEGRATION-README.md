# Limousine Finance Integration

This release makes Finance the source of truth for the public Limousine website.

## Finance modules
- Rate Management > Vehicle Rate
- Rate Management > Fleet & Photos
- Rate Management > Additional Charges

## Public endpoints
- GET `/api/public/rate-matrix`
- POST `/api/public/limousine`

## Deployment order
1. Deploy Finance first.
2. Open `/api/public/rate-matrix` and confirm JSON includes `vehicle_types`, `rate_cards`, and `additional_charges`.
3. Deploy Limousine.
4. Test the homepage, `/book`, and a test booking.

Vehicle photos should be below 1.5 MB each because they are stored through the existing cloud-storage system.
