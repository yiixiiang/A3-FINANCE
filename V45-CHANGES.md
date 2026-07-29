# Finance V45 — One-Shot Publish All

Limousine Management now has one primary **Publish All to Limousine Website** button.

It publishes in one action:

- Fleet and vehicle photos
- Unified vehicle names
- Vehicle rate matrix
- Additional charges

The action synchronizes vehicle names first, uploads all four storage records together when payload size allows, and performs one public API verification request. This is faster and prevents sections being published out of sequence.
