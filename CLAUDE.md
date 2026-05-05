# Allvision AI

Allvision AI is a multimodal AI workspace with six top-level tabs: Text, Audio,
Video, Photo, Studio, and Ready-made Solutions. The product is centered on a
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
- ✅ R2: Backend domain cleanup. Remove old domain-specific backend code and add
  the Generation service foundation.
- R3: Auth/account alignment. Finish email verification/reset-password flows and
  account semantics on top of `password`, `coinBalance`, and coin transactions.
- R4: MockAIProvider foundation. Route generation jobs through the provider
  factory and mock provider.
- R5: Upload/static pipeline. Add new-domain upload methods for Avatar, Voice,
  Scene, and Generation inputs.
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
- R13: Worker/queue rewrite. Expand generation job orchestration and operational
  worker behavior.
- R14: Coins, regeneration, and watermark removal. Finalize billing rules and
  transactional balance updates.
- R15: Real provider integration. Add `fal`, `openai`, and `elevenlabs`
  providers behind the factory, keeping mock as default fallback.

## R0+R1 Status

- Annotated tag `v0.1-pre-rework` was created and pushed to origin.
- Old Prisma migrations were removed.
- New init migration:
  `packages/database/prisma/migrations/20260505133300_init_allvision_ai/`.
- New schema models: `User`, `CoinTransaction`, `Avatar`, `Voice`, `Scene`,
  `ChatThread`, `Generation`, `PresetRecipe`.
- Seed now upserts admin/test users, 6 system PRESET voices, and 10
  `PresetRecipe` placeholders.
- `packages/shared/src/constants/coins.ts` defines welcome bonus and starting
  coin prices.
- `apps/api/demo-assets/README.md` records the current demo-assets inventory and
  how MockAIProvider should reuse it.

## R2 Status

R2 removed the active Allvision Studio v1 backend domain code and returned
`@allvision/api` and `@allvision/worker` to green builds.

Deleted API routes:

- `apps/api/src/routes/projects.ts`
- `apps/api/src/routes/characters.ts`
- `apps/api/src/routes/scenes.ts`
- `apps/api/src/routes/episodes.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/admin/trends.ts`
- `apps/api/src/routes/admin/scenario-templates.ts`

Deleted API tests:

- `account.test.ts`
- `admin-scenario-templates.test.ts`
- `admin-trends.test.ts`
- `auth.test.ts`
- `characters.test.ts`
- `episodes.test.ts`
- `file-service.test.ts`
- `mock-ai-provider.test.ts`
- `payments.test.ts`
- `projects.test.ts`
- `queue.test.ts`
- `scenes.test.ts`

Deleted worker processors:

- `photo-restore.ts`
- `photo-animate.ts`
- `trend.ts`
- `fairy-tale-script.ts`
- `episode.ts`
- `character-nsfw.ts`

Deleted shared schemas/constants:

- `projects.ts`
- `characters.ts`
- `scenes.ts`
- `episodes.ts`
- `admin-trends.ts`
- `admin-scenario-templates.ts`
- `constants/pricing.ts`

Preserved infrastructure:

- `middleware/auth.ts`: JWT guard and optional auth.
- `middleware/require-admin.ts`: admin role guard.
- `middleware/rate-limit.ts`: auth/password reset/general generation limiters.
- `middleware/upload.ts`: generic single/multiple photo and single video multer
  handlers.
- `services/file-service.ts`: image validation, generic storage upload helper,
  delete helper.
- `services/auth-service.ts`: register/login/refresh/me/logout on the new
  `User.password` and `coinBalance` fields; reset flow is stubbed for R3.
- `services/account-service.ts`: dashboard/profile/password/delete account on
  `Generation` and `CoinTransaction`.
- `services/payment-service.ts`: coin top-up provider/webhook shape preserved
  with public `coins` naming; persistence will be revisited when billing is
  finalized.
- `services/payment-provider.ts`, provider factories, storage providers, request
  logging, and error handling remain reusable.

Generation foundation:

- `apps/api/src/services/generation-service.ts` defines `GenerationService`.
- Stubbed methods: `createGeneration`, `getGeneration`, `listGenerations`,
  `deleteGeneration`, `regenerate`.
- Method bodies intentionally throw `NOT_IMPLEMENTED — R6+`.
- `apps/api/src/routes/generations.ts` registers authenticated 501 endpoints for
  create/list/get/status/regenerate/delete.
- `apps/api/src/queues/index.ts` now exposes `QUEUE_NAMES.GENERATION`,
  `QUEUE_NAMES.NSFW_CHECK`, `addGenerationJob`, and `addNsfwCheckJob`.
- `apps/worker/src/index.ts` now starts one `generation` worker with concurrency
  1; the processor throws `NOT_IMPLEMENTED_R4`.
- `apps/worker/src/processors/base.ts` now only contains Generation helpers:
  `updateGenerationProgress`, `markGenerationCompleted`,
  `markGenerationFailed`.

Verification:

- `npm run build -w @allvision/shared`: green.
- `npm run build -w @allvision/database`: green.
- `npm run build -w @allvision/api`: green.
- `npm run build -w @allvision/worker`: green.
- `npm run build -w @allvision/web`: expected red; web still imports old shared
  types and will be migrated in R12.
- API dev server starts and `/api/health` returns 200.
- Worker dev process stays alive for 30 seconds idle; Redis is unavailable in
  the current environment, so it logs connection errors but does not crash.

## Current Constraints

- Do not reintroduce Studio v1 domain routes/processors/schemas.
- `apps/web` still contains old surfaces and is intentionally left for R12.
- `apps/api/demo-assets/` must not be wiped. Binary demo files remain ignored;
  recreate them with `npm run demo:download`.
- Generation business logic, MockAIProvider orchestration, upload methods for
  new domain entities, and new tests are scheduled for R4-R15.
