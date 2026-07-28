# Driver Sign-Up V5.5

Implemented:
- Public `/driver-signup` route.
- Removed NRIC / FIN, date of birth and PHV company fields.
- Searchable vehicle model list sourced from Finance `a3-vehicle-model-map` cloud storage, with fallback mappings.
- Automatic read-only vehicle type after model selection.
- “Model not listed” manual entry path.
- Required uploads: Singapore Driving Licence, PDVL, Vehicle Front and PHV Decal.
- Optional vehicle and supporting document uploads.
- Payment and emergency-contact sections.
- Admin Driver Management application queue.
- Approve action creates a Driver record and Driver-role user account, then displays username and temporary password for manual sharing.
- No email activation dependency.

Verification:
- TypeScript typecheck passed.
