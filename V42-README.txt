A3 Finance V42 - Fleet / Pricing Complete Fix

- Fleet & Vehicle Photos is now the single public source for vehicle names.
- Automatically suppresses legacy vehicle aliases when the new naming set exists.
- Maps existing prices to renamed vehicle classes instead of adding S$0 duplicate columns.
- Removes exact duplicate fleet names from the public API.
- Faster publish: targeted keys use one request where possible and skip the extra diagnostics request.
- Limousine website includes defensive filtering against stale duplicate vehicle aliases.

Deploy both FINANCE and LIMOUSINE folders. Publish Fleet first, then Vehicle Rates once.
