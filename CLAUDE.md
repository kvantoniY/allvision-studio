# Allvision AI

Allvision AI is a multimodal AI workspace with six top-level tabs: Text, Audio,
Video, Photo, Studio, and Ready-made Solutions. The product is now centered on a
single `Generation` core table with `kind + mode` for text, audio, image, and
video outputs. The rework is mock-first: real providers are introduced later
behind an AIProvider factory, while existing demo-assets are reused as local
placeholders.

## Architecture Decisions

- Six top-level tabs: Text, Audio, Video, Photo, Studio, Ready-made Solutions.
- One generation core: `Generation.kind` identifies TEXT/AUDIO/IMAGE/VIDEO,
  while `Generation.mode` identifies the concrete workflow.
- Studio assets are `Avatar`, `Voice`, and `Scene`.
- Coins are the billing unit. New users start with `coinBalance = 25`.
- First avatar and first voice slot are tracked on `User` via
  `freeAvatarUsed` and `freeVoiceUsed`.
- `ChatThread` belongs only to TEXT generations; non-text generations keep
  `threadId = null`.
- `Generation.parentGenerationId` is a plain string for regeneration ancestry,
  intentionally without an FK.
- Mock-first implementation. Real `fal`, `openai`, and `elevenlabs` providers
  are added through an AIProvider factory in R15+.
- `apps/api/demo-assets/` is preserved and reused by MockAIProvider via
  `/static/...` URLs.

## Pre-Rework History

Before `v0.1-pre-rework`, the product was Allvision Studio v1: services 1-3,
the V3 expansion with characters/scenes/episodes, custom orders, and the family
video workflow. The V3 close point had 137 passing tests. It is preserved by the
annotated git tag `v0.1-pre-rework` for rollback.

Old migrations removed during R1:

- `20260424114350_init`
- `20260424115752_add_password_reset_fields`
- `20260424162000_add_hybrid_processing_type`
- `20260425163444_add_user_soft_delete`
- `20260427115349_trend_price_tokens_optional_and_project_trend_set_null`
- `20260427120157_fix_trend_price_tokens_optional`
- `20260428124535_add_studio_characters_scenes_episodes_templates`
- `20260428140107_explicit_episode_set_null_v3`

Historical note: stages 1.1-1.7 belong to Allvision Studio v1 and should be used
only as rollback context through the tag above.

## Rework Plan R0-R15

- ✅ R0: Snapshot safety net. Create and push `v0.1-pre-rework`.
- ✅ R1: Wipe old DB migrations/data, introduce the clean Allvision AI schema,
  seed users/voices/presets, and add shared coin/generation primitives.
- R2: Backend domain cleanup. Remove old Service/Trend/Project/Order route
  assumptions and introduce the Generation service foundation.
- R3: Auth/account alignment. Move account surfaces from tokens/passwordHash-era
  fields to `password`, `coinBalance`, and coin transactions.
- R4: MockAIProvider foundation. Create AIProvider contracts/factory and route
  all generation flows through mock provider responses.
- R5: Upload/static pipeline. Reuse multer/fileService/static assets for new
  multimodal inputs without changing provider logic.
- R6: Text tab. Implement chat threads, text generations, history, and retry.
- R7: Audio tab. Implement TTS, preset voices, cloned/uploaded voice lifecycle.
- R8: Photo tab. Implement text-to-image, image edit, restore, and related
  image workflows on `Generation`.
- R9: Video tab. Implement animate, image-to-video, text-to-video, face-swap,
  progress and mock video outputs.
- R10: Studio tab. Implement Avatar, Voice, and Scene CRUD and attachment flows.
- R11: Ready-made Solutions. Implement `PresetRecipe` catalog and preset launch.
- R12: Frontend navigation and RTK migration. Replace old app/store surfaces
  with the six-tab Allvision AI product structure.
- R13: Worker/queue rewrite. Move processors from legacy project/episode jobs to
  generation jobs.
- R14: Coins, regeneration, and watermark removal. Finalize billing rules and
  transactional balance updates.
- R15: Real provider integration. Add `fal`, `openai`, and `elevenlabs`
  providers behind the factory, keeping mock as default fallback.

## R0+R1 Status

R0 is complete:

- Working tree was cleaned before the tag.
- Annotated tag `v0.1-pre-rework` was created and pushed to origin.
- Last pre-rework commits were recorded in the implementation report.

R1 repository changes are complete:

- Old Prisma migrations were removed.
- New init migration:
  `packages/database/prisma/migrations/20260505133300_init_allvision_ai/`.
- New schema models: `User`, `CoinTransaction`, `Avatar`, `Voice`, `Scene`,
  `ChatThread`, `Generation`, `PresetRecipe`.
- New schema enums: `Role`, `AvatarType`, `AvatarStatus`, `VoiceSourceType`,
  `VoiceStatus`, `GenerationKind`, `GenerationStatus`, `PresetCategory`.
- Seed now upserts:
  - admin `admin@allvision.ai / admin123`, role ADMIN, balance 1000;
  - test user `user@allvision.ai / user123`, role USER, balance 25;
  - 6 system PRESET voices;
  - 10 `PresetRecipe` placeholders.
- `packages/shared/src/constants/coins.ts` defines welcome bonus and starting
  coin prices.
- `packages/shared/src/types/generation.ts` re-exports new Prisma enums/types
  and adds small helpers for generation kind/status/mode handling.
- `apps/api/demo-assets/README.md` records the current demo-assets inventory and
  how MockAIProvider should reuse it.

## Current Constraints

- Do not delete old API routes, worker processors, web app pages, or RTK slices
  outside the planned R2-R12 cleanup stages.
- `apps/api/demo-assets/` must not be wiped. Binary demo files remain ignored;
  recreate them with `npm run demo:download`.
- Tests are expected to fail until legacy routes/processors are migrated.
- API build is expected to fail after R1 because old code still imports removed
  Prisma models such as Service, Trend, Project, Character, Episode, and Order.
