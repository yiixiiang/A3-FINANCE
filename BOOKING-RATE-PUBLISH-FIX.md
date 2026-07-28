# Booking detail and rate publishing fix

## Booking Management
The Open booking panel now reads legacy and current field names for pickup and destination addresses, including:
- pickup, pickupAddress, pickup_address, pickupLocation, pickup_location
- destination, destinationAddress, destination_address
- dropoff, dropoffAddress, dropoff_address, dropoffLocation, dropoff_location

The journey section also displays additional stops and pickup instructions when present.

## Rate Management
Under Rate Management > Vehicle Rate:
- **Load & publish rates** replaces the saved public matrix with the included starter matrix and publishes it.
- **Save draft** saves without changing the public website.
- **Publish to Limousine Website** publishes the currently edited matrix.

Under Rate Management > Additional Charges, the same draft/publish workflow applies.

The public rate API now selects the latest saved cloud value for each pricing key, rather than assuming the first Supabase user owns the rates.
