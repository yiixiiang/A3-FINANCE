# Driver Onboarding v5.4

Public link: `https://finance.a3group.sg/driver-signup`

Required uploads:
- Singapore Driving Licence (with fictional example guide)
- Vocational Licence (PDVL)
- Vehicle Front (with example guide)
- PHV Decal (with example guide)

Optional uploads:
- Vehicle Back, Left, Right, Interior
- Insurance, Road Tax, Vehicle Log Card

Applications are saved to cloud storage key `a3-driver-applications-v1`. In Driver Management, approving an application automatically creates:
1. An active driver directory record.
2. A DRIVER user-access account linked to that driver ID.
3. A generated username and temporary password shown to the administrator.

Run Cloud Sync after approval to distribute the new driver record and account to other devices.
