# Allvision Studio — AI-фабрика цифровых подарков

## Что это

Платформа автоматического и заказного создания цифровых подарков с использованием AI: оживление старых фото, лицо в трендовом меме, ребёнок-герой мультика, юбилейные видео-открытки, авторские сказки.

Юзер не думает в терминах «AI-генерация» или «промпт». Юзер выбирает повод и формат («оживить свадебное фото бабушки»), получает готовый продукт за минуты (для готовых решений) или за несколько дней (для премиум-заказов).

## Категории услуг

1. **Ностальгия** — оживление старых фото, восстановление, эстетика 2017, лента воспоминаний.
2. **Тренды и мемы** — трендовые танцы, лицо в меме, лицо в киносцене, аниме-стилизация.
3. **Дети-герои** — ребёнок в мульт-стиле (свои стилизованные миры, не Disney), персонализированные сказки, развивающее видео с именем.
4. **Особые поводы** — свадьба, юбилей, 8 марта, 23 февраля, корпоративы.

В каждой категории два уровня:
- **Готовое решение** — автоматический pipeline, фиксированная цена, 2-5 минут от заявки до результата.
- **На заказ** — форма с брифом, ручная согласовка через админа, 3-5 дней, цена обсуждается.

## Качество AI: tier'ы

В системе **два уровня качества** на каждой услуге, юзер выбирает на странице услуги:

- **Standard** — высокое качество (Kling 2.6 / Veo 3.1 для видео, Nano Banana 2 для изображений, F5-TTS для голоса, Claude Haiku 4.5 для текста). Цена базовая.
- **Pro** — топ-качество (Seedance 2.0 для видео, GPT Image 2 для изображений, ElevenLabs для голоса, Claude 4 для текста). Цена 2-3× выше.

Это позиционирование «хорошо vs топ», не «средне vs хорошо». Standard — достаточно качественно для подарка. Pro — wow-эффект.

## Архитектура

### Технический стек

- Монорепо: `apps/api` (Express+Prisma), `apps/worker` (BullMQ), `apps/web` (Next.js+RTK Query), `packages/database` (Prisma schema), `packages/shared` (типы и константы).
- БД: PostgreSQL.
- Очереди: Redis + BullMQ.
- Storage: локальный для dev (`fileService` через LocalFileStorage), S3-compatible для prod (через ту же абстракцию).
- Платежи: ЮKassa для топапа коинов в РФ. AI-провайдеры (PiAPI / AIMLAPI) — оплачиваются разработчиком отдельно через крипту/зарубежную карту.
- Mock-first: реальные AI-провайдеры подключаются после готового продуктового каркаса.

### Studio assets

В системе три типа персональных ассетов юзера:

- **Avatar** — реалистичный аватар (человек, питомец, объект). Создаётся через 4-шаговый мастер с consent + NSFW-проверкой. Первый аватар бесплатный, второй+ — за коины. Используется в pipelines, требующих лицо.
- **Scene** — сцена/локация (для будущих сложных pipelines, опционально).
- **Voice** — голос для TTS (опционально, для сказок и видео-открыток с озвучкой).

Ассеты создаются один раз и переиспользуются в множестве услуг.

### Реестр блоков (программная часть pipelines)

Блок — это атомарная AI-операция, описанная в коде. Каждый блок:

- `inputSchema` (zod) — что блок принимает.
- `outputSchema` — что возвращает (URL файла + metadata).
- `paramsSchema` — какие параметры админ может настроить.
- `supportedModels` — список моделей с метаданными (название, tier hint, estimatedCost).
- `executor` — функция `(params, ctx) → output`, с прогрессом через `ctx.reportProgress(percent)`.

Стартовый набор блоков (P1, минимум под первые 5 услуг):

- `image-restore` — восстановление старого фото.
- `image-upscale` — увеличение разрешения.
- `image-to-video` — анимация фото в видео.
- `face-swap-video` — свап лица в готовом видео.
- `video-compose` — финальная сборка через ffmpeg (watermark, музыка, титры).
- `text-to-video` — генерация видео по промпту.

Остальные блоки (`text-to-image`, `text-to-speech`, `voice-clone`, `audio-mix`, `image-edit`, `image-stylize`, `add-subtitles` и т.д.) добавляются отдельными этапами, когда появляются услуги, которым они нужны.

Реестр блоков (`apps/worker/src/blocks/registry.ts`) — статичный TypeScript-объект. Реестр автоматически экспортируется в API через эндпоинт `GET /api/admin/blocks`, чтобы админка показывала список доступных блоков и их параметров.

### Pipeline-подход (готовые решения)

Pipeline услуги — это последовательность шагов (steps), полностью описанная в БД. Шаги собираются админом в `/admin/services` через табличный конструктор: список шагов сверху вниз, drag-handle для перестановки, у каждого шага раскрывающаяся форма параметров.

Pipeline хранится в `Service.pipelineConfig: Json` как массив:

```json
[
  { "id": "step_1", "blockSlug": "image-restore", "params": { "model": "gfpgan" } },
  { "id": "step_2", "blockSlug": "image-to-video", "params": { "model": "{{tier_model}}", "duration": 5, "prompt": "..." } },
  { "id": "step_3", "blockSlug": "video-compose", "params": { "watermark": true } }
]
```

Шаги могут ссылаться на результаты предыдущих через плейсхолдеры (`{{step_1.output}}`), на ввод юзера (`{{user.photo}}`, `{{user.name}}`), на выбранный tier (`{{tier_model}}` подставит модель Standard или Pro).

Универсальный исполнитель в worker (`pipeline-runner.ts`) принимает массив шагов и состояние, прогоняет последовательно с прогрессом по общему процессу.

В первой версии — только линейные pipelines, без if/else. Ветвления добавляются отдельным этапом, когда понадобятся.

### Admin services (готовые решения как продуктовые единицы)

Услуга в БД (`Service`, расширение существующей модели `Trend`) хранит:

- `slug` — URL-идентификатор.
- `title`, `shortDesc`, `description` — тексты для витрины.
- `category` — Ностальгия / Тренды / Дети / Особые поводы.
- `pipelineConfig: Json` — массив шагов pipeline (см. выше).
- `userInputForm: Json` — описание формы для юзера на странице услуги (поля, типы, валидация).
- `priceCoinsStandard`, `priceCoinsPro` — цены за два tier'а.
- `previewImage`, `previewVideo` — для каталога и страницы услуги.
- `isActive`, `isFeatured`, `sortOrder`.

Админ в `/admin/services` создаёт и редактирует услуги полностью через UI:

- Конструктор pipeline (табличный, с drag-handle).
- Редактор формы юзера.
- Калькулятор себестоимости (сумма estimatedCost всех шагов).
- Тестовый прогон с моковыми данными.
- Управление превью и метаданными.

Программист в код добавляет новые блоки в реестр, когда появляется потребность в новой AI-операции.

### Admin custom orders (заказы — полностью data-driven)

Услуги «на заказ» **полностью настраиваются через админку**, никакого кода. CRUD включает:

- Типы заказов (Custom Tale, Custom Cartoon, Custom Wedding и т.д.) — создаются админом.
- Формы брифа — поля формы прописываются в админке (тип поля, label, required, hints, варианты для select).
- Прайс-вилки и описания.
- Шаблоны email-уведомлений на каждый статус (NEW → QUOTED → PAID → IN_PROGRESS → DELIVERED → CANCELLED) — редактируются текстом в админке.
- Шаблоны типовых вопросов админа в первом ответе на заявку.

Юзер на витрине видит карточки заказов с описанием и формой. Админ ведёт заявки через `/admin/orders` (Kanban или таблица).

### IP-стратегия

Услуги для детей и тренды используют **свои стилизованные миры**, не реальные IP. «Цветной Грузовичок в долине радуги» вместо Синего Трактора. «Лесная девочка и большой друг» вместо Маши и Медведя. Стиль анимации копируется (плоская 2D, яркие цвета), персонажи и имена — оригинальные. Это позволяет масштабироваться без юр-рисков.

Тренды-мемы используют публичные форматы (танцы, киноэпизоды старше 70 лет, общеизвестные шаблоны) — но не дипфейки публичных людей.

## Финансовая модель

- Юзер платит **коинами** (1 коин = ориентировочно 1 ₽).
- Топап через ЮKassa в рублях (РФ-юр).
- Стартовый бонус новому юзеру — 25 коинов (хватает на ознакомление, не на полноценный подарок).
- AI-провайдеры (PiAPI / AIMLAPI) оплачиваются разработчиком — это операционный расход, не «прогон денег клиентов».
- Маржа: на готовых решениях 80-90% (себестоимость ~10-50 ₽, цена 200-500 ₽). На заказах 70-80% (себестоимость 200-400 ₽, цена 1500-7000 ₽).
- Refund при FAILED — автоматический возврат коинов через `CoinTransaction(reason='refund')`.
- Регенерация — 50% от исходной цены.
- Снятие watermark — фиксированная цена (30-60 коинов).

## Состояние кода

База: Studio v1 (зафиксирована тегом `v0.1-pre-rework`, 137 passing tests). Содержит:

- Auth (регистрация, логин, password reset).
- Кабинет, биллинг, профиль.
- Топап через mock-ЮKassa с idempotent webhook.
- Услуги 1-3 (улучшение фото / анимация / тренды) — рабочий e2e flow на mock'ах.
- V3 модели (Avatar / Scene / Episode) с CRUD и mock-pipelines.
- Mock email infrastructure (логирование вместо отправки).

Текущий продукт **переупаковывается** поверх этой базы под gift factory позиционирование без переписывания нижних слоёв. Конкретные шаги — в плане ниже.

История развития хранится только в git tags:
- `v0.1-pre-rework` — Studio v1 закрытая (137 tests).
- `pre-rollback-R1-20260505` — Allvision AI R0+R1 состояние (откатано).

## План перепрофилирования

### Этап P1 ✅ — БД, реестр блоков, pipeline-runner (бэкенд без UI)

- Расширение модели Trend → Service с полями pipelineConfig, userInputForm, priceCoinsStandard/Pro, category.
- Категории как enum (Ностальгия / Тренды / Дети / Особые поводы).
- Реестр блоков в коде (6 стартовых блоков, mock-implementations).
- Универсальный pipeline-runner в worker.
- API endpoints: список блоков для админки, тестовый прогон pipeline.
- Миграция БД, seed обновлённый.

### Этап P2 ✅ — Админка услуг с табличным конструктором (UI)

- `/admin/services` CRUD: список, создание, редактирование.
- Табличный конструктор pipeline (список шагов, drag-handle, форма параметров для каждого).
- Конструктор формы юзера (`UserInputForm`).
- Тестовый прогон в админке с моковыми данными и просмотром логов каждого шага.
- Калькулятор себестоимости.
- Управление превью (image/video) и метаданными.
- Toggle isActive/isFeatured, sortOrder.

### Этап P3 — Frontend перепаковка

- Главная страница в новом позиционировании (4 категории, hero с примерами подарков).
- Страница услуги с двумя tier-кнопками (Standard / Pro).
- Каталог услуг по категориям.
- Обновление dashboard юзера под новую витрину.

### Этап P4 — Расширение админки готовых решений

- Полировка data-driven конструктора: версии pipeline, шаблоны услуг, расширенные проверки плейсхолдеров.
- Drag-and-drop sort внутри категории, bulk-actions, массовое включение/скрытие.
- Замена ассетов (preview), live-preview на публичной странице услуги после P3.

### Этап P5 — Полная админка заказов (data-driven)

- `/admin/order-types` — CRUD типов заказов: создание, поля брифа, прайс-вилки.
- `/admin/email-templates` — редактирование шаблонов email на каждый статус.
- `/admin/orders` — kanban/таблица заявок, переключение статусов, отправка ответа.
- Юзерский flow заявки.

### Этап P6 — AI-провайдеры

- PiAPI или AIMLAPI (выбор после оплаты крипты).
- Реализация `AIProvider` через фактический API.
- Постепенное переключение pipelines с mock на real.

### Этап P7 — Юр-документы и запуск

- Оферта, ПДн, согласие на использование изображения.
- Email-верификация с реальным SMTP.
- Базовое SEO, аналитика.
- Лендинги для трафика по категориям.

## Этап P1 ✅

Миграция `20260506093024_add_data_driven_services`:

- `ServiceCategory` расширен gift-factory категориями: `NOSTALGIA`, `TRENDS_MEMES`, `KIDS_HEROES`, `SPECIAL_OCCASIONS`.
- Существующая модель `Service` расширена полями `pipelineConfig`, `userInputForm`, `priceCoinsStandard`, `priceCoinsPro`, `previewImage`, `previewVideo`, `isFeatured`.
- Существующая модель `Project` используется как generation-equivalent для P1 и расширена полями `pipelineSnapshot`, `selectedTier`, `userInputs`, `stepProgress`.

Реестр блоков:

- Добавлен shared-каталог блоков в `packages/shared/src/blocks` для API/admin UI.
- Исполняемый registry в `apps/worker/src/blocks/registry.ts`.
- 6 стартовых mock-блоков: `image-restore`, `image-upscale`, `image-to-video`, `face-swap-video`, `video-compose`, `text-to-video`.
- API не импортирует worker напрямую: сериализуемая metadata живёт в shared, executors — в worker.

Pipeline-runner:

- `apps/worker/src/pipeline-runner.ts` исполняет линейный `pipelineConfig` сверху вниз.
- Поддержаны плейсхолдеры `{{user.field}}`, `{{step_1.output}}`, `{{step_1.url}}` и tier-select объект `{ standard, pro }`.
- Прогресс шага агрегируется в общий `Project.progress`, состояние шагов сохраняется в `Project.stepProgress`.
- При ошибке runner переводит `Project` в `FAILED` через существующий refund-паттерн `markProjectFailed`.

API:

- `GET /api/admin/blocks` возвращает каталог доступных блоков для будущей админки.
- `POST /api/admin/services/:id/test-run` создаёт zero-cost `Project` с `pipelineSnapshot` и ставит job в новую очередь `service-pipeline`.

Тесты и проверки:

- Добавлено 9 тестов: 2 API (`admin-blocks`) и 7 worker (`blocks-registry`, `pipeline-runner`).
- API: `139 passed`.
- Worker: `7 passed`.
- Всего по API+worker: 146 tests.
- Все builds зелёные, включая root `npm run build`.

Нестандартные решения и долги:

- Отдельную модель `Generation` в P1 не вводили: в текущей Studio v1 уже есть `Project` со статусом, прогрессом, результатами и refund-логикой. Это снижает риск и сохраняет старые 137 тестов.
- Старые очереди `photo-restore`, `photo-animate`, `trend`, `episode` оставлены для обратной совместимости. Новый data-driven flow идёт через `service-pipeline`.
- Seed пока не создаёт реальные gift-factory услуги; это остаётся для P3/P4 вместе с витриной и админкой.

## Этап P2 ✅

Миграция `20260506100420_admin_services_project_service_set_null`:

- `Project.serviceId` сделан nullable с `onDelete: SetNull`, чтобы завершённые проекты выживали при удалении услуги.
- Активные проекты в `PENDING/PROCESSING` всё равно блокируют delete через API.

Backend:

- Добавлен полный CRUD `/api/admin/services`: list/get/create/update/delete/reorder/duplicate.
- `POST/PATCH` принимают multipart `previewImage` и `previewVideo` плюс JSON-поле `data`.
- Добавлены `uploadServiceAssets` и `fileService.uploadServicePreview(...)` для `service-assets/images` и `service-assets/videos`.
- Shared-схема `packages/shared/src/schemas/admin-services.ts` валидирует `pipelineConfig`, `userInputForm`, уникальные step/field id, существование blockSlug и ссылки плейсхолдеров только на user fields или предыдущие шаги.
- PATCH умеет безопасно переключать legacy-сервисы без `pipelineConfig`, чтобы старая Studio v1 база не ломала новый список услуг.

Admin UI:

- Добавлены страницы `/admin/services`, `/admin/services/new`, `/admin/services/[id]`.
- В списке есть фильтры category/status/featured/search, preview thumbnail, цены Standard/Pro, быстрые toggle isActive/isFeatured, reorder, test-run, duplicate и delete.
- Форма услуги содержит секции: основное, превью, цены, pipeline, форма юзера, тестовый прогон.
- Pipeline-конструктор использует `@dnd-kit/core` + `@dnd-kit/sortable`: drag-handle, collapse/expand, динамический рендер параметров по JSON schema блока, model tier-select `{ standard, pro }`.
- UserInputForm builder поддерживает `text`, `textarea`, `photo`, `select`, `avatar`, обязательный единственный `tier` field и live preview.
- Test-run панель запускает `POST /api/admin/services/:id/test-run` и поллит существующий `/api/projects/:id/status`, показывая общий прогресс, `stepProgress`, output и финальный результат.

Тесты и проверки:

- Добавлено 19 API-тестов `admin-services`: auth/admin, validation ошибок pipeline/form, slug collision, create/list/get, filters, update preview cleanup, legacy PATCH, delete blocking/set-null, reorder, duplicate collision.
- API: `158 passed`.
- Worker: `7 passed`.
- Все builds зелёные, включая root `npm run build`.

Долги:

- Frontend component tests не добавлялись: в проекте нет готовой frontend test infra под builder, новую инфраструктуру в P2 не поднимали.
- User-facing витрина и реальный сервисный flow остаются для P3.

## Конвенции разработки

- Промпты на этапы пишет ассистент (Claude в чате), исполняет Claude Code.
- После каждого этапа — обновление CLAUDE.md секцией с тем что сделано, нестандартными решениями, итоговыми тестами.
- После каждого этапа — git commit и push.
- Pre-flight перед изменениями обязателен (проверка существующего состояния).
- Mock-first: новые AI-операции сначала через MockAIProvider, потом реальные.

## Известные нюансы

- Windows EPERM на `prisma generate` если запущен dev-сервер — останавливать dev перед БД-операциями.
- `next build` иногда падает с `3221225477` на Windows static worker — повторный запуск проходит, `experimental.cpus=1` в next.config.mjs минимизирует.
- Demo-assets в `apps/api/demo-assets/` не коммитятся, восстанавливаются через `npm run demo:download`.
