# Demo Assets

This directory stores local placeholder assets for `MockAIProvider`.
Binary demo files are intentionally ignored by git; run `npm run demo:download`
to recreate them when needed.

## Current Inventory

- `fairy-tales/`
  - `.gitkeep`
  - `template-courage.json`
  - `template-friendship.json`
  - `template-sharing.json`
  - Committed JSON templates for text/fairy-tale mock flows.
- `photo-restore/`
  - `.gitkeep`
  - Runtime target for generated/downloaded `restore-*.jpg` placeholders.
- `photo-animate/`
  - `.gitkeep`
  - Runtime target for generated/downloaded `animate-*.mp4` placeholders.
- `trends/`
  - `.gitkeep`
  - Runtime target for generated/downloaded `trend-*.mp4` placeholders.

## Recreated By Script

`apps/api/scripts/download-demo-assets.ts` currently knows how to recreate:

- `photo-restore/restore-1.jpg` ... `restore-10.jpg`
- `photo-animate/animate-1.mp4` ... `animate-6.mp4`
- `trends/trend-1.mp4` ... `trend-8.mp4`
- fallback `episodes/*` and `templates/*` assets derived from the photo/video pools

Future Allvision AI mock providers should reuse these files through `/static/...`
URLs and fall back to `/static/placeholders/preset-default.jpg` when a local
asset is absent.
