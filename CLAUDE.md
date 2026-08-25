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

## Production

Prod-домен `https://allvision-pulse.ru` живёт на ВМ `158.160.209.107`: хостовый nginx терминирует SSL сертификатом Рег.ру и проксирует на docker nginx, который слушает только `127.0.0.1:80`. Studio деплоится capistrano-style в `/opt/allvision-studio`: `current` и `previous` указывают на релизы в `releases/{git-sha}`, а постоянные данные лежат в `shared/.env`, `shared/postgres_data`, `shared/uploads`, `shared/public-trends`. Prod default для P6.5 — `PROVIDER_MODE=mock`, `STORAGE_PUBLISHER=local`; реальный PiAPI включается операционно через env без изменений кода.

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

### PiAPI и реальные providers (P6)

В P6 реальные внешние вызовы разрешены только из data-driven очереди `service-pipeline`, которая создаётся платным запуском `POST /api/services/:slug/launch`.

Матрица блоков:

- `image-restore` — **mock до P6.5**. У PiAPI нет нормального old-photo restoration endpoint; `Qubico/image-toolkit` upscale/face_enhance не считается восстановлением старого фото. Нужен внешний провайдер, кандидат — Replicate GFPGAN или аналог.
- `image-upscale` — mock.
- `image-to-video` — PiAPI Kling: `kling-std` (`model: "kling"`, `mode: "std"`, ~$0.20 / 5 sec) и `kling-pro` (`mode: "pro"`, ~$0.33 / 5 sec).
- `face-swap-video` — PiAPI `Qubico/video-toolkit`, `task_type: "face-swap"`, ориентир $0.004/frame. В P6 tier'ы Standard/Pro используют одну модель `qubico-video-toolkit`.
- `video-compose` — локальный compose/pass-through финального видео, без внешнего AI-провайдера.
- `text-to-video` — mock.

Provider selection живёт в `apps/worker/src/providers/index.ts`:

- `NODE_ENV === "test"` → `StubAIProvider`, никаких сетевых вызовов.
- Admin `POST /api/admin/services/:id/test-run` ставит job с `mode: "test-run"` → worker использует MockAIProvider, PiAPI не вызывается.
- Mock-only блоки (`image-restore`, `image-upscale`, `text-to-video`) используют MockAIProvider.
- Real блоки (`image-to-video`, `face-swap-video`) используют PiAPIProvider.

Worker стартует fail-fast: для production нужны `PIAPI_API_KEY` и R2-настройки. Тихого fallback на mock нет, чтобы юзер не платил коины за плейсхолдер.

PiAPI принимает публичные URL для входных изображений в Kling/video face-swap. Поэтому worker публикует локальные `/static/...` user-input файлы во временный Cloudflare R2 bucket (`R2_TEMP_PREFIX`, lifecycle cleanup ~24h), передаёт public URL в PiAPI, затем скачивает provider output обратно в LocalFileStorage по пути `outputs/{userId}/{projectId}/{stepId}/result.ext`.

Защита бюджета:

- `AIUsageLog` хранит provider/model/taskId/status/costUsd/duration/error по каждому PiAPI-вызову.
- Перед реальным вызовом считается spend provider=`piapi` за последние 24 часа; при достижении `PIAPI_DAILY_CAP_USD` job падает в `FAILED`, коины возвращаются, UI показывает безопасное сообщение про временную перегрузку.
- На старте и раз в час PiAPIProvider вызывает `/account/info`; если `equivalent_in_usd < PIAPI_BALANCE_MIN_USD`, новые PiAPI-задачи отклоняются.
- BullMQ worker для `service-pipeline` работает с `concurrency: 1`, чтобы дорогие job'ы не стартовали параллельно.

Чтобы добавить новый real-блок: добавить метод в worker `AIProvider`, реализацию в `PiAPIProvider`/Mock/Stub, mapping в provider selector, supportedModels с `estimatedCostCoins`/`estimatedCostUsd`, и тест без внешней сети.

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

## Этап P3a ✅

Seed пилотных услуг:

- Добавлены 4 активные gift-factory услуги через `packages/database/src/seed.ts`:
  - `revive-old-photo` — `NOSTALGIA`, featured, 200/450 коинов.
  - `face-in-trend` — `TRENDS_MEMES`, 250/500 коинов.
  - `kid-cartoon-hero` — `KIDS_HEROES`, featured, 350/700 коинов.
  - `anniversary-card` — `SPECIAL_OCCASIONS`, 300/650 коинов.
- Все услуги сидятся как `Service` с `pipelineConfig`, `userInputForm`, tier-field и snapshot-ready steps.
- Demo-assets локально могут быть пустыми после переустановки Windows, поэтому preview в seed использует fallback `picsum.photos`; рабочие mock-result assets восстанавливаются через `npm run demo:download`.
- Тестовый пользователь `user@allvision.studio / user123` сидится с балансом 25 коинов для проверки недостаточного баланса.

Backend:

- Добавлен публичный router `/api/services`.
- `GET /api/services` отдаёт только активные gift-factory услуги, поддерживает `category` и `featured`, не раскрывает `pipelineConfig`.
- `GET /api/services/:slug` отдаёт деталь услуги и `userInputForm`, но не внутренний pipeline.
- `POST /api/services/:slug/launch` под auth принимает multipart user inputs, валидирует форму, загружает photo-поля в `user-inputs/{userId}/{projectId}`, атомарно списывает `tokenBalance`, создаёт `Project` с `pipelineSnapshot`, `selectedTier`, `userInputs`, `stepProgress` и ставит job в `service-pipeline`.
- При ошибке постановки job проект переводится в `FAILED`, коины возвращаются через `TokenTransaction(reason='refund')`.
- Старый `/api/public/services` оставлен совместимым по типам, но новая витрина использует `/api/services`.

Frontend:

- Добавлен RTK Query slice `servicesApi`: `listServices`, `getService`, `launchService`.
- `/services` переписан под витрину цифровых подарков: hero, featured-блок и 4 категории.
- `/services/[slug]` рендерит preview, описание, tier-selector Standard/Pro, динамическую форму из `userInputForm`, баланс пользователя и запуск через FormData.
- Гость видит CTA входа, пользователь с недостаточным балансом — переход на `/pricing`.
- `/dashboard/projects/[id]` теперь имеет два режима: legacy Studio v1 и data-driven pipeline. Для новых проектов показывает исходные материалы, прогресс каждого шага из `stepProgress`, output шагов и финальный результат.
- В UI используется слово «коины», но нижний слой БД пока сохраняет историческое поле `tokenBalance`.

Тесты и проверки:

- Добавлено 12 API-тестов: `services-public` и `services-launch`.
- Обновлён P2 reorder-тест, чтобы он не зависел от seeded gift services в тех же категориях.
- API: `170 passed`.
- Worker: `7 passed`.
- Root `npm run build` зелёный.

## Этап P3b ✅

Позиционирование и стартовый бонус:

- Главная `/` переупакована под Allvision Studio как AI-фабрику цифровых подарков: hero теперь про выбор повода и формата, а не про AI-промпты.
- Стартовый бонус приведён к продуктовому контракту 25 коинов: `apps/api/src/services/auth-service.ts`, `apps/api/src/__tests__/auth.test.ts`, `.env.example`, локальный `.env` и UI регистрации.
- Для UI добавлен общий справочник gift-factory категорий в `apps/web/src/lib/gift-factory.ts`; нижний слой API/БД по-прежнему использует `tokenBalance`.

Лендинг:

- `apps/web/src/components/landing/HeroSection.tsx` переписан под подарочный flow: CTA `Посмотреть подарки` → `/services`, вторичный CTA `Создать первый бесплатно` → `/register`, текст про 25 коинов.
- Старый `ServicesGrid` заменён на 4 крупные категории: Ностальгия, Тренды и мемы, Дети-герои, Особые поводы. Карточки ведут на `/services?category=<enum>`.
- Под категориями добавлен блок featured-услуг через `useListServicesQuery({ featured: true })`, карточки ведут на `/services/[slug]`.
- `HowItWorks`, `ExamplesGallery`, `Testimonials`, `Pricing`, `FAQ`, `CTA` переписаны под gift-кейсы, Standard/Pro и коины.
- `apps/web/src/lib/public-content.ts`, `PricingCards`, `PricingPageContent` обновлены по текстам и терминологии «коины».

Каталог и дашборд:

- `/services` теперь читает `searchParams.category` на серверной странице и передаёт выбранную категорию в `ServicesCatalog`; каталог использует тот же справочник категорий.
- `/dashboard` больше не показывает legacy quick-start `photo-restore/photo-animate/trends`.
- На главной дашборда добавлены 4 категории подарков и блок `Популярные подарки` через `useListServicesQuery({ featured: true })`; остальные секции (stats, последние проекты/операции, активные заказы, empty-state CTA) сохранены.
- Dashboard/header UI в затронутых местах переведён на «коины»: stat-карточки, sidebar/header top-up CTA, ProjectCard, TransactionRow, billing, character/episode dashboard screens.
- Sidebar-структура не менялась, но подписи приведены к актуальной модели: Кабинет / Проекты / Заказы / Сказки / Биллинг / Профиль. Empty-state страницы заказов/сказок оставлены для P5.

Страница результата генерации:

- `/dashboard/projects/[id]` сохранил legacy Studio v1 рендер без унификации.
- Для data-driven `COMPLETED` проекта добавлен продуктовый result-режим: крупный preview (`video controls` или image с full-screen), кнопки `Скачать`, `Сгенерировать ещё раз` с tooltip `Перегенерация — скоро`, `Поделиться` с mock-диалогом публичной ссылки.
- Под preview добавлен summary: услуга, tier Standard/Pro, дата создания, стоимость, миниатюры исходных материалов.
- Технические `stepProgress` и output шагов спрятаны в `<details>` `Детали генерации`, по умолчанию свёрнуто.
- Для `PENDING/PROCESSING` data-driven проекта сверху показывается общий progress bar из `Project.progress`, сообщение про 2–5 минут и список шагов со статусами/progress из `stepProgress`.
- Для `FAILED` проекта показывается ошибка, сообщение о возврате коинов и кнопка `Попробовать снова` → `/services/[slug]`.

Нестандартные решения и нюансы:

- Реальный regenerate-flow и приватный share-flow не реализованы; кнопки оставлены как product-ready mock по P3b.
- `tokenBalance`, `tokensCost`, `TokenPackage` в коде не переименовывались, только UI-тексты. Переименование в `coinBalance` остаётся P4.
- `GET /api/services` и существующие DTO не менялись: category/featured уже были в `services-api.ts` и `types/public.ts`.
- Root `npm run build` был запущен, но остановился на известном Windows EPERM во время `prisma generate`, потому что локальный dev-процесс держал Prisma engine DLL. Отдельные package builds зелёные.
- API `queue.test.ts` при обычном запуске может быть съеден живым worker из `npm run dev`; финальный API-suite прогонялся с `REDIS_URL=redis://localhost:6379/15`.

Тесты и smoke:

- `npm.cmd run build -w @allvision/shared` — зелёный.
- `npm.cmd run build -w @allvision/api` — зелёный.
- `npm.cmd run build -w @allvision/worker` — зелёный.
- `npm.cmd run build -w @allvision/web` — зелёный.
- API: `170 passed` с `REDIS_URL=redis://localhost:6379/15`.
- Worker: `7 passed`.
- Smoke на свежем API `:4001`: регистрация дала 25 коинов; `/api/account/dashboard` вернул агрегаты; seeded `user@allvision.studio / user123` с 25 коинами получил `402 INSUFFICIENT_TOKENS` на `revive-old-photo` Standard; smoke-пользователь с 1000 коинами запустил `revive-old-photo`, проект дошёл до `COMPLETED`, `stepProgress` содержит 3 шага, результат mp4 скачался (`1128375` bytes). Smoke-пользователь удалён после проверки.

## Этап P6 ✅

Pre-flight и решение по PiAPI:

- Сверены актуальные PiAPI docs: unified task API, Kling create-task, video face-swap, image toolkit/upscale, account info.
- Выяснено, что PiAPI не даёт качественный old-photo restoration endpoint. Решение этапа: `image-restore` остаётся mock до P6.5, кандидат на будущий provider — Replicate GFPGAN или аналог.
- Kling использует `model: "kling"`, `task_type: "video_generation"`, `input.mode: "std" | "pro"`. В P6 это отражено как registry models `kling-std` и `kling-pro`.
- Video face-swap использует `model: "Qubico/video-toolkit"`, `task_type: "face-swap"`; tier'ов нет, поэтому Standard/Pro маппятся на одну модель `qubico-video-toolkit`.
- Для Kling и video face-swap входы нужны как публичные URL, не base64 data-uri. Принято решение использовать Cloudflare R2 для временной публикации input-файлов.

Provider layer:

- Добавлен worker-контракт `apps/worker/src/providers/ai-provider.ts` с `ProviderResult` и методами `imageRestore`, `imageToVideo`, `faceSwapVideo`.
- Добавлен `PiAPIClient` (`createTask`, `getTask`, polling с backoff, HTTP timeout/retry, account info, download provider output).
- Добавлен `PiAPIProvider`: Kling image-to-video, Qubico video face-swap, скачивание результата в LocalFileStorage, metadata `piapiTaskId`, `piapiUrl`, `model`.
- Добавлен `R2TemporaryPublisher`: читает локальный `/static/...` input, `sharp` auto-orient/resize до 2048, JPEG quality 90, uploads в R2 temp prefix.
- `MockAIProvider` расширен новым worker interface; mock-only блоки не требуют PiAPI key.
- `StubAIProvider` добавлен для тестов и `NODE_ENV=test`, обычные тесты не делают сетевых/billable вызовов.
- Старые Studio v1 processors переведены на `getLegacyAIProvider()`, чтобы legacy очереди остались mock.

Защита бюджета и очереди:

- В Prisma добавлена таблица `AIUsageLog` + migration `20260507180000_add_ai_usage_log`.
- Добавлены helpers `usage-limits.ts`: spend за последние 24 часа, daily cap, raw insert/read/delete для `AIUsageLog`.
- PiAPI-вызовы проверяют `PIAPI_DAILY_CAP_USD` и low-balance flag из `/account/info`; при `DAILY_CAP_EXCEEDED`/`LOW_PROVIDER_BALANCE` pipeline fail'ится безопасным UI-сообщением и refund'ом коинов.
- Worker startup fail-fast: без `PIAPI_API_KEY` и R2 env production worker не стартует. Test env остаётся stub.
- `service-pipeline` worker concurrency зафиксирован в `1`.
- Admin `POST /api/admin/services/:id/test-run` ставит job с `mode: "test-run"`; worker использует mock/stub, PiAPI не вызывается.

Блоки, seed и UI:

- `image-to-video` executor переведён на `AIProvider.imageToVideo`, models `kling-std`/`kling-pro`.
- `face-swap-video` executor переведён на `AIProvider.faceSwapVideo`, params `target_video`, `duration`, `estimatedFrames`.
- `image-restore`, `image-upscale`, `text-to-video` остаются mock-compatible через новый provider interface.
- `revive-old-photo` в seed скрыт: `isActive: false`, `isFeatured: false`.
- `face-in-trend` в seed сделан real smoke-услугой: `isActive: true`, `isFeatured: true`, цена 40/40 коинов по себестоимости `$0.48 * 80 ₽/$`, tier оба используют `qubico-video-toolkit`.
- В `face-in-trend` добавлен `trendVideo` select с placeholder public URL'ами. Перед реальным smoke нужно заменить `https://placeholder.example.com/trend-*.mp4` на настоящие публичные R2 URLs и заново выполнить seed.
- `kid-cartoon-hero` и `anniversary-card` переведены на mock `text-to-video`, чтобы не вызывать PiAPI в P6.
- `/dashboard/projects/[id]` для data-driven progress показывает 3–15 минут и в `<details>` выводит `providerCostUsd`/`piapiTaskId` из step output metadata.

Конфигурация и docs:

- Добавлены PiAPI/R2 env keys в `.env.example`, `apps/worker/.env.example`, `apps/api/.env.example`.
- README получил раздел `PiAPI Integration`: переменные, R2 lifecycle, daily cap, balance check, smoke command.
- Добавлен `apps/worker/scripts/smoke-piapi.ts`, запускается только при `RUN_PIAPI_SMOKE=1` и делает реальный Kling smoke.

Тесты и проверки:

- `npx.cmd prisma migrate deploy --schema packages/database/prisma/schema.prisma` — migration применена.
- `npx.cmd prisma generate --schema ...` пробовал запускать, но Windows EPERM сохраняется из-за живого dev-процесса, который держит Prisma engine DLL; код P6 не зависит от нового generated delegate и пишет `AIUsageLog` raw SQL helpers.
- `npm.cmd run build -w @allvision/shared` — зелёный.
- `npm.cmd run build -w @allvision/worker` — зелёный.
- `npm.cmd run build -w @allvision/api` — зелёный.
- `npm.cmd run build -w @allvision/web` — зелёный.
- Worker tests: `10 passed`.
- API tests с `REDIS_URL=redis://localhost:6379/15`: `171 passed`.
- Реальный PiAPI smoke не запускался: нет `PIAPI_API_KEY`, R2 env и настоящих trend-video URL'ов. Это ожидаемо для P6 до ручной настройки.

## Этап P6.5 ✅

Production deploy infrastructure для `allvision-pulse.ru`:

- Добавлены production Dockerfile'ы для `apps/api`, `apps/worker`, `apps/web`. API стартует через `prisma migrate deploy`, затем prod-safe seed, затем `node dist/index.js`; worker-образ содержит `ffmpeg`; web работает через Next.js `output: "standalone"`.
- Добавлен `infra/prod/docker-compose.prod.yml` с PostgreSQL 16, Redis 7, API, worker, web и внутренним nginx на `127.0.0.1:80`. Shared bind mounts: `/opt/allvision-studio/shared/postgres_data`, `uploads`, `public-trends`.
- Добавлен `infra/prod/nginx.prod.conf`: `/api/*` проксируется в API, `/static/trends/*` раздаёт trend-видео, `/static/*` раздаёт user uploads/results, остальное идёт в Next.js.
- Добавлен GitHub Actions workflow `.github/workflows/deploy.yml`: rsync релиза на ВМ, symlink shared `.env`, build, переключение `current`, healthcheck, `previous`, хранение последних 5 релизов, rollback при fail.
- Добавлен `/opt/allvision-studio/scripts/rollback.sh` через repo script `scripts/rollback.sh` и документация `docs/DEPLOY.md`.

Provider/storage:

- `PROVIDER_MODE` стал first-class флагом: `mock` не требует PiAPI/R2 и гонит все блоки через MockAIProvider; `piapi` включает PiAPI для `image-to-video` и `face-swap-video`; `stub` разрешён только в `NODE_ENV=test`.
- Добавлены `LocalPublicPublisher` и `NoopPublisher`, существующий `R2TemporaryPublisher` приведён к общему контракту. Prod default: `STORAGE_PUBLISHER=local`, то есть PiAPI получает URL вида `https://allvision-pulse.ru/static/...` с нашего nginx.
- Worker mount uploads в prod сделан writable, потому что и mock, и PiAPI-провайдеры пишут результат в shared uploads.

Seed и health:

- `packages/database/src/seed.ts` теперь prod-safe: запускается только на пустой БД, требует `ADMIN_INITIAL_EMAIL` и `ADMIN_INITIAL_PASSWORD`, создаёт admin, 4 пилотные услуги, token packages и public settings без destructive операций.
- `packages/database/src/seed-dev.ts` оставлен для локальной разработки: destructive truncate, prod seed, legacy demo catalog и `user@allvision.studio / user123` с 25 коинами.
- `face-in-trend` получает 3 trend-video опции из `${PUBLIC_API_URL}/static/trends/trend-N.mp4`, `previewVideo` указывает на trend-1, `target_video` остаётся `{{user.trendVideo}}`, `isFeatured: true`.
- `/api/health` отдаёт `{ status, version, uptime, providerMode }` без зависимостей; `/api/ready` проверяет PostgreSQL и Redis.

Prod-инфра одним абзацем: DNS Рег.ру ведёт на ВМ, хостовый nginx держит SSL и проксирует `https://allvision-pulse.ru` на `127.0.0.1:80`, где docker nginx направляет `/api/*` в Express API, страницы в Next.js web, static uploads/results и trend-видео из shared volume; worker обрабатывает BullMQ jobs через Redis и пишет результаты в shared uploads, PostgreSQL хранит состояние в shared `postgres_data`.

Известные technical debt: SSL на платном сертификате Рег.ру до миграции на Let's Encrypt в P7, нет автоматических бекапов БД, нет monitoring/alerting, single-VM без failover, SMTP пока mock/email logger, Cloudflare R2 не используется в P6.5.

Проверки P6.5:

- `npm.cmd run build` — зелёный.
- Worker tests: `10 passed`.
- API tests с `REDIS_URL=redis://localhost:6379/15`: `171 passed`.
- `docker compose -f infra/prod/docker-compose.prod.yml build` с `ALLVISION_ENV_FILE=.env.example` — зелёный.
- Runtime import smoke в prod images: `@allvision/shared` и `@allvision/database` загружаются в `prod-api`/`prod-worker`, Next standalone содержит `apps/web/server.js`.

## Этап P6.6 ✅

Prod fixes после первого запуска на `allvision-pulse.ru`:

- Исправлен `readInputUrl`: строковый input теперь возвращается как URL, а не заменяется на `mock://input.jpg`. Баг потенциально затрагивал все блоки, которые читают вход через `readInputUrl`: `image-restore`, `image-upscale`, `image-to-video`, `face-swap-video`; для реального PiAPI критичны `image-to-video` и `face-swap-video`.
- Shared uploads переведены на подход A: prod Dockerfile'ы создают пользователя `allvision` с UID/GID `1000`, чтобы совпадать с owner shared volume на ВМ (`andromeda`). Старый UID `10001`, compose `user:` overrides и one-shot chown service убраны; shared volumes должны принадлежать `1000:1000`.
- Next Image оставлен с явными `remotePatterns` для `picsum.photos`, `fastly.picsum.photos`, `allvision-pulse.ru` и `www.allvision-pulse.ru`. Picsum остаётся временным placeholder-источником из seed; реальные превью услуг через admin UI — технический долг P7.
- Worker prod image во время build запускает `npm run demo:download`, чтобы заполнить `apps/api/demo-assets` для mock-блоков. Выбран этот путь, потому что текущий скрипт уже идемпотентно скачивает/генерирует ассеты и не требует secrets. Дополнительно `MockAIProvider` при пустых video demo-assets генерирует 1-секундный black mp4 через ffmpeg, чтобы `text-to-video`, `image-to-video` mock и `face-swap-video` mock не падали с `DEMO_ASSETS_EMPTY`.

Проверки P6.6: `npm.cmd test -w @allvision/worker` — 19 passed; API tests с `REDIS_URL=redis://localhost:6379/15` — 171 passed; `npm.cmd run build` — зелёный; `docker compose -f infra/prod/docker-compose.prod.yml build` с `ALLVISION_ENV_FILE=.env.example` — зелёный; prod images запускаются под `uid=1000(allvision)`.

Технические долги: заменить picsum preview в seed на реальные брендовые assets; после `sudo chown -R 1000:1000 /opt/allvision-studio/shared/{uploads,postgres_data,public-trends}` убрать временные `chmod 777` на ВМ и держать `uploads/public-trends` в режиме `755`/обычные owner-write права. Hotfix: preview-видео на странице услуги синхронизируется с select-полем формы.

## Этап P7a ✅

Production-grade admin, MediaAsset, image-edit/Nano Banana, usage analytics и UX errors:

- Pre-flight по PiAPI: Nano Banana 2 подтверждён в актуальной документации PiAPI как Gemini endpoint `model: "gemini"`, `task_type: "nano-banana-2"`. P7a использует `prompt`, один входной `image_urls[]`, `output_format`, `aspect_ratio`, `resolution`. Цена Nano Banana 2 в docs: `$0.06` за 1K, `$0.08` за 2K, `$0.12` за 4K. Полей `negative_prompt` и `strength` в PiAPI payload нет; они оставлены в каталоге как compatibility/admin-поля, но PiAPIProvider их не отправляет.
- В Prisma добавлены `MediaAsset` и `Project.errorCode`; миграции `20260509120000_p7a_media_assets` и `20260509193000_media_asset_tags_not_null`. Продовый API container после seed запускает идемпотентный `migrate:media-assets`, который переносит `/opt/allvision-studio/shared/public-trends/trend-{1..3}.mp4` в MediaAsset `kind: "trend-video"`.
- `/admin/media-assets`: CRUD, upload image/video/audio, фильтры, поиск по title/tags, active toggle, delete guard для активных проектов, sortOrder через drag-and-drop и кнопки up/down. Video upload проверяет лимиты до транскода: max 10 sec, max 15 MB; ffmpeg приводит видео к H.264/720p и генерирует thumbnail.
- Добавлен public endpoint `GET /api/public/media-assets?kind=trend-video&active=true` и новый тип поля формы `media-select`. `face-in-trend` в seed теперь выбирает trend-video из MediaAsset, а worker перед запуском pipeline резолвит выбранный MediaAsset id в `publicUrl` для placeholder `{{user.trendVideo}}`.
- Каталог блоков расширен metadata для конструктора: `provider`, `estimatedCostUsd`, descriptions, limits, requiredParams, docsUrl. Admin service form показывает описание модели, cost, limits, provider, docs link и warning при нарушении limits; validation errors для админа стали читаемыми.
- Добавлен блок `image-edit` и worker executor `apps/worker/src/blocks/image-edit.ts`. `AIProvider` получил `imageEdit`; `MockAIProvider`/`StubAIProvider` реализуют его без billable вызовов; `PiAPIProvider.imageEdit` вызывает Nano Banana 2 и сохраняет результат через общий output flow.
- `revive-old-photo` снова активен и featured: Standard 20 coins, Pro 30 coins. Pipeline: `image-edit` Nano Banana 2 -> `image-to-video` Kling -> `video-compose`. Seed prompt в `step_1.params.prompt` специально является `PLACEHOLDER`; после деплоя его нужно заменить в админке на финальный реставрационный промпт.
- `/admin/usage`: summary по `AIUsageLog`, фильтры, day/model/block aggregates, таблица последних логов с раскрытием errorMessage. `/admin/piapi/account` читает баланс PiAPI из API-процесса и кэширует 60 секунд в Redis, в тестах cache memory-only.
- User-facing errors: добавлен `packages/shared/src/errors/user-messages.ts`, `Project.errorCode` сохраняется worker'ом при failed pipeline. `/dashboard/projects/[id]` показывает пользователю friendly message и raw details в collapsed support details; admin видит raw error сразу.
- PiAPI polling timeout снижен до 15 минут для `face-swap-video` и `image-to-video`; для `image-edit` установлен 5-минутный timeout. P7a не делает async-fetch результата после нашего timeout.

Технический долг, оставленный осознанно:

- P7b: async-fetch результатов PiAPI после timeout, pricing calibration себестоимость -> маржа, real test-run в админке.
- P7c: email notifications для failed/completed, юр-документы, реальный SMTP.
- Отложено: замена picsum placeholders на брендовые assets, `tokenBalance` -> `coinBalance`, удаление legacy Studio v1 queues.

Проверки P7a:

- `npx.cmd prisma migrate deploy --schema packages/database/prisma/schema.prisma` — зелёный.
- Worker tests: `23 passed`.
- API tests: `178 passed`.
- Builds: `@allvision/shared`, `@allvision/database`, `@allvision/api`, `@allvision/worker`, `@allvision/web` — зелёные.
- `docker compose -f infra/prod/docker-compose.prod.yml build` — зелёный. В prod Dockerfile'ы добавлены npm fetch retries/timeouts, потому что первые два локальных build-ретрая падали на сетевых `EIDLETIMEOUT`/`ECONNRESET` от registry/prisma engines, а не на ошибках кода.

## Этап P11 ✅ — Точная себестоимость fal по параметрам (quality/resolution/формат)

Проблема: себестоимость услуг считалась по захардкоженным константам PiAPI-эпохи (`gpt-image-2` — всегда $0.10 независимо от качества), а живой fal pricing API не отражает тарифы моделей, где цена зависит от качества/разрешения. Плюс баг: при неизвестном `endpoint_id` fal возвращает общий список цен, и код брал `json.prices[0]` — цену ЧУЖОЙ модели (источник «$1 у GPT Image» в админке).

- `packages/shared/src/blocks/fal-pricing.ts`: `falDocumentedCostUsd(slug, { quality, resolution, aspectRatio })` — цены из документации fal. `gpt-image-2`: low $0.005–0.006 / medium $0.042–0.053 / high $0.165–0.211 (square 1:1/auto vs rect 9:16/16:9; auto-quality тарифицируется как medium). `nano-banana` (Nano Banana Pro): 1K $0.12 / 2K $0.14 / 4K $0.18.
- `estimateModelCostUsd` (shared) сначала пробует doc-таблицу → калькулятор услуг в `/admin/services`, маржа в списке услуг и цены чата теперь параметро-зависимые. Обложка `product-card` тоже считается по doc-таблице (`cover_model` + quality) вместо константы $0.10.
- Фикс `?? json.prices[0]` в `apps/api/src/routes/admin/usage.ts` (getFalPricing) и `apps/worker/src/providers/fal-client.ts` (getEndpointPricing): только точное совпадение endpoint.
- `GET /api/admin/fal/pricing` принимает `quality`/`resolution`/`aspectRatio` и для тарифицируемых моделей отдаёт `source: 'docs'` (цена из документации), иначе `source: 'live'` (unit_price × units). `GET /api/admin/fal/models` для таких моделей отдаёт `docPriceNote` (строку тарифа) и не дёргает pricing API.
- Web: `FalLivePrice` в конструкторе услуг получает quality/resolution/aspect_ratio из параметров шага — переключение выпадающих списков сразу меняет показанную себестоимость, с подписью «по документации fal» / «live». `/admin/models` показывает тарифную строку вместо «н/д» для gpt-image-2/nano-banana.
- Worker `estimateImageCost` (fal-provider) переиспользует shared doc-таблицу (fallback, когда fal не вернул фактическую цену; факт по-прежнему приоритетен: `fal-reported` → `fal-priced` → `estimated`).
- Каталог: nano-banana переименован в «Nano Banana Pro (Gemini)» с актуальными ценами, gpt-image-2 estimatedCostUsd 0.1 → 0.053, оба docsUrl ведут на страницы моделей fal; тарифы прописаны в описаниях выпадающих списков quality/resolution блока image-edit.
- Починены два устаревших теста, падавших ещё на HEAD: `blocks-registry` (18 блоков после добавления `fal-generic`) и `trend-video-transfer` (дефолтный движок `wan-motion` после 2e23a8d).

Проверки P11: shared — 33 passed (7 suites, добавлены тесты falDocumentedCostUsd и параметро-зависимого pricing); worker без DB-backed — 91 passed (16 suites); билды shared/worker/api/web — зелёные. DB-backed suites (pipeline-runner, piapi-provider, API) локально заблокированы без Postgres `localhost:5433`, как в прошлых этапах.

Нюанс: quality-тарифы gpt-image-2 сняты со страницы fal вручную (pricing API их не отдаёт) — при изменении тарифов fal обновить `GPT_IMAGE_2_DOC_PRICES`/`NANO_BANANA_DOC_PRICES` в `fal-pricing.ts`. Точная фактическая стоимость по-прежнему сверяется кнопкой «Сверить факт. стоимость с fal» (billing-events) в `/admin/models`.

## Этап P11.1 ✅ — Чат: единая скрепка референсов; админ-цены при 429

Чат Allvision AI (ChatForm) — профессиональное прикрепление референсов вместо отдельных скрепок на каждый слот:

- **Единая скрепка**: у моделей с одним слотом открывает выбор сразу; у мультислотовых (omni, first/last, motion, face-swap, talking-avatar) — выпадающее меню слотов с подписью, типом медиа, обязательностью, именем прикреплённого файла и бейджем-счётчиком `N/M` прямо на скрепке.
- **Чипы референсов** над полем ввода: превью + подпись слота. Клик по чипу omni-модели вставляет @упоминание (`@image_1`/`@video`) в промпт (только модели, понимающие anchors — kling-3-omni, seedance omni); у остальных клик открывает замену. Крестик удаляет. Пустые ОБЯЗАТЕЛЬНЫЕ слоты показываются пунктирными чипами-приглашениями; опциональные — только в меню скрепки.
- **Без дублей**: слот-параметры (`images`, `image_urls`, `video`, `video_urls`, `tail_image_url`, `video_url`, `target_video`, `audio_url`) скрыты из расширенных настроек — референс прикрепляется в одном месте. `missingAdvancedRequirement` и оценка цены считаются от `mergedParams` (advanced + слоты), поэтому motion-transfer/face-swap больше не требуют захода в настройки.
- Drag&drop/выбор файла заполняет первый свободный слот подходящего типа (иначе заменяет первый подходящий), тост говорит какой слот заполнен. `InputSourcePicker` получил контролируемый режим (`open`/`onOpenChange`/`hideTrigger`/`slotLabel`) — модалка вызывается из меню скрепки/чипов; старые встроенные режимы не тронуты.
- Отправка не менялась контрактно: `source`→`inputRef`, аудио→`audioInputRef`, слоты→`params` — тот же формат, что раньше собирался в submit (логика вынесена в memo `slotParams`).

Админ-цены (продолжение P11): `/admin/models` был пустым из-за **HTTP 429** — страница била ~45 параллельных запросов в fal pricing API. Сделано: `mapWithLimit` (3 одновременных) в `GET /api/admin/fal/models`; fallback-оценка `catalogCostUsd` из каталога блоков (`estimateModelCostUsd`), страница показывает `≈ $x (каталог)` вместо «н/д»; `GET /api/admin/fal/pricing` при недоступной живой цене отдаёт `source: 'estimate'` из каталога (конструктор услуг всегда показывает себестоимость: документация → live → оценка); reconcile billing-events при 429 даёт понятное сообщение «подождите минуту».

Проверки P11.1: билды api/web — зелёные (web с обычными eslint-warning'ами hooks, не новыми). Shared/worker не менялись. Ручной smoke чата на проде — после деплоя.

## Этап P11.2 ✅ — Конструктор услуг: секции параметров по режимам (trend-video-transfer)

Проблема: у блока `trend-video-transfer` (услуги «Трендовые танцы», «Я в трендовом видео») ~28 полей рендерились плоской свалкой: модели вводились текстом, английские подписи, PiAPI-рудименты (6 полей индексов лиц Qubico), и было непонятно, какой промпт/модель к какому режиму относится.

Механизм (generic, для любых блоков-роутеров):

- Shared-типы: `JsonSchemaObject.group` и `JsonSchemaObject.enumLabels` (значение → русская подпись в select), `BlockCatalogItem.paramGroups: ParamGroupDef[]` (`id`, `title`, `description`, `whenFields`/`whenValues` — условная видимость секции, `collapsed`).
- `BlockParamsForm` рендерит параметры секциями: негруппированные — в основной сетке, группы — раскрывающимися блоками с заголовком и описанием «когда применяется». Если режим задан конкретно (в `whenFields` первый не-плейсхолдер), секции чужих режимов скрываются; если режим отдан пользователю (`{{user.mode}}`) — видны все секции. `shouldShowParamForModels` не фильтрует блоки с `paramGroups` (видимость управляется группами).
- Enum-select показывает `enumLabels` и не теряет плейсхолдер: значение `{{user.mode}}` рендерится опцией «Из формы пользователя: …».

trend-video-transfer переописан:

- Русские названия/описания всех полей, режимы с человеческими подписями («Я в этом видео (замена персонажа)» / «Повторить движение» / Kling Omni / Seedance Omni), блок и router-модель тоже на русском.
- Модели — выпадающие списки из каталога через helper `modelEnum()`: `motion_model` (все motion-модели, дефолт синхронизирован с worker: `wan-motion`), `portrait_model` (image-edit модели), `kling_omni_model`, `seedance_model`, `face_swap_model`.
- Секции: «Я в этом видео» (инфо: на fal всегда Wan 2.2 Animate Replace ~$0.08/сек, промпт не используется), «Повторить движение» (motion_model + модель склейки двух фото), Kling Omni (модель + звук/мульти-сцены; `keep_original_audio` default выправлен на true как в worker), Seedance Omni, «Промпты (переопределение)» (объяснено: пусто = встроенный промпт под режим и число людей; `duo_prompt` — только склейка двух фото в motion-режиме), «Legacy PiAPI (Qubico face swap)» — свёрнутая секция с 6 индексами лиц/estimatedFrames/face_swap_model, помечено что на fal не используется.
- У `prompt`/`duo_prompt` убраны захардкоженные default'ы из каталога: раньше single-person Kling-промпт сидел default'ом и попадал во все новые услуги (в т.ч. на дуэты и Seedance — источник «непонятно какой промпт применяется»). Теперь пусто = правильный встроенный промпт worker'а под режим/число людей. ВАЖНО: в существующих услугах старый промпт лежит в pipelineConfig в БД — чтобы включить корректные встроенные промпты, поле «Промпт (переопределение)» в админке нужно очистить.

Проверки P11.2: shared — 33 passed; worker без DB-backed — 91 passed; билды shared/worker/api/web — зелёные.

## Хотфикс P11.3 ✅ — Motion control «ошибка размера»: видео в fal storage, не data-uri

Симптом: motion-control (и любой fal-вызов с видео-входом) падал с ошибкой размера, хотя файлы небольшие по размеру и разрешению.

Причина (по коду `fal-provider.localizeInputUrls`): наши `/static`-входы инлайнились в JSON тела submit-запроса как base64 data-uri (лимит `FAL_MAX_DATAURI_BYTES`=25MB). Видео даже на 8–10 МБ в base64 раздувается на треть и улетает в теле запроса — очередь fal (`queue.fal.run`) отбивает крупный payload как «ошибка размера». Картинки проходят, потому что мелкие; видео — почти всегда падает. Затрагивало motion-transfer, trend «Повторить движение», face-swap (Wan Animate Replace, `video_url`), scene-transfer/omni (`video_urls`).

Фикс:
- `FalClient.uploadToStorage(buffer, contentType, fileName)` — загрузка в хранилище fal (fal CDN) по документированному потоку @fal-ai/client: `POST {REST}/storage/upload/initiate?storage_type=fal-cdn-v3` → `{ upload_url, file_url }`, затем `PUT` байтов на `upload_url`; на вход модели отдаём короткий `file_url`. REST-хост `https://rest.alpha.fal.ai`, переопределяется env `FAL_REST_BASE_URL`.
- `localizeUrl`: **видео** (`content-type: video/*`) теперь заливается в fal storage вместо base64 — короткий URL в payload чинит и «ошибку размера», и старый `file_download_error` (fal CDN доступен, в отличие от RU-хоста). **Картинки не тронуты** — остаются на рабочем data-uri пути (nano-banana/gpt-image), нулевой риск регрессии. При сбое загрузки видео — безопасный фолбэк на прежнее поведение (data-uri/URL).
- Env `FAL_REST_BASE_URL` добавлен в `apps/worker/.env.example` и `infra/prod/.env.example`.

Проверки P11.3: `npm.cmd run build -w @allvision/worker` — зелёный; worker `piapi-client` — 14 passed. Реальный fal storage smoke не гонялся (нет FAL_KEY локально); при неверном REST-хосте видео безопасно откатывается на прежнее поведение, а логи `[fal] uploaded ...` / `fal storage upload failed ...` покажут результат на проде.

## Хотфикс P11.4 ✅ — fal image_too_large: downscale входных картинок

Диагноз по прод-логам воркера (SSH): генерации падали `fal result fetch failed (422): image_too_large — Maximum dimensions are 3850x3850 pixels`. Это и есть «ошибка размера»: мы слали фото пользователя как data-uri БЕЗ уменьшения, а фото с телефона легко >3850px по стороне. Затрагивало все fal-вызовы с картинкой-входом (image-to-video Kling, image-edit, scene-transfer/omni). НЕ путать с байтовым payload из P11.3 — тут именно пиксельные размеры.

Фикс (`fal-provider.localizeUrl`):
- Входные картинки (`image_url`/`image_urls`) перед data-uri прогоняются через `sharp` (в воркере есть, 0.34.5): авто-ориентация по EXIF (`.rotate()`) + downscale длинной стороны до `FAL_MAX_IMAGE_DIM` (по умолчанию 2560, безопасно под 3850). Мелкие картинки без EXIF-ориентации не трогаются. Формат сохраняется (png/webp из-за прозрачности), остальное → jpeg q90. При ошибке sharp — фолбэк на оригинал.
- Бонус: авто-ориентация чинит перевёрнутые фото с телефона.

Второй фикс (`FalClient.uploadToStorage`): PUT в fal storage (видео) получил 3 попытки на transport-обрыв. По логам egress к `v3b.fal.media` с RU-ВМ флапает («fal storage upload failed: fetch failed»), хотя сам поток рабочий (проверено с ВМ: initiate 200, PUT 200 за 1.5с). Ретрай уменьшает откаты видео на data-uri.

Проверки P11.4: `npm.cmd run build -w @allvision/worker` — зелёный; worker `piapi-client` — 14 passed. Реальный fal storage/initiate/PUT проверен прямыми запросами с прод-ВМ (initiate 200, PUT 200). Env `FAL_MAX_IMAGE_DIM` можно поднять/опустить без пересборки.

## Хотфикс P11.5 ✅ — Motion Control: фолбэк на Omni при отказе по кадрированию фото

Ошибка с прода (услуга «Повторить движение», `trend-video-transfer` mode=motion_transfer, `motion_model: kling-motion-3.0-std`): `fal ... (422) input_value_error: "No complete upper body detected in the image; ensure the upper body is clearly visible"`. Kling Motion Control (человекоцентричный) требует чётко видимую верхнюю часть тела; фото юзера не подошло → генерация падала.

В блоке уже был фолбэк на Kling 3.0 Omni для случая «не-человек на фото», но матчер `isNonHumanCharacterError` ловил только `may require human in image`/`failed to upload character image`. Расширил его до `isKlingCharacterImageRejection` — теперь ловит и `no complete upper body detected`, `upper body`, `image recognition failed`, `input_value_error`. Любой отказ Kling Motion Control по картинке персонажа прозрачно уходит на Kling Omni (принимает любой субъект и кадрирование), юзер получает результат вместо ошибки. Успешные motion-control прогоны (человек по пояс) идут прежним путём.

Продуктовая альтернатива (по желанию, в `/admin/services`): сменить `motion_model` услуги на `wan-motion` (pose-retargeting, менее строг к кадрированию и сохраняет анатомию животных) — тогда первый прогон реже будет отбиваться. Код-фолбэк работает независимо и без правок БД.

Проверки P11.5: `npm.cmd run build -w @allvision/worker` — зелёный; worker `trend-video-transfer-block` — 9 passed (добавлен тест на отказ по upper body; тест «unrelated reason» с PIAPI_TIMEOUT по-прежнему НЕ фолбэчит).

## Этап P12 ✅ — Allvision AI чат: буфер, очистка формы, @-референсы, референсы в результате

Доработки UX чата (`apps/web/src/components/ai/*`):

1. **Вставка из буфера (Ctrl+V)**: `handlePaste` на контейнере поля ввода ловит `image/*` из clipboard, грузит через существующий `uploadReferenceFile` (первый свободный слот). Текстовая вставка не перехватывается. Drag&drop уже был.
2. **Подписи слотов**: omni «Персонаж 1/2» → «Референс 1/2» в `chatReferenceSlots` (kling-3-omni, seedance omni).
3. **Очистка формы после запуска**: submit чистит `prompt`, `source`, `audioSource`, `extraRefs`, `pickerSlot` (раньше промпт + иногда source).
4. **Клики по чипу + @-меню**: иконка чипа → полноэкранный просмотр (`ReferenceLightbox`); текст чипа → вставка `@image_1` в промпт (у omni) либо toast «модель не понимает @-референсы». При вводе `@` в промпте — dropdown с прикреплёнными anchor-референсами (@image_1/@image_2/@video), выбор подставляет anchor у каретки; если модель без anchor'ов — подсказка «не поддерживает @-референсы». `anchorSlots = visibleSlots.filter(anchor)`; anchors только у omni.
5. **Референсы в результате**: новый `ReferenceLightbox` (картинка/видео/аудио + скачать + опц. «переиспользовать»). Backend `extractChatReferences(userInputs)` собирает публичные URL из `chatGeneration.params` (`images/image_urls/video/video_url/video_urls/tail_image_url/target_video/audio_url/audio_urls`) + `inputPreviewUrl`, дедуп, mediaKind по расширению; отдаётся в `message.references`. `ChatResultView` рисует мини-превью референсов у промпта: клик → лайтбокс, hover → значок «переиспользовать» (кнопка и в лайтбоксе, и на превью). «Переиспользовать» ставит референс в форму (`reuseReference`); `resolveInputRef` расширен: наш публичный `/static/{user-uploads|media-assets|service-assets|uploads}/…` URL принимается как прямой вход.
- Бонус: `initialReference` эффект в ChatForm теперь по mediaKind — видео-референс переключает на video-модель с `acceptsVideoInput`, а не форсит nano-banana.

Проверки P12: билды shared/api/web — зелёные; shared `chat-models` — 7 passed.

## Хотфикс P13.6 ✅ — SSE реально доставляется: буферизация nginx, watchdog, события из реконсайлера

Симптом (владелец, после P13): результат генерации по-прежнему появляется не сразу, иногда только после F5.

Корень: SSE-стрим `GET /api/user/events` на проде буферизовался. Docker nginx обрабатывает `X-Accel-Buffering: no` от Express на СВОЁМ слое, но nginx по умолчанию НЕ передаёт X-Accel-* заголовки следующему прокси — хостовый nginx (SSL) получал стрим без заголовка и буферизовал его: события копились в прокси-буфере и не доходили до браузера (это ровно незакрытый долг P13 «хостовый nginx не проверен на буферизацию SSE»). Клиент при этом не мог заметить «мёртвый» стрим: heartbeat шёл SSE-комментарием `: ping`, а комментарии не доставляются в JS (EventSource их съедает молча) — соединение выглядело открытым, а фолбэк-поллинг фрагментирован по страницам → «нужен F5» на экранах без собственного поллинга.

Фиксы:

- `infra/prod/nginx.prod.conf`: отдельный `location = /api/user/events` — `proxy_buffering off`, `proxy_cache off`, `gzip off`, `proxy_http_version 1.1` + `Connection ""`, и главное `add_header X-Accel-Buffering "no" always` — заново выставляем заголовок для ХОСТОВОГО nginx, чтобы SSL-слой тоже не буферизовал.
- `apps/api/src/routes/user/events.ts`: heartbeat превращён из комментария в именованное событие `event: ping` (доставляется в JS).
- `ProjectEventsBridge`: watchdog мёртвого стрима — если 70с не было ни события, ни ping (сервер шлёт каждые 25с), соединение закрывается, кэши инвалидируются (catch-up) и открывается новое. Даже если какой-то прокси всё ещё буферизует, максимальное отставание UI ≤ ~70с вместо «до F5». Плюс закрыт долг P13.5: на смену статуса мост инвалидирует и `UserMediaAsset` — новый образ Студии появляется без перезахода.
- Долг P13 «SSE не публикуется из piapi-recovery-service» закрыт: добавлен API-паблишер `apps/api/src/utils/project-events.ts` (зеркало worker-версии), реконсайлер публикует `COMPLETED` при восстановлении проекта и `FAILED` при фейле+refund'е (только если статус реально изменился в транзакции).

Проверки P13.6: `npm.cmd run build -w @allvision/api` и `-w @allvision/web` — зелёные. Живой SSE-смоук через оба nginx-слоя возможен только на проде (SSH-ключа в текущем окружении нет, Docker локально не запущен): после деплоя проверить `curl -N https://allvision-pulse.ru/api/user/events` с auth-cookie — ping-события должны приходить каждые ~25с по одному, а не пачкой.

## Этап P14.1 ✅ — Профиль: единый блок «Безопасность», глазок пароля, повтор пароля при регистрации

- Профиль: карточка «Контакты» (messenger/messengerType) удалена как устаревший функционал (UI-only; поля в БД/API не тронуты). Всё security-содержимое собрано в одной карточке «Безопасность»: подтверждение email, смена пароля, удаление аккаунта (бывшая отдельная красная карточка стала вложенным блоком с кнопкой «Удалить аккаунт», раскрывающей форму).
- Новый компонент `apps/web/src/components/ui/password-input.tsx` — парольное поле с кнопкой показать/скрыть (Eye/EyeOff, forwardRef для react-hook-form). Применён во ВСЕХ парольных формах: логин, регистрация, сброс пароля, смена пароля в профиле (3 поля), подтверждение удаления аккаунта.
- Регистрация: добавлено поле «Повторите пароль» с клиентской валидацией (`confirmPassword` в zod-схеме формы через `.refine`; в API уходит только `password` — серверный контракт не менялся).

Деплой: ручной по SSH (P14-паттерн, без платного Actions) — `git archive HEAD` поверх `/opt/allvision-studio/current`, пересборка api/worker/web, пересоздание контейнеров + nginx (конфиг бинд-мантится одиночным файлом: замена файла меняет inode, работающий контейнер видит старый — нужен recreate, не reload). Вместе с этим батчем на прод уехали все 10 накопленных коммитов, включая P13.6 (SSE) и новую миграцию `20260708120000_add_service_cover_crop` (применяется стартом api).

Проверки P14.1: `npm.cmd run build -w @allvision/web` — зелёный.

## Этап P14.2 ✅ — Звук в превью-видео + цены/лимит промпта в чате

**Превью-видео со звуком (`apps/web/src/components/ui/preview-video.tsx`):** новый компонент `PreviewVideo` — по умолчанию играет с оригинальным звуком, со значком звука для отключения. Настройка звука общая и хранится в `localStorage` (`allvision.previewSound`): один раз выключил — остаётся выключенным после перезагрузки, пока не включишь снова. Чтобы сетка превью («Танцы» и т.п.) не завыла всеми роликами разом, звук в один момент звучит только у ОДНОГО превью — того, на которое навели курсор (или первого на странице, owner-модель через module-store); остальные проигрываются без звука. Браузеры блокируют unmuted-автозапуск без жеста → ролик стартует без звука и включает его при первом клике/касании по странице (owner). Значок кликается внутри `<Link>` без перехода (`preventDefault`+`stopPropagation`). Обложка/раскладка/пути не менялись — только `<video>` заменён на `PreviewVideo` там, где показываются превью: `ServicesCatalog` (карточки услуг), `HomePageContent` (featured hero + `MediaBlock` — обёрнут в `relative`, покрывает тренды/чат/студию), `ServiceDetail` (hero-превью услуги, контейнер получил `relative`). Мелкие технические миниатюры (исходники, шаги) не трогались.

**Цены Allvision AI (`packages/shared/src/chat/chat-models.ts`):** добавлен `chatModelPriceFloorCoins(modelSlug, duration)` — ценовой пол, не зависящий от себестоимости, применяется в `estimateChatGenerationPriceCoins` как `max(себестоимость×2, пол)`:
- любое фото — минимум **2 коина** (раньше самые дешёвые падали в 1);
- видео **Kling и Seedance** (familySlug `kling*`/`seedance*`) — минимум **12 коинов** на 5 сек, +1 коин за каждую секунду сверх 5 (5с→12, 6с→13, 7с→14…; короче/«auto» → 12).
Пол — общий и для API-списания, и для UI-цены (обе стороны зовут одну функцию). Себестоимостная цена ×2 всё равно применяется, если она выше пола (дорогие модели/1080p не дешевеют). Обновлён существующий тест «x2» под floor-aware ожидания.

**Лимит промпта 2500 (Kling max):** новая константа `CHAT_PROMPT_MAX_LENGTH = 2500` в shared. Валидируется в `chatMessageSchema` (API, было `.max(4000)`) и в `ChatForm` (web): при превышении — submit заблокирован, красная подсказка «Слишком длинный запрос: N из 2500», счётчик `N / 2500` появляется у поля при приближении к лимиту (>2300), позиционирован над полем — не ломает мобильную раскладку с кнопками внутри инпута. Промпт не обрезается жёстко (пользователь видит ошибку, а не молчаливое усечение).

**Kling 3.0 «auto» длительность — НЕ добавлено:** проверено по OpenAPI-схеме fal (`fal-ai/kling-video/v3/pro/image-to-video`) — `duration` это enum `["3".."15"]`, значения `auto` нет (в отличие от Seedance, где `supportsAuto` подтверждён схемой). Добавление `auto` для Kling дало бы 422 literal_error. Оставлено как есть.

Проверки P14.2: `npm.cmd run build` shared/api/worker/web — зелёные; `npm test -w @allvision/shared chat-models` — 8 passed (добавлен тест ценовых полов + prompt-лимита). Деплой — ручной по SSH (P14-паттерн).

## Этап P14.3 ✅ — Звук только на странице услуги, автоскролл чата, оверрайд-как-минимум, дизайн списка услуг

1. **Звук в превью — только на странице услуги.** `PreviewVideo` получил проп `withSound` (по умолчанию false → обычное muted-автовоспроизведение без кнопки/стора). Каталог (`ServicesCatalog`) и главная (`HomePageContent`/`MediaBlock`) идут БЕЗ звука; звук и значок остались только на hero-превью `ServiceDetail` (`withSound`).
2. **Чат открывается снизу.** `apps/web/src/app/ai/page.tsx`: ref на ленту сообщений + `useLayoutEffect` по `[activeChatId, messages.length]` ставит `scrollTop = scrollHeight` — при открытии чата и появлении нового сообщения лента прокручивается к последним генерациям (как мессенджер). Частый поллинг статуса не двигает скролл (длина не меняется), не мешая листать историю.
3. **Цена Kling/Seedance не менялась с длительностью — оверрайд теперь МИНИМУМ, а не фикс.** Корень: прод `MODEL_PRICE_OVERRIDES` содержал `kling-3-omni:12` (замораживал цену на 12 при любой длительности) и `nano-banana:1`/`gpt-image-2:1` (обходили пол картинок в 2). `estimateChatGenerationPriceCoins` больше не подменяет цену оверрайдом через `applyModelPriceOverride`, а берёт `max(себестоимость×2, ценовой пол по длительности, оверрайд)`. Итог: kling-3-omni 5с→12, 15с→22; картинки ≥2; seedance-2-omni (оверрайд 25) — минимум 25, растёт с длительностью. Изменение ТОЛЬКО в чат-функции; Studio (`user-media-assets`) и админский расчёт через `applyModelPriceOverride` не тронуты (там оверрайд остаётся фиксом). Данные в БД править не нужно — код делает старые оверрайды безвредными минимумами. Обновлён тест (был «оверрайд опускает до 1 токена» → стал «оверрайд это минимум»).
4. **Дизайн списка услуг в админке (`/admin/services`).** Контейнер админки расширен `max-w-7xl → max-w-[1600px]`. Обложка в списке теперь как на витрине: 16:10, шириной 124px, с тем же кропом (`coverCropStyle(service.coverCrop)`), вместо квадрата 44×44. Колонка «Экономика» показывает ОБА тарифа (Стандарт/Pro) с полной ценой+себестоимостью+маржой, если они отличаются ценой или себестоимостью (видно весь диапазон «с разными функциями»); при равных тарифах — один столбец «Цена». Колонка расширена до 400px, `min-w` таблицы 1080.

Проверки P14.3: `npm test -w @allvision/shared chat-models` — 8 passed; билды shared/api/worker/web — зелёные. Деплой — ручной по SSH.

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
## Этап P7.1 ✅

Hotfix prod: cost accuracy, timeout charges, aspect ratio, JWT auth, admin observability.

- PiAPI cost: `PiAPIClient.pollUntilDone()` теперь возвращает `actualCostUsd`; источник факта - `data.meta.usage.consume` из PiAPI `GET /api/v1/task/{taskId}`, пересчитанный как `consume / 10_000_000`. Если PiAPI не вернул стоимость, `PiAPIProvider` пишет `console.warn` с `taskId` и использует прежний estimated fallback.
- Timeout charging: при `PIAPI_TIMEOUT` worker делает финальный `getTask(taskId)`. `completed` логируется как `timeout_charged` с фактической стоимостью и `recoverableOutputUrl` (если PiAPI не вернул стоимость, используется estimated fallback с `console.warn`); `failed` остается `timeout` с `costUsd=0`; `pending/processing` логируется как `timeout_pending` для будущего P7.3 async-fetch. Prisma: добавлено `AIUsageLog.recoverableOutputUrl`.
- Aspect ratio: MediaAsset video transcode больше не приводит trend-video к 1280x720, а сохраняет исходный ratio внутри max 1280. `image-to-video`, `face-swap-video`, `text-to-video`, `image-edit` получили `aspect_ratio: auto | 9:16 | 16:9 | 1:1`; Kling получает `aspect_ratio` в payload, а Qubico face-swap полагается на `target_video`, потому что в публичных docs нет `output_aspect_ratio`/`keep_source_ratio`.
- JWT root cause: access token TTL 15 минут, frontend не делал silent refresh, а Next middleware редиректил при отсутствии `accessToken`, игнорируя живой `refreshToken`. Исправлено: RTK Query baseQuery делает shared silent refresh на 401, middleware пропускает запрос при наличии refresh-cookie, backend логирует issue/verify/refresh с fingerprint токенов, без полного секрета.
- READONLY_ADMIN: Prisma enum `Role` расширен ролью `READONLY_ADMIN`; prod seed идемпотентно создает `READONLY_ADMIN_EMAIL` при заданном `READONLY_ADMIN_PASSWORD`, баланс 0. Login для readonly возвращает Bearer `accessToken` с TTL `READONLY_ADMIN_ACCESS_TTL_MIN`.
- Read-only endpoints: `GET /api/admin-readonly/diagnostics`, `GET /api/admin-readonly/project/:id/full`, `GET /api/admin-readonly/piapi/task/:taskId`. `GET /api/admin-readonly/logs/worker` оставлен как TODO/501 без `WORKER_STDOUT_LOG_PATH`. Middleware допускает `ADMIN` и `READONLY_ADMIN`; mutating methods блокируются, user emails/password/token secrets не отдаются.

Проверки P7.1 локально: `@allvision/database`, `@allvision/shared`, `@allvision/api`, `@allvision/worker`, `@allvision/web` builds зеленые. Полный API/worker test run и `prisma migrate deploy` локально заблокированы тем, что Postgres `localhost:5433` и Docker daemon не запущены в текущем окружении; миграция добавлена как `20260512120000_p7_1_cost_timeout_readonly`.

## Этап P7.1.1 ✅

Hotfix seed для `READONLY_ADMIN`.

- Что было сломано: prod seed мог пропустить создание системных юзеров из-за логики, завязанной на уже заполненный каталог услуг. На проде это проявилось строкой вида `[seed] database already contains 4 services; skipping prod seed`, из-за чего `READONLY_ADMIN` не создавался после добавления env-пароля.
- Что изменили: seed теперь разбит на 4 независимых идемпотентных шага: `ensureSystemUsers()`, `ensureCatalog()`, `ensureTokenPackages()`, `ensureMediaAssetsMigration()`. Каждый шаг логируется отдельно: `step 1/4: system users`, `step 2/4: catalog`, `step 3/4: token packages`, `step 4/4: media assets migration`.
- Гарантия: `ADMIN` и `READONLY_ADMIN` создаются/проверяются до каталога и больше не зависят от количества `Service`. Если `READONLY_ADMIN_PASSWORD` был добавлен уже после первого deploy, следующий seed создаст `claude-readonly@allvision-pulse.ru` даже при полностью заполненном каталоге.
- Безопасность паролей: существующим системным юзерам seed больше не перезаписывает `passwordHash` на каждом deploy. Если юзер уже есть с правильной ролью, пароль не трогается; при несовпадении роли обновляется только роль/`deletedAt`.
- Env: новые имена `ADMIN_EMAIL`/`ADMIN_PASSWORD` поддерживаются как основные, старые `ADMIN_INITIAL_EMAIL`/`ADMIN_INITIAL_PASSWORD` сохранены как fallback для совместимости.
- Тесты: добавлены unit-тесты `packages/database/src/__tests__/seed.test.ts` на пустую БД, повторный запуск с заполненным каталогом, запуск без `READONLY_ADMIN_PASSWORD`, и критический сценарий добавления `READONLY_ADMIN_PASSWORD` между двумя seed-run.
## Этап P7.2 ✅

Model registry/admin expansion:

- Added PiAPI catalog models: `seedance-2`, `seedance-2-fast`, `veo-3.1`, `veo-3.1-fast`, `sora-2`, `sora-2-pro`, `kling-3-std`, `kling-3-pro`, `hailuo-2.3`, `hailuo-2.3-fast`, and `motion-transfer` models `kling-motion-2.6-*` / `kling-motion-3.0-*`.
- Renamed old text-to-video mocks to `veo-3.1-mock` and `seedance-2.0-text-mock`.
- `Kling Avatar` and `Omni Human` were found in PiAPI docs, but not wired into `motion-transfer`: docs describe avatar/lip-sync or image+audio flows, not the requested `input_image + driving_video` dance-transfer payload.
- `AIProvider` gained `textToVideo()` and `motionTransfer()`; `PiAPIProvider` maps Seedance/Veo/Sora text-to-video, Kling/Hailuo image-to-video, and Kling Motion Control.

Admin UI:

- `/admin/services/new` and `/admin/services/:id` now show block descriptions, compatible inputs, examples, model metadata, limits, docs links, and field-level info details in `BlockParamsForm`.
- The service form includes a collapsible pipeline summary with Standard/Pro cost, price, margin, and an explicit negative-margin warning.
- `/admin/services` shows cost/price/margin per service row and colors rows by margin band.
- `/admin/usage` includes PiAPI balance forecast, status segmentation, a `timeout_pending` section, and `$x.xx` cost formatting with exact value in tooltip.
- New `/admin/diagnostics` shows build/API state, queue counts, recent projects/errors, MediaAsset file existence, masked env values, PiAPI balance refresh, and catalog reload action.

Pricing:

- Added `npm run prices:recompute` via `packages/database/src/prices-recompute.ts`.
- Dry-run by default; `--apply` writes `priceCoinsStandard`, `priceCoinsPro`, and legacy `priceTokens`.
- Defaults: `PRICING_MARGIN_DEFAULT=0.8`, `PRICING_USD_TO_RUB=80`; CLI supports `--margin 1.5`; prices round up to 10 coins.

API:

- Added `GET /api/admin/diagnostics/state`, `POST /api/admin/diagnostics/refresh-balance`, `POST /api/admin/diagnostics/reload-services-catalog`.
- Extended readonly endpoints: `GET /api/admin-readonly/services`, `GET /api/admin-readonly/media-assets?kind=trend-video`, `GET /api/admin-readonly/block-catalog`.

Technical debt:

- Sora2 task naming should be smoke-tested before paid Sora services are enabled broadly.
- Worker uptime is `null` in diagnostics until a worker heartbeat is persisted.
- Async-fetch recovery for `timeout_pending` remains P7.3.

## Этап P7.3.1 ✅

Финальная русификация админки:

- Переведены оставшиеся видимые строки в `/admin/diagnostics`, `/admin/usage`, `/admin/services`, `/admin/services/new`, `/admin/services/:id`, `/admin/media-assets`, `/admin/trends`, `/admin/scenario-templates`.
- Валидация пайплайна больше не показывает сырой Zod JSON: пустой pipeline, шаг без блока, битые ссылки на `step_N.output`, невалидные параметры и ошибки `userInputForm` мапятся в человекочитаемые сообщения.
- Сообщения admin API, которые могут попадать в toast, переведены на русский для services, media-assets, trends, scenario-templates, diagnostics/usage balance.

Users/Projects:

- Добавлены полноценные страницы `/admin/users`, `/admin/users/:id`, `/admin/projects`, `/admin/projects/:id`.
- Добавлены admin API: `GET /api/admin/users`, `GET /api/admin/users/:id`, `PATCH /api/admin/users/:id`, `GET /api/admin/projects`, `GET /api/admin/projects/:id`.
- `AdminSidebarNav` теперь ведет на пользователей и проекты без disabled-состояния.
- User endpoints не возвращают `passwordHash`; баланс можно менять только через `tokenBalance`.

Тройная валюта:

- Добавлен общий formatter `formatMoney()` в `packages/shared/src/utils/format-currency.ts`.
- Используется `Setting` с ключом `USD_TO_RUB`; default 80, управление через `GET/PATCH /api/admin/settings`.
- В админке деньги показываются как USD + рубли для себестоимости, коины + рубли для цены, процент + USD + рубли для маржи.
- Курс USD/RUB можно менять в `/admin/diagnostics` в блоке настроек валюты.

Тесты/проверки:

- Добавлены unit-тесты shared для `formatMoney()` и human-readable `validatePipelineConfig`.
- Добавлены API-тесты для `/api/admin/settings`, `/api/admin/users`, `/api/admin/projects`.
- Локально `npm run build`, `npm test -w @allvision/shared`, `npm test -w @allvision/database` проходят.

Technical debt:

- В текущем checkout не было секции `P7.3` и готовых `/admin/users`/`/admin/projects`, поэтому P7.3.1 добавил их заново поверх P7.2.
- DB-backed API/worker тесты локально блокируются, если не поднят Postgres `localhost:5433`/Docker daemon.
- Статусы и технические идентификаторы моделей/блоков остаются raw там, где это осознанные машинные значения для фильтров и диагностики.

## Этап P7.3.2 ✅

SourceSelector в pipeline-конструкторе:

- В `AdminServiceForm` добавлен визуальный `SourceSelector` вместо ручных URL-полей для основного `input` каждого шага и для параметров, помеченных `source-select:<kind>|<label>|<description>`.
- На `SourceSelector` переведены `motion-transfer.input_image`, `motion-transfer.video_url` и `face-swap-video.target_video`; для `image-edit`, `image-restore`, `image-upscale`, `image-to-video` и `video-compose` источник выбирается через общий `input` шага.
- Форматы значений: `{{user.X}}` для поля формы пользователя, `{{step_X.output}}` для результата предыдущего шага, `asset:X` для файла из библиотеки, прямой URL или нестандартный placeholder через расширенный режим.
- Библиотека медиа использует существующие kind'ы: image -> `preview-image`, video -> `trend-video`; новые kind'ы `reference-image`/`reference-video` не добавлялись, чтобы не плодить типы поверх текущего каталога.
- Inline-upload внутри `SourceSelector` отправляет multipart в существующий `POST /api/admin/media-assets`; после успеха новый MediaAsset сразу выбирается как `asset:<id>`.

Motion-transfer:

- Каноническое имя видео-референса в каталоге теперь `video_url`; `driving_video` оставлен как deprecated alias только для старых pipeline snapshots.
- Worker принимает оба ключа: `video_url` и `driving_video`; при старом ключе пишет warning `motion-transfer: driving_video is deprecated, use video_url`, а в PiAPI payload уходит `video_url`.
- При сохранении услуги UI канонизирует `motion-transfer.params.driving_video` в `video_url`, поэтому новые конфиги пишутся только в актуальном формате.

Asset resolution:

- При публичном запуске услуги `asset:<id>` в `pipelineSnapshot` резолвится в стабильный `MediaAsset.publicUrl` до создания Project.
- В `pipeline-runner` добавлен fallback-резолвинг `asset:<id>` перед выполнением pipeline, чтобы вручную созданные или старые snapshots тоже продолжали работать.

Тесты/проверки:

- Добавлены shared unit-тесты для парсинга `{{user.X}}`, `{{step_X.output}}`, `asset:X` и `source-select:<kind>|...`.
- Добавлены worker unit-тесты на `asset:<id>` resolution и backward-compatible `motion-transfer.driving_video`.
- Локально проходят `npm run build`, `npm test -w @allvision/shared -- --runInBand`, `npm test -w @allvision/worker -- --runInBand motion-transfer-block asset-reference`.

Technical debt:

- `SourceSelector` пока читает/загружает только существующие `preview-image` и `trend-video`; если позже понадобится отдельная библиотека reference assets, можно добавить `reference-image`/`reference-video` и расширить выбор kind'ов.
- Для моделей без явных source-параметров источник задается общим `input` шага, поэтому в каталоге не добавлялись фиктивные params вроде `image-edit.input`.

## Этап P8.1 ✅

User library:

- `MediaAsset` расширен полем `ownerUserId` и связью `owner -> User`; system-wide ассеты остаются с `ownerUserId = null`, пользовательские ассеты удаляются каскадно вместе с юзером.
- Добавлены kind'ы `user-avatar` и `user-location` для личной библиотеки пользователя.
- `Project` получил поле `mode`; для генерации образов используется `mode = "library-generation"`, обычные услуги остаются `mode = "service"`, admin test-run пишет `mode = "test-run"`.
- Миграция: `packages/database/prisma/migrations/20260513_user_avatars_locations`.

API:

- Добавлен `GET/POST/PATCH/DELETE /api/user/media-assets` и `GET /api/user/media-assets/:id`; все endpoints требуют auth и возвращают только ассеты текущего пользователя.
- Добавлен `POST /api/user/media-assets/generate`: списывает стоимость Nano Banana из реестра, создает `Project` с одношаговым `image-edit` pipeline и ставит задачу в `service-pipeline`.
- Admin `/api/admin/media-assets` теперь видит user-owned ассеты и возвращает `ownerUserId` + email владельца для модерации.
- Public `/api/public/media-assets` и readonly `/api/admin-readonly/media-assets` отдают только system-wide ассеты (`ownerUserId = null`).

Library generation:

- `image-edit`/`PiAPIProvider.imageEdit()` теперь поддерживают Nano Banana 2 text-to-image без `image_urls`, если input отсутствует.
- `pipeline-runner` переиспользуется без отдельного runner: после успешного `library-generation` pipeline создает `MediaAsset` у пользователя из финального image output.
- Если pipeline падает, существующий `markProjectFailed(... refundTokens: true)` возвращает коины; если очередь недоступна на старте, API сразу помечает проект failed и делает refund.

Security:

- `asset:<id>` в worker резолвится только если ассет system-wide или `ownerUserId === Project.userId`; чужой приватный ассет дает `INVALID_ASSET_ACCESS` и refund.
- User endpoints возвращают 404 для чужих ассетов, чтобы не раскрывать их существование.
- Public service launch резолвит только system-wide `asset:<id>`, чтобы приватный ассет не мог случайно попасть в public snapshot.

Web:

- Добавлена защищенная страница `/studio` с вкладками "Аватары", "Локации", "История генераций".
- На странице можно бесплатно загрузить фото в `user-avatar`/`user-location` и платно создать образ через Nano Banana; после старта генерации юзер переходит на `/dashboard/projects/:id`.
- В сайдбар пользователя добавлен пункт "Студия"; RTK Query слой: `apps/web/src/store/api/user-media-assets-api.ts`.

Tests/checks:

- Добавлены API-тесты для `/api/user/media-assets`, ownership, admin/public visibility и generate/refund сценариев.
- Добавлен worker DB-backed тест post-completion hook для `library-generation`.
- Локально проходят `npm run build`, `npm test -w @allvision/shared -- --runInBand`, `npm test -w @allvision/database -- --runInBand`, `npm test -w @allvision/worker -- --runInBand motion-transfer-block asset-reference`.
- DB-backed API/worker тесты (`user-media-assets`, `admin-media-assets`, `pipeline-runner`) локально не выполняются без Postgres `localhost:5433`; код и типы компилируются.

Technical debt:

- Стоимость Nano Banana берется из текущего model registry; отдельного admin override для library-generation пока нет.
- Локации генерируются как изображения через Nano Banana; video/location generation оставлена на будущие этапы.
- Интеграция аватаров/локаций в Allvision AI чат и услуги остается P8.2/P8.3.

## Этап P8.2 ✅

Allvision AI:

- Добавлена защищенная страница `/ai` с чатовым интерфейсом: история слева, результат генерации справа, sticky-форма запроса снизу.
- Каждый запрос создает отдельный `Project` с `mode = "free-chat"` и одношаговым `pipelineSnapshot`; отдельный runner не добавлялся.
- В пользовательский sidebar добавлен пункт "Allvision AI" рядом со "Студией".

CHAT_MODELS:

- Новый shared-каталог `packages/shared/src/chat/chat-models.ts` ограничивает модели, доступные в свободном чате.
- Image: `nano-banana` через блок `image-edit`, поддерживает text-to-image и optional image reference.
- Video image-to-video: `kling-std`, `kling-pro`, `kling-3-std`, `kling-3-pro`, `hailuo-2.3-fast`, `hailuo-2.3`.
- Video text-to-video: `seedance-2-fast`, `seedance-2`, `veo-3.1-fast`, `veo-3.1`, `sora-2`, `sora-2-pro`.
- `sora-2` и `sora-2-pro` помечены `experimental: true`, потому что P7.2 оставлял smoke-test Sora как технический долг.
- Узкие/служебные блоки исключены из чата: `face-swap-video`, `motion-transfer`, `video-compose`, `image-restore`, `image-upscale`.

API:

- Добавлен `GET /api/user/chat/models` для списка моделей чата.
- Добавлен `POST /api/user/chat/upload`: временная загрузка image/video input в `user-uploads/chat/<userId>/...`, возвращает `chat:<storageKey>`.
- Добавлен `POST /api/user/chat/generate`: валидирует модель, совместимость input, ownership `asset:<id>`, списывает коины, создает `free-chat` Project и ставит job в `service-pipeline`.
- Добавлен `GET /api/user/chat/history?limit&offset`: возвращает только проекты текущего пользователя с `mode = "free-chat"`.
- При ошибке постановки в очередь API помечает проект failed и возвращает коины.

Pipeline-runner:

- `asset:<id>` продолжает резолвиться с P8.1 ownership checks.
- Добавлен resolver `chat:<storageKey>`: принимает только ключи внутри `user-uploads/chat/<Project.userId>/...` и превращает их в public/signed URL перед выполнением pipeline.
- Результат предыдущего чата можно использовать как reference, если URL указывает на `/static/results/<projectId>/...` и проект принадлежит текущему пользователю.

Frontend structure:

- `apps/web/src/components/ai/ChatForm.tsx` — выбор категории, модели, prompt, aspect ratio, duration, стоимость и запуск.
- `apps/web/src/components/ai/InputSourcePicker.tsx` — выбор input из загрузки, личной Студии (`user-avatar`/`user-location`) или system-wide библиотеки сайта (`preview-image`/`trend-video`).
- `apps/web/src/components/ai/ChatHistoryList.tsx` — список последних free-chat проектов.
- `apps/web/src/components/ai/ChatResultView.tsx` — polling статуса, отображение картинки/видео, download и "использовать как референс".
- RTK Query слой: `apps/web/src/store/api/user-chat-api.ts`.

Tests/checks:

- Добавлен shared unit-тест, который проверяет что каждая модель `CHAT_MODELS` реально существует в `BLOCK_CATALOG`.
- Добавлены DB-backed API-тесты для `/api/user/chat/generate`, `/api/user/chat/upload`, `/api/user/chat/history`, refund при queue failure и ownership check для `asset:<id>`.
- Локально проходят `npm run build -w @allvision/shared`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`, `npm test -w @allvision/shared -- --runInBand chat-models`.
- DB-backed API-тест `npm test -w @allvision/api -- --runInBand user-chat` локально блокируется без Postgres `localhost:5433`, как и другие API DB-backed тесты из P8.1.

Technical debt:

- Multi-turn диалог не реализован: каждый запрос остается отдельным самостоятельным Project.
- Save-to-library результата чата оставлен на будущий этап.
- Cleanup временных `user-uploads/chat/*` файлов пока не реализован; нужен отдельный operational job с TTL 7 дней.
- Text-to-video модели в текущем worker не используют image reference, поэтому в `CHAT_MODELS` они помечены как text-only до отдельной поддержки image-to-video/text+image payload у провайдеров.

## Этап P8.3 ✅

Navigation / 5 pages:

- Финальный пользовательский sidebar: `Главная /`, `Allvision AI /ai`, `Услуги /services`, `Студия /studio`, `Профиль /profile`.
- Старые ссылки "Дашборд", "Биллинг", "Проекты" убраны из основной навигации; история проектов теперь доступна через Студию, баланс и пополнение через Профиль.
- `/dashboard` делает permanent redirect на `/`; `/dashboard/projects/[id]` оставлен как legacy/detail route результата проекта.
- `/dashboard/billing` редиректит на `/profile?tab=billing` с сохранением payment query; `/dashboard/profile` редиректит на `/profile`.

Главная:

- `apps/web/src/app/page.tsx` теперь рендерит гостевой лендинг для неавторизованных и новый пользовательский хаб для авторизованных.
- Авторизованная Главная содержит hero "Привет, <name>", быстрые действия на `/ai`, `/services`, `/studio`, последние 6 проектов, тренды из `MediaAsset kind=trend-video`, featured-услуги и статистику баланса/проектов/списаний.
- Гостевой лендинг сохранен без изменения контента секций.

Profile:

- Добавлена защищенная `/profile` со вкладками: личные данные + пароль, баланс и пакеты коинов, история транзакций/платежей, placeholder email-уведомлений, опасная зона удаления аккаунта.
- Flow пополнения использует существующие token packages и `payments/topup`; mock-payment success/failed теперь возвращает на `/profile?tab=billing`.

Studio avatars in services:

- `userInputForm.photo` получил флаги `allowStudioAvatars` (default true в admin UI/seed) и `allowSystemLibrary` (default false).
- На странице услуги photo/avatar поле умеет: загрузить файл, выбрать `user-avatar` из Студии, опционально выбрать `preview-image` из системной библиотеки.
- При выборе из Студии файл не загружается повторно: в `Project.userInputs[fieldId]` пишется `asset:<id>`, а `inputImages` получает preview URL для истории.
- Server launch проверяет ownership и kind до списания коинов; worker дополнительно резолвит `asset:<id>` в `userInputs`.
- Seed P8.3 включает `allowStudioAvatars: true` для photo-полей услуг `revive-old-photo`, `face-in-trend`, `kid-cartoon-hero`, `anniversary-card`; существующие seed-сервисы патчатся при отсутствии этих флагов.

Save-to-library:

- Добавлен `POST /api/user/media-assets/save-from-project` с body `{ projectId, kind, title, tags?, description? }`.
- Endpoint проверяет ownership проекта, `mode in free-chat/library-generation/service`, `status = COMPLETED`, копирует последний output в `user-uploads/library/<userId>/...` и создает `MediaAsset` без дополнительного списания коинов.
- Кнопка "Сохранить в Студию" добавлена в `ChatResultView` и `/dashboard/projects/[id]` для completed-проектов.
- Studio history показывает `использован аватар: <title>` для проектов, где `userInputs` содержит `asset:<id>`.

Tests/checks:

- Добавлены DB-backed API-тесты для `save-from-project` (ownership, status validation, successful copy) и service launch с `asset:<id>` Studio avatar.
- Локально проходят `npm run build -w @allvision/shared`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`.
- Локально проходят `npm test -w @allvision/shared -- --runInBand chat-models`, `npm test -w @allvision/shared -- --runInBand admin-services-validation`, `npm test -w @allvision/worker -- --runInBand asset-reference`.
- DB-backed API-тест `npm test -w @allvision/api -- --runInBand user-media-assets services-launch` локально блокируется без Postgres `localhost:5433`, как и прежние DB-backed API-тесты.
- E2E/UI unit для AvatarPicker не добавлялись: в web workspace сейчас нет Playwright/Vitest/RTL test infra.

Technical debt:

- Payments не проверялись реальной картой/ЮKassa sandbox, только существующий flow создания платежа и mock-payment redirect.
- Email-подтверждения и email-уведомления остаются будущим этапом.

## Этап P8.4 ✅

Navigation / shell:

- Пользовательский top-navigation убран для workspace-route'ов; `UserWorkspaceShell` теперь оборачивает авторизованные `/`, `/ai`, `/services`, `/services/[slug]`, `/studio`, `/profile`, `/dashboard/*`.
- Sidebar единый: логотип `Allvision Studio` сверху, 5 ссылок `Главная / Allvision AI / Услуги / Студия / Профиль`, баланс и профиль внизу.
- На mobile `<768px` sidebar скрыт; сверху есть compact bar с бургером слева, балансом и аватаркой справа. Sidebar открывается через Sheet overlay.
- Гостевой лендинг `/`, auth-страницы и админка не используют пользовательский sidebar; админка сохранила свой layout.

Multi-turn Allvision AI:

- Добавлены Prisma модели `Chat` и `ChatMessage`: чат = контейнер, сообщение = пара "запрос + связанный free-chat Project".
- Добавлен `apps/api/src/routes/user/chats.ts`: `GET/POST /api/user/chats`, `GET/PATCH/DELETE /api/user/chats/:id`, `POST /api/user/chats/:id/messages`.
- Создание сообщения переиспользует free-chat project pipeline: списание коинов, `mode = "free-chat"`, queue `service-pipeline`, embedded project state в деталях чата.
- `Chat.updatedAt` обновляется при новом сообщении; первый prompt автоматически становится title чата, если title был `Новый чат`.
- `result:<projectId>` теперь поддержан как reference: API проверяет ownership/completed project и резолвит final output URL для pipeline.
- Старые `/api/user/chat/generate` и `/api/user/chat/history` возвращают `410 CHAT_ENDPOINT_DEPRECATED`; `/api/user/chat/upload` и `/api/user/chat/models` оставлены.

AI UI:

- `/ai` перестроен в двухколоночный multi-turn интерфейс: список чатов слева, активная лента сообщений справа, sticky form снизу.
- Список чатов содержит `+ Новый чат`, поиск, title/date/messageCount и thumbnail последнего результата; на mobile список открывается отдельным Sheet.
- Сообщение показывает prompt, model/aspect/reference badges, progress для queued/processing, media result для completed, error/retry для failed.
- Completed result поддерживает `Скачать`, `Использовать как референс` (`result:<projectId>`) и `Сохранить в Студию`.
- Форма отправляет в `/api/user/chats/:id/messages`; при несовместимой модели и прикрепленном reference показывает warning и блокирует submit.

StylePreset / Studio:

- Добавлена Prisma модель `StylePreset` и seed стартового набора: 6 avatar presets и 6 location presets с английскими generic prompt fragments.
- Добавлен shared helper `buildStylePresetPrompt(presetPrompt, userPrompt)` и unit-test.
- Public API: `GET /api/public/style-presets?kind=user-avatar|user-location`.
- Admin CRUD: `/api/admin/style-presets` и страница `/admin/style-presets` с заголовком "Шаблоны образов".
- `/studio` генерация образа теперь показывает секцию "Шаблоны" + карточку "Без шаблона"; final prompt собирается как `<preset.promptText> <user prompt>`.

Variations:

- `MediaAsset` получил `parentAssetId` с self relation `onDelete: SetNull`: вариации переживают удаление родителя, но связь обнуляется.
- В карточках ассетов Студии добавлена кнопка "Создать вариацию"; flow запускает `library-generation` через `image-edit` Nano Banana с исходным ассетом как `image_input`.
- Новый ассет, созданный worker'ом после `library-generation`, получает `parentAssetId`; карточка показывает количество вариаций.

Tests/checks:

- Добавлены DB-backed API-тесты для `/api/user/chats` CRUD, `/api/user/chats/:id/messages`, deprecated `/api/user/chat/generate|history`, `/api/admin/style-presets` и `/api/public/style-presets`.
- Локально проходят `npm run build -w @allvision/database`, `npm run build -w @allvision/shared`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`.
- Локально проходят `npm test -w @allvision/shared -- --runInBand chat-models style-presets` и `npm test -w @allvision/worker -- --runInBand asset-reference`.
- DB-backed API-тест `npm test -w @allvision/api -- --runInBand user-chat user-chats style-presets` локально блокируется без Postgres `localhost:5433`, как и прежние DB-backed API-тесты.

Technical debt:

- Multi-input generation через Kling Elements не делали.
- Email/SMTP, ЮKassa sandbox, cleanup временных chat-upload файлов, NSFW-фильтр, voice messages и streaming остались за рамками P8.4.

## Этап P9 ✅

Pro-default, цены = себестоимость, audio overlay, новые image модели в чате, video effects.

Tier UI и цены (Pro по умолчанию):

- `ServiceDetail.tsx` больше не показывает селектор Standard/Pro и две цены — рендерит одну цену из `priceCoinsPro` ("Стоимость подарка: X коинов"). Поле tier в форме скрыто.
- API `POST /api/services/:slug/launch` всегда выставляет `selectedTier = 'pro'` и списывает по `priceCoinsPro ?? priceCoinsStandard ?? priceTokens`; tier-field в `userInputForm` остаётся опциональным для обратной совместимости.
- Shared schema: `validateUserInputForm` больше не требует ровно одного tier-field; `TIER_FIELD_REQUIRED` заменён на `TIER_FIELD_DUPLICATE` (запрет более одного).
- Admin form: лейблы цен — "Цена Pro, коины (используется фронтом)" и "Цена Стандарт, коины (legacy)". `defaultUserInputForm()` теперь возвращает пустой массив (tier не нужен).

Цены = себестоимость PiAPI (обновлённые seed-услуги):

- `revive-old-photo`: nano-banana@2K + kling-3-pro 5s @720p + ffmpeg compose = $1.38 → **110 коинов**.
- `face-in-trend`: Qubico face-swap (~120 frames) + compose = $0.48 → **40 коинов**.
- `kid-cartoon-hero`: nano-banana@1K стилизация + veo-3.1 8s @1080p + compose = $1.02 → **90 коинов**.
- `anniversary-card`: nano-banana@1K + kling-3-pro 5s @720p + compose = $1.36 → **110 коинов**.
- `priceCoinsStandard === priceCoinsPro` во всех 4 услугах, чтобы UI показывал одну цену.
- `seedPilotServices()` упрощён: вместо custom patch-функций (`needsFaceInTrendP7aPatch`, `needsReviveOldPhotoP7aPatch`, `needsPhotoSourceDefaultsPatch`) используется diff-based update — при изменении seed услуги канонически обновляются на проде.

Audio overlay через video-compose (реальный ffmpeg):

- `apps/worker/src/blocks/video-compose.ts` переписан с pass-through на реальный ffmpeg pipeline:
  - Скачивает input video и `audio_source` URL во временные файлы.
  - `filter_complex` строит цепочку `aloop` (если `audio_loop`), `adelay` (offset), `volume`, `afade` (in/out).
  - При `keep_original_audio=true` микшируется с оригинальным звуком через `amix`; иначе аудио заменяет.
  - `-c:v copy`, `-c:a aac 192k`, `-shortest`, `-movflags +faststart` → результат сохраняется в `outputs/{userId}/{projectId}/{stepId}/result.mp4`.
  - При ошибке скачивания или ffmpeg возвращает оригинальное видео без аудио (fallback) и логирует.
- Catalog `video-compose.paramsSchema` расширен: `audio_source` (sourceSelect:audio), `audio_volume` (0-2), `audio_offset_sec`, `audio_fade_in_sec`, `audio_fade_out_sec`, `audio_loop`, `keep_original_audio`. Старый `music` оставлен legacy.

Новые типы userInputForm:

- `audio` — загрузка mp3/wav/ogg/m4a, до 25 MB. В seed `revive-old-photo` и `anniversary-card` имеют комбинированный режим (upload + library).
- `music-select` — выбор из MediaAsset `kind='background-music'`. API резолвит `asset:<id>` в публичный URL перед запуском pipeline.
- `duration` — кнопки выбора (5/8/10 сек по умолчанию), `durationOptions[]` и `defaultDuration`.
- `aspect_ratio` — кнопки выбора (`auto | 9:16 | 16:9 | 1:1 | 4:3 | 3:4`), `aspectOptions[]` и `defaultAspect`.
- Поддержаны в `ServiceDetail.tsx` (FieldControl + ServiceAudioInput), `AdminServiceForm.tsx` (form builder + кнопки добавления + admin options), shared zod schema, API `services launch`.
- Upload middleware: `uploadServiceLaunchInputs` переведён на отдельный `serviceLaunchMulter` с фильтром image+audio MIME.

Новые image модели в чате (Allvision AI):

- В каталог добавлены: `flux-schnell` (~$0.003), `flux-dev` (~$0.025), `flux-pro-ultra` (~$0.06), `flux-kontext-pro` (~$0.04, image-to-image), `midjourney-v6` (~$0.05, experimental), `hidream-i1-full` (~$0.03), `hunyuan-image-3` (~$0.04). Все с описаниями, docs URLs и limits.
- `PiAPIProvider.imageEdit` рефакторен на `IMAGE_EDIT_MODELS_BY_PROVIDER` mapping + новая функция `buildImageEditPayload`. Поддерживает Nano Banana, Flux txt2img/img2img, Midjourney imagine, HiDream, Hunyuan.
- `CHAT_MODELS` расширен 7 новыми image моделями. Тест `chat-models.test.ts` зелёный — все модели существуют в `BLOCK_CATALOG`.

Video-effect блок и Kling AI Effects:

- Новый блок `video-effect` в catalog с моделями `kling-effects` (~$0.35) и `ai-hugs` (~$0.40). Params: `image_url` (sourceSelect:image), `effect_id`, `prompt`, `duration`, `aspect_ratio`.
- Worker: `apps/worker/src/blocks/video-effect.ts`. Зарегистрирован в `BLOCK_REGISTRY` и `PIAPI_BLOCKS`.
- `AIProvider.videoEffect()` добавлен в interface; реализован в `MockAIProvider`, `StubAIProvider`, `PiAPIProvider`. PiAPI payload: `model: 'kling' | 'Qubico/ai-hugs'`, `task_type: 'effects'`, `input.effect = effect_id`.
- Блок доступен в admin pipeline-конструкторе; конкретные `effect_id` админ задаёт вручную (из PiAPI docs).

Тесты/проверки P9:

- `npm.cmd run build` (root) — зелёный (shared, database, api, worker, web).
- `npm.cmd test -w @allvision/shared -- --runInBand` — 20 passed, 5 suites.
- `npm.cmd test -w @allvision/worker -- --runInBand --testPathIgnorePatterns="pipeline-runner|piapi-provider"` — 32 passed, 10 suites.
- `blocks-registry.test.ts` обновлён под 9 блоков (добавлен video-effect).
- DB-backed pipeline-runner и piapi-provider тесты блокируются Postgres `localhost:5433`, как и в предыдущих этапах.

Технические долги P9:

- Реальные `task_type` и payload format для Flux Schnell/Dev/Pro, Midjourney v6, HiDream, Hunyuan Image 3 нужно smoke-протестировать перед публичным запуском новых image моделей в чате — публичные PiAPI docs не всегда точно отражают runtime API.
- PiAPI templates (`video-effect`) добавлены как infrastructure, но конкретные `effect_id` (hug, kiss, dance, balloon explosion и т.п.) не зашиты в каталог. Следующий этап — UI выбора из списка эффектов в admin form и chat.
- Audio файлы пользователей оседают в `user-uploads/user-inputs/...` без TTL-cleanup; нужен периодический job.
- В Studio (`/studio`) не добавлена возможность сохранения пользовательских audio-треков как MediaAsset — пока user audio только разовый upload на услугу.
- ServiceDetail.tsx: `description` `Недостаточно токенов` toast и пара legacy строк всё ещё используют «токены» вместо «коинов»; косметика без функциональной разницы.

## Hotfix P9.1 ✅ — GPT Image 2 timeout

Симптом: услуги на `gpt-image-2` (`single-photo-2017` «Фото в стиле 2к17», `group-photo-2017`) падали на сайте с `PIAPI_NETWORK_ERROR` («Не удалось связаться с AI-провайдером»), хотя в дашборде PiAPI задачи показывались как `Success` — причём по нескольку успешных генераций подряд за один пользовательский запуск.

Причина: GPT Image идёт синхронным OpenAI-совместимым запросом (`/v1/images/generations|edits`), ответ приходит только после генерации изображения. Это регулярно дольше дефолтных 30s `requestTimeoutMs`. `AbortController` рвал соединение, `fetchWithRetry` повторял запрос (`TRANSIENT_RETRIES = 3`), каждый повтор создавал новую успешную (и платную) генерацию на стороне PiAPI, а worker в итоге кидал `PIAPI_NETWORK_ERROR` и возвращал коины.

Фикс (`apps/worker/src/providers/piapi-client.ts`):

- Добавлен отдельный `gptImageTimeoutMs` (env `PIAPI_GPT_IMAGE_TIMEOUT_MS`, по умолчанию `180000`); синхронные GPT Image вызовы используют его.
- `fetchWithRetry` получил per-call опции `{ timeoutMs, retries }`; GPT Image зовётся с `retries: 1`.
- Наш собственный таймаут (`AbortError`) теперь не повторяется, а сразу превращается в `PIAPI_TIMEOUT` — чтобы не плодить дублирующие платные генерации.
- `PIAPI_GPT_IMAGE_TIMEOUT_MS` добавлен в `apps/worker/.env.example` и `infra/prod/.env.example`.

Seed не трогался: услуги `single-photo-2017` / `group-photo-2017` уже корректно используют `gpt-image-2`.

Проверки: `npm.cmd run build -w @allvision/worker` — зелёный; `npm.cmd test -w @allvision/worker -- --runInBand piapi-client` — 5 passed (добавлен тест на no-retry при abort); `blocks-registry asset-reference motion-transfer-block` — 8 passed.

## Этап P9.2 ✅ — Кинематограф: перенос в сцену + возврат tier-выбора

4 новые услуги «перенос себя в фильм/мультфильм» + восстановление пользовательского выбора Standard/Pro.

Новый блок `scene-transfer`:

- Помещает 1–2 людей с фото в референс-сцену, которая может быть **фото-кадром ИЛИ видео-референсом** (`scene_mode: photo|video`). Это обобщение `trend-video-transfer` (тот работает только по видео).
- Standard собирает на `kling-3-omni` (Kling 3.0 Omni: `images[]` + `video`), Pro — на `seedance-2-omni` (Seedance 2.0 Omni: `image_urls[]` + `video_urls[]`). Движок определяется по резолвнутому tier-моделью slug'у (`model: { standard: 'kling-3-omni', pro: 'seedance-2-omni' }` → runner резолвит в строку → блок роутит по `includes('seedance')`).
- Фото-сцена добавляется отдельным image-референсом в конец `images`/`image_urls` (anchor `@image_N`/`@imageN`); видео-сцена идёт в `video`/`video_urls` (anchor `@video`/`@video1`).
- Промпт собирается в `buildScenePrompt`: скрытый admin `base_prompt` + авто-anchor сцены + авто-блок под 1 или 2 персонажей (это и есть «2 промпта под капотом») + `user_prompt` (или `default_user_prompt`, если пользователь ничего не ввёл) + хвост про качество/без вотермарка. Anchors разные под Kling/Seedance.
- Опциональная мультяшная стилизация: при `stylize_characters: true` каждое фото персонажа прогоняется отдельно через `gpt-image-2` (`stylize_prompt`) ДО видео-шага; результаты становятся identity-референсами. Один человек — один вызов, два — два (оптональный второй обрабатывается только при наличии).
- `people_count: auto` определяет 1/2 по наличию `secondary_photo` (на рантайме `{{user.person2}}` резолвится в undefined, если фото не загружено).
- Reuse провайдерных методов `textToVideo`/`imageEdit` (mock/stub/piapi) — новых методов в `AIProvider` не добавлялось. Блок зарегистрирован в `registry.ts` и в `PIAPI_BLOCKS`.

4 услуги в seed (`giftFactoryServices`), все с tier-выбором Standard (Kling 3.0) / Pro (Seedance 2.0):

- `me-in-movie` «Я в фильме» (CINEMA, инструмент): пользователь выбирает режим «По фото»/«По видео» (`scene_mode`), грузит scene_photo ИЛИ scene_video, person1 (обяз.) + person2 (опц.), свой `prompt` (опц.). Standard 120 / Pro 199.
- `me-in-cartoon` «Я в мультфильме» (CINEMA, инструмент): то же + `stylize_characters: true` (gpt-image-2). Standard 140 / Pro 219.
- `kid-in-blue-tractor` «Ребёнок в мультике Синий трактор» (KIDS_HEROES, шаблон): пользователь грузит только person1/person2; сцена и base_prompt зашиты админом (PLACEHOLDER `scene_image`), `stylize_characters: true`, без поля промпта. Standard 140 / Pro 219.
- `me-in-harry-potter` «Я в сцене „Гарри Поттер“» (CINEMA, шаблон): как выше, но live-action (без стилизации). Standard 120 / Pro 199.
- Имена услуг-шаблонов сделаны буквально по запросу пользователя; это РАСХОДИТСЯ с IP-стратегией CLAUDE.md (свои стилизованные миры) — осознанный выбор владельца, юр-риск на нём. Референсы сцен — picsum-плейсхолдеры (`image('cinema-*')`), владелец заменит на реальные кадр/видео и допишет промпты в админке.
- Категория «Кинематограф» (`CINEMA`) добавлена миграцией `20260605120000_cinema_category` в `ServiceCategoryDef` (icon `Film`, sortOrder 5). `kid-in-blue-tractor` оставлен в `KIDS_HEROES` для дискаверабилити; остальные 3 — в `CINEMA`. Перемещается через `/admin/services`.

Возврат выбора Standard/Pro (после P9, где tier-селектор был убран):

- Сделано обратносовместимо: селектор и две цены показываются ТОЛЬКО когда в `userInputForm` услуги есть поле `tier`; услуги без него остаются в P9-логике «только Pro по `priceCoinsPro`».
- `ServiceDetail.tsx`: новый `TierSelector` (две карточки с ценами `priceCoinsStandard`/`priceCoinsPro`), `tier` в стейте (default `standard`), цена и кнопка зависят от выбранного tier, выбранный tier уходит в FormData.
- `POST /api/services/:slug/launch`: читает значение tier-поля → `selectedTier` (`standard`|`pro`) и списывает `priceCoinsStandard`/`priceCoinsPro` соответственно. Без tier-поля — прежний Pro-default. `selectedTier` уже корректно резолвит tier-объекты (`{standard,pro}`/`{{tier_model}}`) в pipeline-runner.

Условная обязательность полей формы (`requiredWhen`):

- В `userInputFieldSchema` добавлено `requiredWhen?: { field, value }`: поле обязательно, когда другое поле имеет заданное значение. Используется для `scene_photo` (обяз. при `scene_mode=photo`) и `scene_video` (обяз. при `scene_mode=video`), т.к. условного показа полей в форме нет.
- Учитывается и на сервере (`fieldRequired` в `services.ts`), и на клиенте (`fieldIsRequired` в `validateClient`).
- В `ServiceDetail` фото-поля теперь группируются по `mediaGroup`: персонажи (без группы) — в общий «Референсы N/M» пикер, `scene_photo` (mediaGroup `scene`) — отдельным аплоад-полем, чтобы кадр сцены не смешивался с лицами.

Загрузка услуг в prod (важно): коммит `52073ac` отключил сидирование услуг на проде (`ensureCatalog` рано выходит при `!includeDevCatalog`), из-за чего `giftFactoryServices` перестали попадать в прод через `node packages/database/dist/seed.js` (prod CMD = `prisma migrate deploy && seed.js && ...`). В P9.2 добавлен **create-only** загрузчик `ensureGiftServices()`, вызываемый в `runSeed()` безусловно. Он создаёт ТОЛЬКО услуги из явного allowlist'а `NEW_SERVICE_SLUGS_TO_CREATE` (4 новые слуга P9.2), и только если их нет в БД. НИКОГДА не апдейтит/не удаляет существующие и НЕ пересоздаёт удалённые админом услуги — каталог управляется через `/admin/services`, лишнее админ удаляет осознанно. При следующем батче услуг: добавить их слуги в allowlist на этот деплой, потом очистить список. Тест-гард P7.1.1 обновлён под контракт: create-allowlisted-missing-only + never-update + идемпотентность. Категория `CINEMA` приезжает миграцией `20260605120000_cinema_category`.

## Этап P9.2.1 ✅ — Хотфиксы scene-transfer (фильм/мультфильм)

- **Баг «Я в мультфильме» (PIAPI_NETWORK_ERROR):** стилизация мультяшек шла через `gpt-image-2` (синхронный OpenAI-эндпоинт, нестабильный — см. P9.1). «Я в фильме» (omni без gpt-image) работал → проблема в самом вызове gpt-image. Стилизация переведена на `nano-banana` (асинхронный unified task API, тот же, что в чате — проверенно стабилен). Дефолт `stylize_model` в блоке тоже `nano-banana`.
- **Условный референс сцены:** добавлены `visibleWhen` (видимость поля по значению другого) и `defaultValue` в `userInputFieldSchema`. Для услуг-инструментов: `scene_mode` по умолчанию `photo`; `scene_photo` виден только при `photo`, `scene_video` — только при `video`. `ServiceDetail` фильтрует скрытые поля (в т.ч. в группах фото) и в рендере, и в `validateClient`; дефолты префиллятся на загрузке услуги.
- **Длительность:** в режиме «По фото» добавлено поле `duration` (5/8/10/15 сек, видимо только при `photo`). В режиме «По видео» длина берётся из видео-референса: блок `scene-transfer` пробит длительность через `ffprobe` (clamp 3–15 сек, фолбэк при ошибке; в `NODE_ENV=test` ffprobe пропускается). Шаблоны тоже получили поле `duration`.
- **Pro временно выключен:** в `option` формы добавлен флаг `disabled`. `TierSelector` рендерит такие опции серыми/некликабельными («скоро»). У всех 4 услуг Pro (Seedance 2.0) помечен `disabled`, оставлен только Стандарт (Kling 3.0); модель в pipeline осталась `{ standard: 'kling-3-omni', pro: 'seedance-2-omni' }` — чтобы включить Pro позже, достаточно снять флаг.
- **Загрузка изменений в прод:** `ensureGiftServices` теперь **upsert** для allowlist-слугов (`NEW_SERVICE_SLUGS_TO_CREATE`): создаёт отсутствующие и обновляет уже созданные 4 услуги до канонического seed-конфига (они активно дорабатываются и ещё не правились в админке). Всё ВНЕ allowlist'а по-прежнему не трогается (удалённые админом услуги не возвращаются). Когда услуги стабилизируются — очистить allowlist. Тест-гард обновлён: на втором прогоне create не вызывается, count стабилен, allowlisted refresh'атся.

## Этап P9.2.2 ✅ — Фиделити персонажа в мультсцене + clean-face в Студии

- **Промпт переноса персонажа.** В блок `scene-transfer` добавлен param `character_prompt` (admin, скрыт): отдельная инструкция о том, КАК переносить человека — фотореализм, чёткое соблюдение лица из референса, естественная интеграция в сцену (масштаб, контактная тень, свет, не плоский cutout) и человеческое движение без мультяшных кривляний. Вшит в `buildScenePrompt` после блока идентичности. У мультуслуг (`me-in-cartoon`, `kid-in-blue-tractor`) `base_prompt` переписан так, что мультстиль применяется к ФОНУ/окружению, а не к человеку, плюс задан сильный `character_prompt`. Это решает кейс «ребёнок получается кривой мультяшкой / плоско вклеен».
- **Студия: движок GPT Image 2 для clean-face.** `POST /api/user/media-assets/generate` принимает `model: nano-banana | gpt-image-2` (стоимость по модели, у обеих ~10 коинов). В `/studio` в модалках «Создать образ» и «Создать вариацию» для `user-avatar` добавлен переключатель движка (`AvatarModelPicker`): «Стандарт (Nano Banana)» / «Чёткое фото (GPT Image 2)». Добавлен StylePreset `avatar-clean-face` («Чёткое фото для анимаций») с промптом под резкое фронтальное лицо крупным планом, ровный свет, нейтральный фон — как качественный референс для будущих анимаций. Идея: юзер делает clean-face в Студии и подставляет его в услуги переноса → лучше держится личность.

Проверки P9.2/P9.2.1/P9.2.2: `npm.cmd run build` для shared/worker/api/web/database — зелёные; `npm.cmd test -w @allvision/shared` — 20 passed; `npm.cmd test -w @allvision/database -- seed` — 4 passed; worker `blocks-registry trend-video-transfer-block scene-transfer-block motion-transfer-block asset-reference text-to-video-block image-edit-block blocks-utils piapi-payloads piapi-provider-kling-omni` — 42 passed (добавлен `scene-transfer-block.test.ts`, 5 тестов; `blocks-registry` обновлён под 12 блоков). DB-backed `pipeline-runner`/`piapi-provider` локально не гоняются без Postgres `localhost:5433`.

Технический долг P9.2:

- Реальный PiAPI-смоук Kling 3.0 Omni / Seedance 2.0 Omni с фото-сценой (image как часть `images`/`image_urls` + @image_N anchor под локацию) не прогонялся — нужен перед платным запуском; payload-формат повторяет уже рабочие omni-вызовы из `trend-video-transfer`/`last-kiss-meteor`.
- Плейсхолдер-сцены (`cinema-blue-tractor-scene`, `cinema-hp-scene`) и picsum-превью заменить на реальные брендовые ассеты; финальные base_prompt'ы шаблонов дописать в админке.
- Для шаблонов сцена пока только photo-mode; admin может переключить `scene_mode: video` + `scene_video` (URL/asset) вручную.

## Этап P9.3 ✅ — Мульти-вывод + услуга «Карусель для поста»

GPT Image fix: `quality` для gpt-image-1/2 нормализуется (`normalizeGptImageQuality`): валидные `auto|high|medium|low`, `standard → medium`, остальное → `auto`. Раньше слали `standard` (значение DALL·E-3) → PiAPI HTTP 400 → общий «техническая ошибка» в Студии. Чинит Студию (GPT Image) и карусель.

Мульти-вывод проекта:
- `Project.resultAssets Json?` (миграция `20260605200000_project_result_assets`) — массив `{ type, url }` для услуг с несколькими результатами.
- `pipeline-runner.normaliseFinalOutput` детектит `output.metadata.slides` (массив URL) и пишет в `resultAssets` (+ `resultImage`/`resultVideo` = первый как обложка). Обычные одно-результатные услуги не затронуты.
- `resultAssets` добавлен в project list/status DTO; web `ProjectStatusResponse`/`ProjectListItem`.
- `ServiceDetail` показывает галерею слайдов (`GenerationGallery`) для завершённого проекта с `resultAssets.length > 1`: сетка превью + скачать каждый.

Блок `carousel-slides`:
- Вход: 1 фото человека + массив текстов слайдов + единый `style_prompt`. На каждый слайд — отдельный вызов GPT Image 2; первый слайд становится style-референсом для остальных (`image_urls`), чтобы палитра/типографика/сетка не «прыгали». Текст слайда рендерится прямо в изображение. Выход: `{ type:'image', url: slides[0], metadata:{ slides:[...] } }`.
- Зарегистрирован в `registry.ts` и `PIAPI_BLOCKS`; `blocks-registry` тест под 13 блоков; добавлен `carousel-slides-block.test.ts` (3 теста).

Поле формы `slides`:
- Новый тип поля `slides` (+ `maxSlides`) в `userInputFieldSchema`. `ServiceDetail.SlidesInput`: селектор числа слайдов (1..max) + динамические textarea на каждый слайд; значение хранится как JSON-массив строк; на сабмите конвертируется в массив в payload.
- Launch валидирует `slides` (массив 1..maxSlides) и кладёт массив в `userInputs`; pipeline берёт `{{user.slides}}`.

Послайдовая цена:
- Услуги со `slides`-полем тарифицируются за слайд: `tokensCost = ценаTier × числоСлайдов` (launch), и цена в UI live-обновляется с числом слайдов.

Услуга `carousel-post` («Карусель для поста», TRENDS_MEMES, 15 коинов/слайд, gpt-image-2, до 10 слайдов) добавлена в seed и в allowlist `NEW_SERVICE_SLUGS_TO_CREATE` (upsert на деплое).

Проверки P9.3: билды shared/database/worker/api/web — зелёные; worker `blocks-registry scene-transfer-block carousel-slides-block` — passed (добавлен carousel тест, registry под 13); shared 20 / seed 4 — passed; `validatePipelineConfig` для carousel-post — OK.

Технический долг P9.3: variable-цена реализована частным случаем по наличию `slides`-поля (не общий механизм); карточка товара (LLM + условная генерация + 4 разнородных вывода) — следующий этап (LLM отложён по решению владельца, промпты пока ручные).

## Этап P9.4 ✅ — Услуга «Карточка товара» (условный мульти-вывод)

Блок `product-card` (один блок = условный роутер, как trend-video-transfer):
- Вход: 1–3 фото товара (`photo1` обяз. + `photo2/3` опц.), `product_name`, массив `outputs` (галочки).
- Условно генерирует только выбранное и возвращает **лейблованный мульти-вывод** `metadata.assets = [{type,url,label}]`:
  - `cover` — обложка (gpt-image-2 по фото).
  - `animation` — лёгкая анимация товара (image-to-video, по умолчанию kling-3-pro; вход — обложка, если она есть, иначе photo1).
  - `ad` — рекламный ролик (seedance-2-omni, `image_urls` = фото товара).
- `description` пока недоступен (нужна текстовая модель) — в форме это отключённая галочка «скоро».
- Промпты обложки/анимации/рекламы имеют дефолты в блоке + admin-переопределение (`cover_prompt`/`animation_prompt`/`ad_prompt`), `product_name` подставляется. Зарегистрирован в `registry.ts` и `PIAPI_BLOCKS`; `blocks-registry` под 14 блоков; `product-card-block.test.ts` (4 теста).

Лейблованный мульти-вывод:
- `pipeline-runner.normaliseFinalOutput` теперь сначала читает `metadata.assets` (массив `{type,url,label}`) → `resultAssets` с лейблами; затем `metadata.slides` (P9.3). Обложка = первый ассет.
- `GenerationGallery` показывает лейбл («Обложка»/«Анимация»/«Реклама») вместо номера, если он есть.

Поле формы `multiselect` (галочки):
- Новый тип `multiselect` + у опций `priceCoins`/`disabled`/`hint`. `MultiSelectInput`: чекбоксы, disabled-опции серые («скоро»), цена на опцию. Значение — JSON-массив выбранных, на сабмите конвертируется в массив.
- Launch валидирует `multiselect` (массив из разрешённых, не-disabled значений; required → ≥1).

Пооутпутная цена:
- Если есть priced `multiselect`-поле, `tokensCost = сумма priceCoins выбранных опций` (launch), и цена в UI live-суммируется. Карточка товара: cover 15 / animation 60 / ad 120 коинов.

Услуга `product-card` («Карточка товара», TRENDS_MEMES, default галочка cover) добавлена в seed и allowlist.

Проверки P9.4: билды shared/database/worker/api/web — зелёные; worker `blocks-registry product-card-block carousel-slides-block scene-transfer-block` — passed (registry под 14, +`product-card-block.test.ts` 4 теста); shared/seed — passed; `validatePipelineConfig` для product-card — OK.

Технический долг P9.4: описание товара ждёт LLM (галочка disabled); пооутпутная/послайдовая цена — частные случаи в launch и UI (по наличию `multiselect`/`slides` поля), не общий движок; реальный PiAPI-смоук Seedance-omni для рекламы товара и kling-3-pro анимации не прогонялся.

## Этап P9.4.1 ✅ — Фикс GPT Image 2 (референсы) + сплит карточки товара

GPT Image 2 настоящая причина (PIAPI_NETWORK_ERROR в услугах, хотя на PiAPI задачи проходят, а в чате gpt-image работает):
- Edits-эндпоинт `/v1/images/edits` (multipart, поле `image`) требует, чтобы БАЙТЫ референса держал сам воркер. Раньше воркер HTTP-скачивал входной `/static`-URL (`this.client.download(publicUrl)`) — а изнутри контейнера достучаться до собственного публичного домена не получается (loopback падает) → PIAPI_NETWORK_ERROR. Nano Banana и чат работают, потому что там воркер ПУБЛИКУЕТ URL, а скачивает его PiAPI, не воркер.
- Фикс: `PiAPIProvider.readImageRefBytes(url)` — для своих `/static/<key>` URL читает файл напрямую из общего локального тома uploads (`UPLOADS_DIR`), а не по HTTP; для внешних URL остаётся `client.download`. `generateGptImage` теперь принимает `images: {buffer,contentType}[]` вместо `imageUrls`.
- Документация PiAPI (https://piapi.ai/docs/gpt-image/gpt-image-api) подтвердила: endpoint/multipart/Bearer — верны; quality допускает `low|standard|high|auto`. Поэтому `normalizeGptImageQuality` исправлен: `standard` валиден (раньше ошибочно мапили в `medium`, которого в списке нет), `medium → high`, прочее → `auto`.

Карточка товара разделена на 2 услуги (общий блок `product-card`):
- В блок добавлены аддитивные пользовательские стили `cover_style`/`animation_style`/`ad_style`: добавляются к базовому admin-промпту, не заменяя каркас. Так каркас «снять рекламу по референсу» остаётся под капотом, а юзер пишет только стиль.
- `product-cover` («Обложка товара»): фото 1–3 + название + `multiselect` [cover 15 / animation 60]. Обложка GPT Image 2, опц. лёгкая анимация (kling-3-pro). Цена за выбранное.
- `product-ad` («Рекламное видео товара»): фото 1–3 + опц. название + `style` (textarea, пусто → дефолтный стиль) + формат + длительность. В pipeline `outputs: ['ad']` зашит, `ad_style: '{{user.style}}'`, `ad_model: seedance-2-omni`. Фиксированная цена 120. Юзер не пишет «сделай видео по референсу» — каркас в блоке.
- Комбинированная `product-card` переведена в `isActive:false` (скрыта), оставлена в seed/allowlist чтобы upsert деактивировал её на проде. `product-cover`/`product-ad` добавлены в allowlist.

Проверки P9.4.1: билды shared/database/worker/api/web — зелёные; worker `piapi-client product-card-block carousel-slides-block blocks-registry image-edit-block` — 17 passed; shared/seed — passed; `validatePipelineConfig` для product-cover/product-ad — OK.

## Этап P9.4.2 ✅ — GPT Image sync эндпоинт ненадёжен -> услуги на Nano Banana

Диагностика по проду (SSH worker-логи): после фикса P9.4.1 скачивание референса больше не падает; теперь падает САМ вызов `generateGptImage` → `fetchWithRetry` с `PIAPI_NETWORK_ERROR: fetch failed`. Ручной `fetch` к `https://api.piapi.ai/v1/images/generations` из контейнера воркера ВИСНЕТ (нет ответа). Вывод: синхронный OpenAI-совместимый эндпоинт gpt-image держит соединение на всю генерацию, и оно рвётся (NAT/gateway long-connection drop) — при этом createTask-модели (nano-banana, omni) отвечают мгновенно и поллятся, поэтому работают. Доки PiAPI (сверены) не дают async/task-API пути для gpt-image — только синхронные `/v1/images/*`.

Решение: услуги переведены с `gpt-image-2` на `nano-banana` (async unified task API, проверенно стабилен):
- `carousel-slides` блок default модель и `carousel-post` seed → `nano-banana`.
- `product-card` блок cover default и `product-cover` seed `cover_model` → `nano-banana`.
- Студия: `AvatarModelPicker` по умолчанию уже `nano-banana`; опция GPT Image помечена «(бета)» с предупреждением о сбоях провайдера.
- В `PIAPI_NETWORK_ERROR` добавлен `cause` (ECONNRESET/UND_ERR/…) для будущей диагностики.

gpt-image остаётся выбираемой моделью в каталоге/админке (вдруг провайдер починит/через другой egress), но дефолты услуг — nano-banana. Технический долг: услуги `single-photo-2017`/`group-photo-2017` всё ещё на `gpt-image-2` (не в allowlist, меняются в админке); если будут падать — переключить на nano-banana в `/admin/services`. Для точного текста на слайдах карусели (слабое место nano-banana) — на будущее overlay текста через ffmpeg/canvas.

Проверки P9.4.2: билды shared/database/worker/api/web — зелёные; worker `carousel-slides-block product-card-block piapi-client blocks-registry` — 14 passed; seed — passed.

## Этап P9.4.3 ✅ — Фикс gpt-image EDIT (ECONNRESET на 15с)

Диагностика по проду: ручной тест показал, что gpt-image GENERATION (JSON) доживает до ~60с и возвращает 200, а EDIT (multipart `/v1/images/edits`) стабильно падает `ECONNRESET` на ~15с — для обоих имён модели (gpt-image-2 и gpt-image-2-preview), значит дело не в имени. JSON пережил 60с простоя → это не общий idle-таймаут, а специфика того, как fetch/undici шлёт multipart (поток без чистого Content-Length, шлюз рвёт на 15с).

Фикс (`PiAPIClient.gptImageEditViaHttps`): edit-запрос теперь идёт через встроенный `node:https` — multipart собирается в один Buffer и отправляется с явным `Content-Length` (как JSON-генерация, не chunked/streamed) + TCP keepalive (`socket.setKeepAlive(true, 10s)`). Generation остался на fetch (работает). Без новых зависимостей (undici в Node 22 не requireable из CJS). gpt-image остаётся в чате Allvision AI и услугах 2к17 для теста; если edit заработает — вернём gpt-image в карусель/обложку (сейчас они на nano-banana).

Проверки P9.4.3: `npm.cmd run build -w @allvision/worker` — зелёный; worker `piapi-client blocks-registry` — 7 passed.

## Этап P9.4.4 ✅ — gpt-image edit: ретраи на ECONNRESET (интермиттентный обрыв)

Лог чата: edit идёт через https-путь (P9.4.3), но иногда падает `gpt-image edit: read ECONNRESET`. При этом часть задач завершается (job 94 — 96с успех) → обрыв **интермиттентный**. Причина: Node `setKeepAlive(enable, delay)` задаёт только начальную задержку (TCP_KEEPIDLE), а интервал (TCP_KEEPINTVL) остаётся OS-дефолтным (~75с), поэтому после первого keepalive-зонда возникает длинный простой и шлюз рвёт соединение во время ожидания ~60-100с ответа.

Фикс: `gptImageEditViaHttps` теперь оборачивает `gptImageEditOnce` в ретраи (до 4 попыток) именно на connection-reset (`ECONNRESET|socket hang up|EPIPE|ETIMEDOUT|ECONNREFUSED`); каждая попытка — свежее соединение с keepalive (начальный зонд снижен до 5с). Так как обрыв интермиттентный, несколько попыток обычно дают успешную. Прочие ошибки (HTTP 4xx, timeout) не ретраятся. Минус: при обрыве PiAPI мог успеть сгенерировать (списание у провайдера), так что ретраи могут стоить лишних генераций в флапающие периоды — это плата за работоспособность edit; пользовательские коины при этом не дублируются (одна job).

Проверки P9.4.4: `npm.cmd run build -w @allvision/worker` — зелёный; worker `piapi-client` — 5 passed.

## Этап P9.4.5 ✅ — gpt-image edit: ретраи раннего обрыва (фикс PIAPI_SYNC_LOST)

Симптом (прод, 12.06): «Фото в стиле 2к17» падает с `PIAPI_SYNC_LOST` («connection was lost and the task never appeared in provider history»), 316 секунд, $0.00, без taskId. Дашборд PiAPI подтверждает: задача 12.06 вообще не создавалась — последний gpt-image-2 успех был 11.06.

Точный разбор (по таймингам и дашборду PiAPI, без SSH на прод):

- 316с = ~16с на сам запрос + ровно 300с (5 мин) history recovery. То есть это снова знакомый РАННИЙ RST на ~15-й секунде multipart edits-запроса, ДО первого байта ответа.
- Ключевое наблюдение: PiAPI отвечает на edits только когда изображение готово (40–100с), а в LLM-истории дашборда `Создано == Обновлено` — запись появляется в момент завершения. Раз задача в истории так и не появилась, запрос не дошёл до бэкенда PiAPI вовсе: ничего не генерировалось и не биллилось.
- После перехода на стратегию «recovers through history» дефолт `PIAPI_GPT_IMAGE_EDIT_RETRIES` стал 1 — то есть ретраев НЕ БЫЛО вообще: ставка была на history recovery, но при раннем обрыве восстанавливать нечего (задачи не существует). Итог: один RST = 5 мин пустого recovery → PIAPI_SYNC_PENDING → ещё 10 мин reconciler → SYNC_LOST + refund. Хрупкость соединения не лечилась, а превращалась в 15-минутное зависание.
- Размер тела ни при чём: референс после нормализации был 310 KB (hard cap из P9.4.x), а обрыв всё равно случился. Доки PiAPI перепроверены: async/task-пути для gpt-image по-прежнему нет, edits — только multipart.

Фикс:

- `ProviderError` получил опциональную `meta` (транспортные детали для решений выше по стеку).
- `gptImageEditOnce` отслеживает `responseStarted` (первый байт ответа = запрос точно дошёл и обработан) и `elapsedMs`; кладёт их в `meta` ошибки.
- `gptImageEditViaHttps`: дефолт попыток — 4 (`PIAPI_GPT_IMAGE_EDIT_RETRIES` переопределяет), backoff 2с/5с/10с. Ретраится ТОЛЬКО ранний обрыв: connection-ошибка (ECONNRESET/EPIPE/hang up/ECONNREFUSED/ETIMEDOUT) + ответ не начался + прошло ≤30с. Поздний обрыв или наш таймаут НЕ ретраятся (генерация могла начаться и будет забиллена) — для них остаётся history recovery, как раньше.
- Если ВСЕ попытки оборвались рано, на ошибку вешается `meta.neverReachedProvider = true`, и `isRecoverableGptImageTransportError` возвращает false: проект сразу честно фейлится с refund (`PIAPI_NETWORK_ERROR`) вместо 15 минут на 95% и SYNC_LOST.
- `PIAPI_GPT_IMAGE_EDIT_RETRIES=4` задокументирован в `apps/worker/.env.example` и `infra/prod/.env.example`.

Осознанный риск: если ранний RST всё же случился ПОСЛЕ регистрации задачи у провайдера (не наблюдалось), ретрай создаст дубль-генерацию ~$0.03–0.10 за наш счёт; коины юзера не дублируются (одна job). Структурная причина обрывов — нестабильный путь RU ВМ → api.piapi.ai для долгих multipart-соединений (похоже на DPI/шлюз); если флапы участятся, кардинальное решение — зарубежный relay/proxy для PiAPI-трафика.

Проверки P9.4.5: `npm.cmd run build -w @allvision/worker` — зелёный; worker `piapi-client` — 12 passed (4 новых теста: ретрай раннего RST, neverReachedProvider после всех попыток, нет ретрая после начала ответа, нет ретрая таймаута); полный worker suite без DB-backed — 85 passed (pipeline-runner/piapi-provider требуют Postgres `localhost:5433`, локально не поднят).

## Этап P9.5 ✅ — Live-обновление UI, retry-кнопки, лимиты файлов, безопасные ретраи createTask

Задача 1 — «генерация завершилась, но UI не обновляется без F5». Корневая причина (универсальная для всех экранов): в Redux-store не вызывался `setupListeners`, и у RTK Query API не были включены `refetchOnFocus`/`refetchOnReconnect`. Когда юзер уходил на другую вкладку (например, на дашборд PiAPI), браузер тротлит фоновые таймеры — поллинг почти останавливался, а на возврат вкладки рефетча не было. Фикс:

- `apps/web/src/store/index.ts`: `setupListeners(store.dispatch)`.
- `refetchOnFocus: true` + `refetchOnReconnect: true` на `projectsApi` (services/studio/project-page), `userChatApi` (чат), `accountApi` и `authApi` (баланс/дашборд). Теперь фокус/реконнект форсят свежий запрос.
- ServiceDetail: поллинг списка генераций больше не привязан к активной вкладке. Введён `shouldPoll = hasActiveProject || launchStartedLock` (есть незавершённый проект ИЛИ только что запустили) → 3s polling, результат догоняет и на вкладке «Услуга».
- Studio history: добавлен 3s polling, пока есть `PENDING/PROCESSING` проект (раньше не поллился вовсе).
- Project-page и чат уже поллили по статусу — оставлены, но теперь дополнительно ловят возврат на вкладку.

Задача 2 — явная кнопка «Попробовать снова» при ошибке. Была пропущена только в ServiceDetail `GenerationCard` (показывался лишь warning). Добавлена кнопка, которая переключает на вкладку «Услуга» и скроллит к форме (значения формы сохраняются в стейте). На project-page, в Студии и чате retry уже был.

Задача 3a — явные лимиты файлов в UI + клиентская проверка размера (раньше для фото её не было — юзер ждал серверный reject):

- ServiceDetail: фото `JPG, PNG или WebP, до 15 МБ`, аудио `MP3, WAV или OGG, до 25 МБ` показываются прямо под зоной загрузки; при превышении — мгновенная ошибка, файл не принимается. Видео-лимит уже показывался. Лимиты не строже серверных multer-фильтров.
- Чат (`InputSourcePicker`): добавлена клиентская проверка 25 МБ (совпадает с `MAX_CHAT_INPUT_SIZE`), текст лимита там уже был.

Задача 3b — безопасные ретраи при обрыве «до старта генерации» для unified-моделей (nano-banana, kling, omni, seedance...). `PiAPIClient.fetchWithRetry` получил раздельные счётчики: `retries` (HTTP 5xx, ответ пришёл = запрос дошёл) и `connectionRetries` (transport-обрыв, fetch бросил, ОТВЕТА не было = задача не зарегистрирована, повтор безопасен). `createTask` теперь `{ retries: 1, connectionRetries: 3 }`: до 3 попыток ТОЛЬКО на transport-обрыв; HTTP-ответы и наш AbortController-таймаут не повторяются (задача могла создаться → не плодим дубль-генерации). gpt-image edit retry-логика (P9.4.5) не тронута. Списание коинов остаётся одно на job, refund на FAILED — ретраи внутри одной job, дублей запросов/списаний нет.

Проверки P9.5: `npm.cmd run build -w @allvision/worker` и `-w @allvision/web` — зелёные; worker `piapi-client` — 14 passed (2 новых теста: retry createTask на transport-обрыв, НЕ retry на HTTP 5xx); полный worker suite без DB-backed — 87 passed (pipeline-runner/piapi-provider требуют Postgres `localhost:5433`, локально не поднят).

## Этап P9.6 ✅ — Формат кадра (aspect ratio): omni следует загруженной сцене, а не форсит 16:9

Симптом: видео-генерации (cinema/scene-transfer на Kling 3.0 / Seedance Omni) выходили в 16:9 независимо от выбранного формата.

Корневая причина: в `buildTextToVideoPayload` для omni-веток (`kling-3-omni`, `seedance-*-omni`) формат шёл через `providerAspectRatio(value, fallback='16:9')` — любой `auto`/пусто превращался в жёсткие 16:9. Это отличалось от `image-to-video` Kling, который при неизвестном формате ОПУСКАЕТ `aspect_ratio` и даёт модели взять формат из референса. У omni референс (загруженный кадр/видео сцены) есть всегда, но его формат игнорировался.

Фикс (worker, доезжает на прод):

- Добавлен `explicitAspectRatio(value)` — возвращает формат только при явном выборе юзера (не `auto`/пусто).
- В omni-ветках `buildTextToVideoPayload` (`kling-3-omni` и seedance при `mode='omni_reference'`/`-omni`) `aspect_ratio` теперь отправляется ТОЛЬКО при явном выборе; при `auto` поле опускается → модель берёт формат из загруженной сцены. Для чистого text-to-video без референсов (seedance text_to_video, veo, sora, wan, hailuo) сохранён дефолт 16:9 через `providerAspectRatio`.
- `scene-transfer` runSeedance: дефолт `'9:16'` → `'auto'` (согласовано с runKling), чтобы при «авто» формат брался из сцены, а не хардкодился.

Поведение по контракту юзера: если в форме есть поле формата и юзер выбрал конкретный (9:16/16:9/1:1...) — он и уходит в PiAPI; если выбрал «Авто» или поля формата нет (`{{user.aspect}}` → undefined → auto) — omni следует загруженной сцене, чистый t2v дефолтит 16:9.

Долг/прод-нюанс: дефолт поля «Формат кадра» у уже существующих cinema-услуг (`me-in-movie`, `me-in-cartoon`, `me-in-harry-potter`, `kid-in-blue-tractor`) в seed остался прежним (`16:9`/`9:16`). Эти услуги НЕ в `NEW_SERVICE_SLUGS_TO_CREATE`, поэтому seed их не обновляет — менять дефолт на «Авто» нужно в `/admin/services`, если хочется чтобы по умолчанию формат брался из сцены. Сам выбор «Авто» уже работает корректно благодаря worker-фиксу. gpt-image услуги (`road-camera-couple`, `single-photo-2017`) не тронуты: им нужен конкретный размер через `gptImageSizeForAspect`.

Проверки P9.6: worker `piapi-payloads scene-transfer-block` — 24 passed (3 новых теста: omit aspect при auto для Kling/Seedance omni, явный выбор сохраняется, pure t2v дефолтит 16:9); `npm.cmd run build -w @allvision/worker` — зелёный.

## Этап P9.7 ✅ — Все услуги уходят с gpt-image-2 на nano-banana (надёжность)

Диагностика по проду (SSH, чтение БД/логов): падает РОВНО `gpt-image-2`. За 14 дней — 17 success / 16 failed / 3 timeout_pending ≈ **47% фейлов**. Все падения — `ECONNRESET` на синхронном multipart `/v1/images/edits` (RU ВМ → api.piapi.ai рвёт долгое соединение, DPI/шлюз). Async-модели (nano-banana, seedance, sora, kling) надёжны: не-gpt падения — это легитимный `CONTENT_MODERATION`. Reconciler корректно фейлит зависшие SYNC_PENDING через 10 мин и возвращает коины (проверено: refund есть), но UX — 10–15 мин на 95% перед фейлом.

Решение (по согласованию с владельцем): все услуги переведены с `gpt-image-2` на `nano-banana` (Gemini, async task API). Доки PiAPI: nano-banana-2 resolution `1K/2K/4K` (макс 4K), aspect_ratio поддерживает 1:1/3:4/9:16/16:9/auto, image-to-image есть. nano-banana и надёжнее, и дешевле ($0.06–0.12 vs $0.10 + брак).

Прод-БД (изменено вручную через psql, т.к. услуги не в seed-allowlist и seed их не перезаписывает):

- 8 услуг переведены `gpt-image-2` → `nano-banana`: `single-photo-2017`, `group-photo-2017`, `group-photo-2017-copy-copy`, `last-kiss-meteor-copy`, `road-camera-couple`, `carousel-post`, `product-cover`, `product-card`. Бэкап pipelineConfig сохранён в `shared/pipeline-backup-*.tsv`.
- Фото-услуги (image-edit) получили `resolution: '4K'` (наилучшее качество).
- `single-photo-2017`: пофикшен **захардкоженный** `aspect_ratio: '16:9'` → `'{{user.aspect}}'` — это была причина «формат не меняется» на флагмане (поле `aspect` есть, дефолт 3:4, но в пайплайн уходило 16:9).

Код (доедет деплоем):

- `carousel-slides` и `product-card`: дефолт модели `gpt-image-2` → `nano-banana`; cover/слайды получили `resolution: '2K'` (раньше дефолтили в 1K, без качества).
- `PIAPI_GPT_IMAGE_HISTORY_RECOVERY_MS` дефолт 5мин → 2мин: при потере gpt-image edit (остаточный путь в Студии/чате-бете) worker не держит concurrency=1 пять минут впустую и UI не висит так долго.
- Seed-источник: все `gpt-image-2` → `nano-banana`, фото-услуги `resolution: '4K'` (для свежих установок; прод управляется в админке).

Aspect с nano-banana проверен по коду: `buildImageEditPayload` шлёт `aspect_ratio` при явном выборе и опускает при `auto` (тогда следует входному изображению) — формат юзера (9:16/16:9/1:1/3:4) уходит корректно.

UI-зависание: основная причина (услуги сайта на gpt-image → путь SYNC_PENDING) устранена — nano-banana падает/завершается быстро, без 5-мин recovery и 10-мин reconciler. Остаточный gpt-image только в Студии/чате (бета, опционально); для него ужат recovery-таймаут.

Прод-env (`PIAPI_SYNC_PENDING_FAIL_AFTER_MS=600000`) НЕ менялся (не дал авто-классификатор как ручную правку прод-конфига); при желании можно опустить в `shared/.env` до ~120000 для ещё более быстрого фейла остаточного gpt-image.

Проверки P9.7: `npm.cmd run build -w @allvision/database -w @allvision/worker` — зелёные; worker `carousel-slides product-card blocks-registry piapi-payloads` — 26 passed. Seed-тест локально падает на устаревшем Prisma-клиенте (`stylePreset is not a function`, известный Windows EPERM на `prisma generate`), не связано с правками.

## Этап P9.8 ✅ — Cinema-режимы, стартовый баланс 0, фикс карусели

**Задача 1 — «Я в фильме» / «Я в мультфильме»: режим фото/видео → промпт(дефолт)/фото.**
На проде эти услуги остались на старом конфиге (`scene_mode: photo|video`), хотя seed-источник уже был переделан на правильный дизайн (`generation_mode: prompt|photo`, без видео). Причина: услуги не в `NEW_SERVICE_SLUGS_TO_CREATE`, поэтому seed их не перезаписывает на деплое. Блок `scene-transfer` уже умеет `generation_mode`. Привёл прод к seed-версии: сгенерировал SQL из `giftFactoryServices` (точное соответствие, без ручного перевода) и применил через psql (`infra/prod/cinema-mode-fix.sql`, бэкап `shared/cinema-backup-*.tsv`).
- `me-in-movie`: `generation_mode` (По промпту — дефолт / По фото), `person1` опционален, `scene_photo` виден в фото-режиме, `prompt` обязателен в промпт-режиме. Промпт-режим → Seedance 2.0 t2v, фото-режим → Kling 3.0 оживляет кадр. Видео-режим убран.
- `me-in-cartoon`: то же + `cartoon_visual_mode` (дефолт **`realistic`** — «максимально реалистичный перенос персонажа в мультмир») и `cartoon_style` (5 стилей). Блок резолвит `cartoon_visual_mode={{user.cartoon_visual_mode}}`.
Seed уже корректен — менять не пришлось. Фронт data-driven (visibleWhen/requiredWhen, select), деплой не требуется.

**Задача 2 — стартовый баланс 25 → 0.**
- `auth-service.ts`: дефолт `WELCOME_TOKENS_BONUS ?? 25` → `?? 0`; при 0 транзакция `welcome_bonus` не создаётся.
- `.env.example`, `infra/prod/.env.example`: `WELCOME_TOKENS_BONUS=0`. Прод `shared/.env` правится операционно (было 25).
- UI: `HeroSection` убрал «25 токенов после регистрации» и CTA «Создать первый бесплатно» → «Создать подарок»; `CTASection` тот же CTA.
- Тесты: `auth.test.ts` (баланс 0, нет транзакций), `account.test.ts` (вместо welcome_bonus — ручная `topup`-транзакция).

**Задача 3 — карусель: «1 картинка вместо 5» + переделка качества.**
Корневой баг: каждый слайд `provider.imageEdit` писал в один путь `outputs/.../{stepId}/result.jpg` (stepId одинаковый для всех слайдов блока) → слайды перезаписывали друг друга, и все 5 `resultAssets` указывали на один файл (5 копий последнего). Подтверждено на проде: `resultAssets` = 5 одинаковых URL. Фикс: уникальный `stepId` на слайд (`{stepId}-slide-N`) через расширенный `scaledContext`. Тот же баг был в `product-card` (animation/ad оба `result.mp4`) — тоже исправлен (`{stepId}-cover|animation|ad`).
Промпт слайда переписан по фидбэку: человек как чистая PNG-вырезка без фона сбоку (не в рамке/карточке), дизайнерский фон во весь кадр, сильная современная типографика (жирный заголовок + читаемый текст), высокое качество фото/кожи/ткани, одежда сохраняется, единый шаблон по всем слайдам. Дефолт resolution слайдов/обложки поднят на 2K.

Технический долг P9.8: точный рендер текста на слайдах — слабое место nano-banana; на будущее overlay текста через ffmpeg/canvas. Прод-env `WELCOME_TOKENS_BONUS` и рестарт api — операционно.

Проверки P9.8: `npm.cmd run build -w @allvision/worker -w @allvision/api -w @allvision/web` — зелёные; worker `carousel-slides product-card blocks-registry` — 11 passed. API-тесты (auth/account) требуют Postgres `localhost:5433`, локально не гоняются.

## Этап P10 ✅ — SEO: технический фундамент, мета, структурированные данные

Аудит выявил: в коде был зашит чужой домен `allvision.studio` (реальный — `allvision-pulse.ru`) в `layout` metadataBase/OG и `sitemap` → битые canonical/OG/карта сайта; не было `robots.txt`; страницы услуг отдавали сырой slug в title («Услуга single-photo-2017»); sitemap брал статический legacy-список вместо реальных услуг; не было JSON-LD и canonical.

Сделано (фазы 1–3):
- `apps/web/src/lib/seo.ts` — единый `SITE_URL` (env `NEXT_PUBLIC_SITE_URL`, дефолт `https://allvision-pulse.ru`), `pageMetadata()` (canonical+OG+Twitter), `PUBLIC_API_URL` для серверных fetch.
- `layout.tsx`: metadataBase/OG на правильный домен, дефолтные keywords, `verification.yandex/google` из env (опускаются, если пусто), googleBot директивы.
- `robots.ts` (новый): открыта витрина, закрыты `/dashboard /admin /ai /studio /profile /api /mock-payment` и auth; sitemap+host.
- `sitemap.ts`: реальный домен + услуги из `/api/services`, тренды, сценарии, статические страницы.
- `services/[slug]/page.tsx`: `async generateMetadata` тянет услугу из `/api/services/:slug` → настоящие title/description/OG/canonical; раньше был сырой slug.
- Мета через `pageMetadata` на главной, services, pricing, trends, about, contacts, scenarios (для client-страницы scenarios добавлен `scenarios/layout.tsx`).
- JSON-LD: `components/seo/JsonLd.tsx` + `lib/structured-data.ts` — Organization+WebSite(SearchAction)+FAQPage на главной (FAQ из `landingFaqs`), Service+Offer (цена в RUB, 1 коин≈1₽) и BreadcrumbList на страницах услуг.
- Dockerfile.prod/compose: build-args `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_YANDEX_VERIFICATION`, `NEXT_PUBLIC_GOOGLE_VERIFICATION` (NEXT_PUBLIC инлайнятся при сборке web). env-примеры обновлены.
- `docs/SEO.md` — пошаговая инструкция по Яндекс.Вебмастер (приоритет РФ) + Google Search Console + Метрика, способы верификации (DNS TXT рекомендуется — без пересборки; либо мета-тег через env+ребилд, либо HTML-файл в `public/`).

Долг (фазы 4–5): подключить аккаунты вебмастеров и Метрику (у владельца их пока нет), заменить picsum-превью на брендовые ассеты, контент под long-tail.

Проверки P10: `npm.cmd run build -w @allvision/web` — зелёный; `/robots.txt` и `/sitemap.xml` генерируются, `/services/[slug]` стал dynamic (async-мета). Домен в дефолте корректен даже без прод-env.

## Этап P10.1 ✅ — Фикс реконсайлера (фото вместо видео) + промпт «стадиона»

Задача: услуга «Случайный кадр со стадиона» (`last-kiss-meteor-copy`, пайплайн image-edit → text-to-video → video-compose) иногда возвращала фото вместо видео, хотя видео-генерация выполнялась.

Корень (по проду): не интермиттентность генерации, а **гонка PiAPI-реконсайлера**. У упавшего проекта: step_3 (image-edit) `completed` → картинка, step_1 (text-to-video) остался `processing`, step_2 pending, но проект помечен COMPLETED с resultImage = картинка первого шага. Воркер прервался деплоем mid-pipeline; реконсайлер в `recoverPiAPIProject` перебирал refs (AIUsageLog с taskId + aiProviderJobId) и финализировал проект по ПЕРВОМУ завершённому рефу — а это была уже потреблённая картинка image-edit, не активный видео-шаг.

Фикс (`apps/api/src/services/piapi-recovery-service.ts`): добавлен `isConsumedIntermediateStep()` — реф пропускается, если его шаг в `stepProgress` уже `completed` И не является последним шагом пайплайна. Так реконсайлер больше не закрывает многошаговый проект промежуточным результатом; берётся активный/финальный шаг. Для одношаговых gpt-image (SYNC_PENDING) поведение не меняется (единственный шаг = последний).

Промпт/модель (прод-БД, `infra/prod/stadium-prompt-fix.sql`): модель кадра `flux-schnell`(txt2img, игнорировал фото юзера) → `nano-banana` (берёт фото). Промпты image-edit и text-to-video переписаны: спокойный, милый, чуть стервозный/невозмутимый взгляд (не радость/не активная поддержка), кадр телетрансляции с сильным зумом ИЗДАЛЕКА (компрессия телевика, размытая толпа, как оператор приблизил с другого конца стадиона), а не съёмка вблизи/селфи.

Про-длительностное ценообразование (задача из того же запроса): уже полностью реализовано и задеплоено (`610996e`) — админ-форма даёт цену на каждую длительность (`durationPrices`), сервер списывает `selectedDurationPrice` при наличии, иначе цену тира. Модельная себестоимость из реестра на списание НЕ влияет (только калькулятор маржи, подписана «Себестоимость»). Кода не требовалось; ни у одной услуги `durationPrices` пока не заполнены.

Проверки P10.1: `npm.cmd run build -w @allvision/api` — зелёный.

## Этап P10.2 ✅ — Прокси для gpt-image edits (зарубежный egress)

Диагноз подтверждён эмпирически (тест с прод-ВМ через `curl`): синхронный `/v1/images/edits` (multipart) к `api.piapi.ai` напрямую с РФ-ВМ интермиттентно рвётся (ECONNRESET, exit 56) — в тесте 1 из 2 прямых запросов упал, оба через зарубежный прокси (Amsterdam VPS, aeza) прошли (200). Короткие запросы (account/info, createTask) и `/v1/images/generations` (JSON) стабильны и напрямую. Значит проблема именно в длинном multipart-соединении на РФ-egress.

Фикс: добавлена опциональная переменная `PIAPI_PROXY_URL` (формат `http://user:pass@host:port`). При заданной — gpt-image **edits** идут через HTTP-CONNECT прокси (`https-proxy-agent` v7, classic moduleResolution → нужна именно v7, не v9 exports-only). Применяется ТОЛЬКО к синхронному edits-вызову в `PiAPIClient.gptImageEditOnce`; async-модели (createTask/poll: nano-banana, kling, seedance) идут НАПРЯМУЮ, чтобы не зависеть от прокси (если VPS упадёт — ломается только gpt-image, остальное живёт). На проде поднят tinyproxy на VPS Amsterdam, закрыт по IP прод-ВМ + BasicAuth.

Проверки P10.2: `npm.cmd run build -w @allvision/worker` — зелёный; worker `piapi-client` — 14 passed; сетевой тест direct-vs-proxy на edits подтвердил фикс.

P10.2 fix: `https-proxy-agent` отсутствовал в собранном worker-образе (монорепо-резолв в Docker) → воркер падал `MODULE_NOT_FOUND` в крэш-луп. Откатил воркер на предыдущий образ для восстановления прода, затем **переписал прокси на встроенные node-модули** (`http` CONNECT-туннель + `tls.connect` через сокет, `createConnection` в `https.request`) — внешняя зависимость убрана полностью, отсутствие пакета больше не может уронить воркер. `PIAPI_PROXY_URL` работает так же (только gpt-image edits).

P10.2: все услуги переведены на gpt-image-2 (по решению владельца, прокси-маршрут стабилен). Прод-БД: 13 услуг (image-edit/carousel-slides/product-card cover/me-in-cartoon stylize_model) переключены `nano-banana` -> `gpt-image-2` text-replace'ом (видео-модели kling/seedance/omni не тронуты; бэкап `shared/pipeline-backup-nano2gpt-*.tsv`). Проверено воркер-уровнем: `generateGptImage` edits через прокси -> `OK 50s` с URL. Добавлен `gptImageJsonViaHttps`: generations (text-to-image: карусель 1-й слайд, обложки с 1 фото) тоже идут через прокси-туннель при заданном `PIAPI_PROXY_URL`. Seed-источник синхронизирован (model-значения -> gpt-image-2). Риск: прокси-VPS теперь SPOF для ВСЕХ image-услуг; при его падении image-генерации встанут до восстановления или отката на nano-banana.

## Этап P13 ✅ — Realtime-обновление UI (SSE) + танцующие животные (DreamActor v2 / Kling O3 / фикс Seedance omni)

**Задача 1 — «UI не обновляется после завершения генерации без F5, особенно при нескольких».**

Корень: страничный поллинг фрагментирован. `useListProjectsQuery` вызывается с разными аргументами (`limit: 40` на услуге, `30` в Студии, `20` в проектах) — это РАЗНЫЕ кэш-записи RTK Query; условие «поллить или нет» каждая страница выводит из СВОЕГО (возможно устаревшего) кэша, а клиентская навигация между страницами по умолчанию не рефетчит. Сценарий бага: запустил генерацию на странице A → перешёл на B → B видит кэш без активных проектов → не поллит → результат появляется только после F5/фокуса окна.

Фикс — push-события поверх поллинга (поллинг оставлен как фолбэк):

- `packages/shared/src/events/project-events.ts` — контракт: канал Redis `allvision:project-events`, payload `{ projectId, userId, status, progress, kind: status|progress }`, `parseProjectEvent()`.
- Worker: `apps/worker/src/utils/project-events.ts` — fire-and-forget паблишер (lazy IORedis, ошибки глотаются — при недоступном Redis остаётся поллинг). Хуки: `pipeline-runner` публикует PROCESSING (status), каждый `persistProgress` (kind=progress, с userId), COMPLETED (status); `markProjectFailed` (processors/base) публикует FAILED после транзакции refund'а.
- API: `GET /api/user/events` (`apps/api/src/routes/user/events.ts`, requireAuth) — SSE-стрим. ОДИН Redis-подписчик на процесс, роутинг события по `userId` в открытые соединения. `Cache-Control: no-cache, no-transform` (иначе compression() буферизует стрим!), `X-Accel-Buffering: no` (nginx не буферизует), heartbeat 25с (docker nginx `proxy_read_timeout 3600s`, но хостовый может резать 60с).
- Web: `apps/web/src/components/realtime/ProjectEventsBridge.tsx` — монтируется в `UserWorkspaceShell` при наличии user; EventSource с withCredentials; на `kind=status` сразу инвалидирует `projectsApi` (`Project` + `ProjectStatus:id`), тэги чата (`Chats`/`Chat` — сообщения встраивают проект) и account/auth (refund меняет баланс); `kind=progress` — троттлинг 2с. На CLOSED (напр. 401 по истечении access-токена) — silent refresh + реконнект с backoff; при реконнекте полная инвалидация (добор пропущенного).
- `projectsApi` получил `refetchOnMountOrArgChange: 15` — навигация на страницу с кэшем старше 15с рефетчит список (лечит сценарий «стухший кэш без активных проектов → нет поллинга» даже без SSE).

**Задача 2 — танец животного по референсу (fal.ai).**

Ресёрч fal (схемы через `fal.ai/api/openapi/queue/openapi.json?endpoint_id=...`, цены через каталог/страницы):

- **DreamActor v2 (ByteDance)** `fal-ai/bytedance/dreamactor/v2` — $0.05/с, официально «Great performance for non-human and multiple characters», reference image «real people, animation, pets»; вход image_url + video_url (driving ≤30с), ПРОМПТА НЕТ, `trim_first_second` (default true). Выход `video.url`.
- **SCAIL-2** `fal-ai/scail-2` (июнь 2026, новейшая) — $0.20/с, end-to-end анимация без скелета, `subject_type: human|animal` (SAM3), mode animation|replacement, 16fps, ≤10с, 512p/704p.
- **Kling O3 (Omni 3) Reference V2V** `fal-ai/kling-video/o3/{pro,standard}/video-to-video/reference` — $0.168/$0.126 за сек: РЕАЛЬНЫЙ omni-референс Kling на fal (в отличие от text-only `v3/pro/text-to-video`): `video_url` (@Video1, 3–15с, 720–3840px, ≤200MB) + `image_urls` (@Image1.., ≤4) + prompt; `keep_audio` default true — сохраняет оригинальный звук референса.
- Wan 2.7 `reference-to-video` существует ($0.10/с, биллит input+output), Wan Motion остаётся оптимизированным Wan 2.2 Animate — новее для motion-transfer у Wan ничего нет.

**Найденный критический баг Seedance omni (объясняет «танец не с референса и левая музыка»):** fal `bytedance/seedance-2.0/reference-to-video` принимает референс-видео ТОЛЬКО как массив `video_urls` (@Video1..), а `fal-provider.textToVideo` отправлял `video_url` (ед. число) и блокировал `video_urls` через NEVER_FORWARD → референс-видео вообще не доходило до модели; плюс `generate_audio` у Seedance default TRUE → модель сочиняла свою музыку. Это же касалось scene-transfer с видео-сценой.

Изменения:

- `fal-provider.textToVideo`: для endpoint'ов `reference-to-video` — `video_urls` массивом, `generate_audio` явно false (переопределяется параметром), duration строкой ('4'..'15'); для остальных (Kling O3 v2v) — прежний одиночный `video_url`.
- `localizeInputUrls(falInput, endpoint)`: для Seedance reference-to-video видео-референс downscale'ится ffmpeg'ом под лимит 834x1112 (`fitVideoWithin`, только downscale, чётные размеры; наши trend-ассеты транскодированы до 1280 и без этого получали бы отказ). При ошибке — исходный файл.
- `MOTION_ENGINES` + `FAL_MODELS`: добавлены `dreamactor-v2`, `scail-2`, `kling-o3-omni`, `kling-o3-omni-std` (+ payload-ветки: dreamactor без промпта; scail с subject_type/mode/512p|704p).
- `trend-video-transfer`: `subject_type=animal` → **DreamActor v2** (было wan-motion), при отказе (кроме таймаута) фолбэк на Wan Motion; режим `kling_omni` с референсом → **Kling O3 Reference V2V** (было: редирект на Seedance) — `keep_audio` сохраняет музыку тренда; дефолтные промпты переписаны с якорями по докам (@Video1/@Image1/@Image2, субъект-нейтрально «subject» вместо «person»); seedance aspect default '9:16' → 'auto'.
- `apps/worker/src/blocks/reference-audio.ts` — `muxReferenceAudioIfSilent()`: если движок вернул немое видео (DreamActor/Wan/Seedance c generate_audio=false), ffmpeg муксит аудиодорожку референс-видео в результат (локальные /static читаются с диска — loopback из контейнера не работает); есть звук в результате → не трогаем; любая ошибка → немой результат, генерация не падает. Применён к motion_transfer, kling_omni, seedance_omni при `keep_original_audio !== false`. В NODE_ENV=test — no-op.
- Каталог shared: модели DreamActor v2/SCAIL-2 в motionTransferModels, Kling O3 x2 в textToVideoModels; `kling_omni_model` default → `kling-o3-omni`; описания subject_type/motion_model/режимов обновлены.

Проверки P13: shared — 33 passed + build; worker — 17 suites / 98 passed (новые: `fal-provider-reference-payload.test.ts` — video_urls/generate_audio/duration для Seedance, video_url для Kling O3, минимальный payload DreamActor, subject_type SCAIL-2; обновлён `trend-video-transfer-block` — animal→dreamactor с фолбэком и без фолбэка на таймаут, kling_omni→O3), DB-backed (pipeline-runner/piapi-provider/asset-reference) локально не гоняются без Postgres 5433; билды shared/worker/api/web — зелёные.

Технический долг P13: реальный fal-смоук DreamActor v2 / Kling O3 v2v / Seedance reference (с video_urls) не гонялся — проверить на проде первой генерацией с котом; SSE не публикуется из API-шного piapi-recovery-service (восстановленные по таймауту проекты доедут поллингом/refetchOnMountOrArgChange); PiAPIProvider не знает новые слаги (prod на fal — не критично); хостовый nginx не проверен на буферизацию SSE (X-Accel-Buffering: no должен сработать, иначе события доедут пачкой по heartbeat'у).

## Хотфикс P13.1 ✅ — Kling O3 duration строкой + Wan 2.7 Reference-to-Video в каталоге

Прод-инцидент сразу после деплоя P13 (по worker-логам, SSH): Kling O3 Reference V2V отбил запрос `422 literal_error: duration "Input should be '3'..'15'", input: 10` — duration у O3 строковый enum, как у Seedance (в P13 строку сделал только для Seedance). Роутинг kling-3-omni→O3 и загрузка референса в fal storage при этом отработали. Фикс: `textToVideo` шлёт duration строкой и для `video-to-video/reference` (clamp 3..15).

Wan: проверено по каталогу fal — у Wan 2.7 НЕТ animate/motion-control эндпоинта (Animate остался на 2.2 / Wan Motion), самый новый Wan-путь переноса движения — **Wan 2.7 Reference-to-Video** (`fal-ai/wan/v2.7/reference-to-video`): reference_image_urls + reference_video_urls (motion + appearance), prompt обязателен, duration integer 2..10, aspect БЕЗ 'auto', биллинг $0.10/с за (вход + выход). Добавлен как модель `wan-2.7-reference`: FAL_MODELS + маппинг полей в textToVideo (reference_*_urls), делегация из motionTransfer (доступен в выпадающем списке «Модель переноса движения» админки), ModelOption в motionTransferModels, `reference_*_urls` добавлены в URL_INPUT_KEYS (локализация /static). Дефолт для животных остаётся DreamActor v2; wan-2.7-reference админ выбирает в услуге при желании.

Проверки P13.1: worker `fal-provider-reference-payload trend-video-transfer-block blocks-registry` — 18 passed (новые ассерты: duration '8' строкой у O3, reference_*_urls + integer duration 10 + опущенный aspect 'auto' у Wan 2.7); билды shared/worker — зелёные.

## Этап P13.2 ✅ — Животные: поза в полный рост + Wan 2.7, раздельные модели, БЕЗ фолбэков; фикс «подвисания» запуска

Мотив (владелец): «ублюдский блюр» в результатах Wan — хвост встроенного motion-промпта «...minimal blur...» модель понимала как указание ДОБАВИТЬ размытие; плюс тихий фолбэк на Wan 2.2 маскировал отказы выбранной модели (в дашборде fal видно Wan 2.2 вместо выбранной).

trend-video-transfer (режим «Повторить движение»):

- **Встроенный «анатомический» промпт удалён полностью** (subjectMotionPrompt/MOTION_QUALITY_TAIL с «minimal blur»). Теперь только admin-промпты: `prompt` — для человека/unset, новый `animal_prompt` — для животных (человеческие промпты услуг «person identity, stable face» к животным НЕ применяются; пусто = без подсказки, у Wan 2.7 нейтральный дефолт задаёт провайдер).
- **Все фолбэки убраны** (isKlingCharacterImageRejection, dreamactor→wan, kling→wan): выбранная модель либо отрабатывает, либо генерация падает с честной ошибкой и refund.
- **Ветка животных**: промежуточный шаг — `animal_pose_model` (default gpt-image-2, quality=high) ставит питомца В ПОЛНЫЙ РОСТ на задних лапах (весь корпус в кадре, тот же окрас/морда, позитивный промпт без негаций/blur-слов; переопределение `animal_pose_prompt`, выключатель `animal_pose_enabled`), затем движение переносит `animal_motion_model` (default **wan-2.7-reference**).
- **Ветка человека**: `human_motion_model` (default kling-motion-3.0-pro). `motion_model` остался только для случая «Кто на фото» не задан.
- Все 5 новых параметров — в каталоге с выпадающими списками моделей (админ меняет модель для людей и животных раздельно в /admin/services).

Прод-БД (`infra`-скрипт `trend-animal-update.sql`, бэкап `shared/trend-backup-p13-2-*.tsv`): в `face-in-trend-pro` («Я в трендовом видео») добавлено поле формы `subject_type` (Человек/Животное, после transferMode) + `params.subject_type={{user.subject_type}}` в шаге 1 — раньше выбор животного там был недоступен; в трёх «Трендовых танцах» обновлена подсказка поля (Wan Motion → поза + Wan 2.7). Новые block-параметры в БД не прописывались — работают code-дефолты, админ меняет через форму услуги.

UI «подвисание» при нажатии «Создать»: multipart-аплоад фото занимает секунды, а визуальной реакции кроме мелкого спиннера не было. Теперь ДО сетевого запроса UI мгновенно переключается на вкладку «Генерации» и показывает карточку «Отправляем запрос… Загружаем файлы на сервер»; при ошибке запуска — возврат на форму + toast (`launchInFlight` в ServiceDetail, `LaunchingCard` в GenerationsPanel).

Проверки P13.2: worker `trend-video-transfer-block fal-provider-reference-payload blocks-registry` — 18 passed (тесты фолбэков заменены на «ошибка пробрасывается, ровно один вызов»; новые: поза+wan-2.7 для животного, оверрайды human/animal моделей и pose toggle, изоляция human-промпта от животных); билды shared/worker/web — зелёные; SQL применён на проде (4 услуги has_subject_field=t/has_subject_param=t).

Технический долг P13.2: реальный смоук цепочки «фото кота → gpt-image поза (проверить и identity, и что fal-обвязка imageEdit не отбрасывает quality=high у edit-эндпоинта) → wan 2.7 reference» — первой генерацией на проде; цены услуг не пересчитывались под подорожавшую цепочку животных (gpt-image high ~$0.19 + wan 2.7 ~$0.10/с × (вход+выход) — заметно дороже старого wan-motion $0.05/с, при 10с референсе ≈ $2.2 себестоимости).

## P13.3 ✅ — Верификация цепочки животных: поза ДОХОДИТ до Wan; animalPoseImage в metadata

Проверка подозрения «фото из GPT Image не попадает в видео-шаг» (по прод-данным, SSH): НЕ подтвердилось. Пайплайн 4d4ff0b6 (17:13): gpt-image-2 edit создал `step_1/result.jpg` (291 730 байт — кот реально стоит в полный рост на задних лапах, студийный фон), а в payload wan-2.7-reference `reference_image_urls` — data-url ровно этого размера (389k символов base64 от 291 730 байт). Исходное фото юзера (549 290 байт → data-url 732k) уходило только в gpt-image. Ощущение «сделано с исходника» объясняется тем, что Wan берёт из reference-фото только внешность, а кадр/сцену строит по референс-видео (плюс была генерация 14:20 на СТАРОМ коде до деплоя — wan-motion).

Для прозрачности: блок теперь кладёт URL промежуточной позы в metadata результата (`animalPoseImage`) — видно в «Детали генерации» на странице проекта и в админке. Тест обновлён (11 passed).

## P13.4 ✅ — Тренды: subject-кнопки над запуском, без выбора режима, поза с исходным фоном

- **face-in-trend-pro («Я в трендовом видео»)**: select «Способ генерации» (Kling Motion / Face-swap) убран из формы как устаревший; `params.mode` жёстко `motion_transfer` (прод-БД, SQL `trend-form-update.sql`, бэкап `shared/trend-backup-p13-4-*.tsv`).
- **«Кто на фото?» (Человек/Животное)**: у всех 4 услуг поле перенесено в КОНЕЦ формы (рендерится прямо над кнопкой запуска) и сделано `required` — кнопка «Создать» заблокирована до выбора. UI: select с ≤3 короткими опциями теперь рендерится крупными кнопками-переключателями (как duration/aspect), без автовыбора; выпадашка остаётся для длинных списков. Затрагивает и cinema-селекты (generation_mode и т.п.) — там кнопки с префиллом defaultValue.
- **Поза животного с сохранением фона**: `defaultAnimalPosePrompt` переписан — животное встаёт в полный рост В ТОМ ЖЕ месте фото (диван → стоит на диване, стол → на столе), фон/свет/поверхность сохраняются; если место непонятно — реалистичная подходящая поверхность. Описание `animal_pose_prompt` в каталоге обновлено.

Проверки P13.4: worker `trend-video-transfer-block` — 11 passed; билды shared/worker/web — зелёные; SQL применён (у всех 4 услуг last_field=subject_type/required=true, transferMode отсутствует, step1 mode=motion_transfer).

## P13.5 ✅ — Ретраи скачивания с fal CDN, quality-валидация чужих моделей, Seedream 4/4.5, обложки дублей

**Прод-инцидент «Небесный ракурс» (05.07, проект e4cba8d4):** fal завершил gpt-image edit за 150с и списал $0.21, а воркер упал на СКАЧИВАНИИ результата с fal CDN (`FalClient.download` → `UND_ERR_CONNECT_TIMEOUT`, знакомый флап egress РФ-ВМ → fal.media из P11.4) → проект FAILED с refund'ом, оплаченный результат выброшен. Фиксы:

- `FalClient.download` — внешний цикл ретраев целого захода (свежий коннект, DNS может отдать другой CDN-хост): до `FAL_DOWNLOAD_RETRY_ATTEMPTS` (default 5) заходов с бэкоффом 3с/10с/25с/60с. Ретраятся transport-обрывы/таймауты/5xx; 4xx (файл удалён) — нет. Env задокументирован в обоих .env.example. Тест `fal-client-download.test.ts` (4 теста).
- `FalProvider.run` catch: если fal успел завершить задачу (poll вернул COMPLETED), в `AIUsageLog` пишется ФАКТИЧЕСКАЯ стоимость (fal-reported → fal-priced → estimate) вместо $0.00 и `recoverableOutputUrl` (fal CDN URL результата — можно забрать вручную из `/admin/usage`). Раньше учёт расходов занижался на все «успех на fal, но фейл у нас» случаи.

**Валидация «чужих» модельных параметров (баг: seedream блокировался quality от gpt):** live-валидация конструктора гоняла ВСЕ параметры шага по enum'ам каталога; поле `quality` (enum gpt-image auto/low/medium/high) при выбранном Seedream скрыто из формы, но легаси-значение (напр. `standard` PiAPI-эпохи) валило пайплайн ошибкой, которую нельзя исправить без переключения на gpt. Фикс в shared `validatePipelineConfig`: `omitForeignModelParams` — параметр, объявленный в `requiredParams`/`optionalParams` у ДРУГИХ моделей блока, но не у выбранной, исключается из валидации (на рантайме он инертен). Для выбранной модели невалидные значения ловятся как раньше; неизвестная модель/плейсхолдер — валидация не ослабляется. Тест в `admin-services-validation.test.ts`.

**Seedream 4.0 / 4.5 добавлены для теста (запрос владельца):** на fal есть `fal-ai/bytedance/seedream/v4/{text-to-image,edit}` и `v4.5/{text-to-image,edit}` (схемы сверены с openapi): вход `prompt` + `image_urls` (до 10), формат — ТОЛЬКО через `image_size` (square_hd/portrait_16_9/.../auto_2K/auto_4K), полей aspect_ratio/resolution НЕТ. Цены ~$0.03 (4.0) / ~$0.04 (4.5) за картинку. Добавлены slug'и `seedream-4`/`seedream-4.5` в FAL_MODELS, каталог imageEditModels и FAL_PRICING_ENDPOINTS.

**Новые paramProfile `gpt-image`/`seedream-size` (aspect → image_size):** попутно закрыт баг аудита — gpt-image-2 на fal тоже НЕ имеет aspect_ratio (только image_size), т.е. выбор формата юзером молча игнорировался (image_size оставался auto). Теперь наш aspect конвертируется в словарь image_size (1:1→square_hd, 9:16→portrait_16_9, 16:9→landscape_16_9, 3:4/4:3→portrait/landscape_4_3); у seedream-профиля «Авто» уходит как auto_2K/auto_4K по параметру resolution. Явный `image_size` из панели «Критерии модели» имеет приоритет над конвертацией.

**Баг обложек при дублировании услуг:** `POST /:id/duplicate` копирует URL превью как есть — оригинал и копия делят ОДИН файл; смена/удаление обложки у копии физически удаляла общий файл → у оригинала «пропадала» обложка. Фикс: `deletePreviewFileIfUnreferenced` — файл превью удаляется только когда на его URL не ссылается ни одна услуга (`previewImage`/`coverImage`/`previewVideo`); update собирает старые URL и чистит их ПОСЛЕ записи в БД.

Проверки P13.5: shared — 34 passed (7 suites); worker без DB-backed — 101 passed (17 suites, добавлен `fal-client-download`); билды shared/worker/api/web — зелёные. DB-backed API-тесты (`admin-services`) локально не гоняются без Postgres `localhost:5433`, как в прошлых этапах. Смоук Seedream 4/4.5 и проверку формата gpt-image-2 (image_size) — первой генерацией на проде.

Долг из аудита 05.07 (НЕ закрыт этим этапом, требует отдельного захода): (1) scene-transfer фото-режим на `kling-3-omni` шлёт image_urls на text-to-video эндпоинт БЕЗ полей референсов — фото юзера игнорируются; (2) Kling v3 i2v требует `start_image_url` (мы шлём `image_url`) и duration СТРОКОЙ — все нереференсные видео-вызовы шлют duration числом (Kling '3'..'15', v2.5 '5'|'10', veo '4s/6s/8s') → вероятные 422 на fal-пути; (3) ffprobe длительности референса идёт по HTTP-URL (loopback из контейнера не работает) → `duration_from_reference` молча падает на фолбэк + 10с задержки; (4) Wan 2.7 при «Авто» даёт 16:9 (enum без auto); (5) DreamActor v2 лимит фото 1920×1080 < нашего downscale 2560; (6) SSE-мост не инвалидирует `UserMediaAsset` — новый образ в Студии не появляется без перезахода.

**P13.5.1 — прокси-фолбэк скачивания с fal CDN.** Второй инцидент (проект dca5b165, «Трендовое движение #4»): DreamActor сгенерировал видео ($0.25), но ВСЕ 5 заходов скачивания упали `UND_ERR_CONNECT_TIMEOUT` — файл живёт на КОНКРЕТНОМ хосте `v3b.fal.media`, и когда прямой маршрут к нему лежит, ретраи напрямую бесполезны (свежий DNS не помогает). Проверено с прод-ВМ: напрямую connect-timeout, через зарубежный прокси P10.2 — HTTP 200 за 12с. Фикс: `FalClient.download` при заданном `FAL_PROXY_URL` (fallback `PIAPI_PROXY_URL` — на проде уже задан) пускает нечётные заходы через HTTP CONNECT-туннель (`downloadViaProxy`: встроенные node-модули, до 3 редиректов, копия проверенного туннеля из piapi-client — намеренно не общий модуль, чтобы не трогать хрупкий gpt-image путь). Чередование direct/proxy переживает падение любой из двух дорог. Тесты: `fal-client-download` — 6 passed (2 новых: фолбэк на прокси при мёртвом прямом маршруте; без прокси поведение прежнее).

## Этап P14 ✅ — Админ-мониторинг запуска (подписки, балансы, сроки, ошибки)

Предзапусковый дашборд «что можно проебать на запуске» в `/admin/monitoring` (пункт «Мониторинг» в группе «Аналитика» сайдбара, иконка Gauge).

Бэкенд `apps/api/src/routes/admin/monitoring.ts` (`adminMonitoringRouter`, requireAuth+requireAdmin, зарегистрирован в admin/index):
- `GET /api/admin/monitoring` возвращает `{ indicators, auto, errors, generatedAt }`.
- **Ручные индикаторы** хранятся JSON-массивом в `Setting` под ключом `MONITORING_INDICATORS` (без миграции — как `MODEL_PRICE_OVERRIDES`/`USD_TO_RUB`). Гибкая схема: `label`, `category`, `note`, `url`, опц. отслеживание даты (`trackDate`/`expiresAt`/`warnDays`) И/ИЛИ баланса (`trackBalance`/`balance`/`balanceUnit`/`warnBalance`), ручной оверрайд статуса (`manualStatus: auto|ok|warn|down`). Health считается на сервере (`computeIndicator`): дата (просрочено→down, ≤warnDays→warn), баланс (≤0→down, ≤warnBalance→warn), берётся худший; `manualStatus≠auto` перебивает. Один индикатор может показывать и дату, и баланс.
- `PUT /api/admin/monitoring/indicators` — заменяет весь список (валидация zod, новым генерится uuid, проставляется updatedAt).
- **Автопроверки** (каждая с 6с таймаутом и фолбэком, параллельно): `ssl` (TLS-коннект к домену, читает `valid_to` сертификата, ≤14 дн→warn), `whois` (TCP :43 к `whois.tcinet.ru` для .ru/.su/.рф, парс `paid-till`, ≤30 дн→warn), `captcha` (POST на Yandex SmartCaptcha `/validate` с заведомо неверным токеном: `status:"failed"`⇒сервис жив⇒ok; выключена⇒warn; ключа нет при enabled⇒down), `falBalance` (reuse billing-логики из diagnostics, ≤0→down, <FAL_BALANCE_MIN_USD→warn). Домен из `MONITORING_DOMAIN`/`NEXT_PUBLIC_SITE_URL`/`PUBLIC_API_URL`, дефолт `allvision-pulse.ru`.
- **Ошибки генераций за 24ч**: `Project status=FAILED` за сутки (до 100) + счётчики failed/completed + агрегат `byCode`; на каждый проект — user email/id, услуга, tier/стоимость, `errorCode`/`errorMessage`, ввод (`userInputs`/`inputText`/`inputImages`), до 5 связанных не-success `AIUsageLog` (model/block/status/errorCode/errorMessage/taskId/costUsd).

Фронт `apps/web/src/app/(admin)/admin/monitoring/page.tsx` + слайс `admin-monitoring-api.ts` (зарегистрирован в store): компактные тайлы автопроверок с цветовым health, карточки ручных индикаторов по категориям (оплачено до / осталось N дней / баланс / заметка / ссылка на кабинет), инлайн-редактор (Настроить→добавить/удалить/сохранить, чекбоксы дата/баланс, `<input type=date>`, статус вручную), панель ошибок с байджами byCode и раскрывающимися деталями (кто/почему/что вводил/вызовы AI, ссылки на проект и пользователя). Поллинг 60с. Health-цвета: ok=emerald, warn=amber, down=red, unknown=slate.

Деплой P14: ручной через SSH (без git — экономия Actions-минут), in-place в `current` релиз: tar 6 изменённых файлов → extract в `/opt/allvision-studio/current` → `docker compose build api web` → `up -d --force-recreate --no-deps api web`. Healthcheck зелёный; `/api/admin/monitoring` отдаёт 401 без auth (роут жив), TLS-cert (GlobalSign до 14.10.2026) и WHOIS (`paid-till` 2027-03-29) читаются из api-контейнера в прод-egress, `/admin/monitoring` резолвится (307→login). Билды api/web — зелёные. Изменения закоммичены локально БЕЗ push (push в main триггерит платный Actions-деплой).

Долг P14: капча-тайл покажет «выключена» пока не заданы `YANDEX_SMARTCAPTCHA_SECRET_KEY`/`CAPTCHA_ENABLED`; балансы Яндекс ВМ / прокси-VPS / СМС-сервиса и даты их оплаты вводятся вручную (API этих провайдеров не подключены) — админ заводит их как ручные индикаторы; при следующем git-деплое P14 доедет автоматически (файлы в git).

## Возврат к Studio (2026-08-25) — Academy выведена из продукта

По решению владельца проект уроков (Allvision Academy, этапы A1–A13.2) признан неподходящим и
полностью выведен из прода. Продукт снова — **Allvision Studio**, AI-фабрика цифровых подарков.

**Что сохранено.** Весь код Academy остался в git: ветка `academy` и тег `v0.3-academy-final`
(оба в origin). Вернуться можно в любой момент — вместе с ним лежат миграции A1–A13, поэтому
восстановление схемы возможно даже после удаления таблиц (данные — только из дампа, см. ниже).

**Откат кода.** `main` приведён к дереву тега `v0.2-allvision-studio-final` одним коммитом
(без force-push, история цела). Проверено: все 58 коммитов после тега были чисто Academy —
код услуг, реестр блоков, pipeline-runner, fal/PiAPI-слой, админка Studio реворком **не
менялись**, поэтому откат ничего полезного не теряет. Исключение из отката — каталог
`packages/database/prisma/migrations/`: миграции A1–A13 сохранены как исторический факт
(они уже записаны в `_prisma_migrations` на проде), а поверх добавлена миграция удаления.

**Услуги уцелели.** Реворк был аддитивным и таблицу `Service` не трогал: на момент отката
прод отдавал 45 активных услуг (`GET /api/services`) — все кастомные, собранные в админке
(«Фото в стиле 2к17», трендовые танцы, кинематограф, бизнес-услуги), вместе с категориями
`PHOTO`/`DANCING`/`INSTUMENTS`/`BUISNES` из `ServiceCategoryDef`. Витрина была скрыта только
фронтовым middleware (A2.5 редиректил `/services` → `/` c 301) — после отката она открыта снова.

**Миграция `20260825120000_drop_academy`** приводит прод-БД обратно к схеме Studio:
1. `User.role` `PARENT|TEACHER|METHODIST` → `USER`. **Это обязательный шаг, а не косметика**:
   после реворка новые регистрации создавали `PARENT`, а Prisma-клиент Studio такого значения
   enum не знает и падает при чтении пользователя.
2. `Payment.purpose = LESSON_PACKAGE` → `TOPUP`, исходное назначение уходит в
   `metadata.legacyPurpose` (финансовая запись сохраняется, enum чистится).
3. Удаляются проекты генераций Academy (`Project.mode` in `character-profile`,
   `academy-generation`, `lesson-lab`). `AIUsageLog.projectId` = `ON DELETE SET NULL`, поэтому
   учёт расходов на AI не теряется. Studio-режимы (`service`, `free-chat`, `library-generation`,
   `test-run`) не затронуты.
4. Удаляются `MediaAsset` с `kind LIKE 'academy-%'` (учебные фоны/реквизит/NPC).
5. DROP 38 таблиц Academy и 13 enum-типов, DROP 4 колонок `MediaAsset.generation*`.
6. `Role` и `PaymentPurpose` пересоздаются без Academy-значений (в Postgres нет `DROP VALUE`),
   строго ПОСЛЕ шагов 1–2.
7. `Setting.company_name` → `Allvision Studio` (prod-seed идемпотентен и существующие настройки
   не переписывает, поэтому имя нужно поправить явно).

**Операционное (вне миграции, делается на ВМ):**
- **Дамп БД снимается ДО деплоя** — миграция необратима:
  `docker exec allvision-studio-postgres pg_dump -U allvision allvision | gzip > /opt/allvision-studio/shared/backup-before-academy-drop-$(date +%F).sql.gz`
- После успешного деплоя удаляется закрытое хранилище детских данных:
  `sudo rm -rf /opt/allvision-studio/shared/private-uploads` (фото детей, референсы персонажей,
  детские генерации, вложения диалогов, подтверждения выплат — записи БД уже удалены миграцией).
- Контейнер `livekit` снимается автоматически: deploy делает `up -d --remove-orphans`, а в
  compose тега v0.2 сервиса `livekit` нет. Хостовый nginx может сохранить неиспользуемый
  `location /livekit/` — он безвреден, убирается при случае.
- Academy-переменные в `shared/.env` (`CHILD_PHOTOS_DIR`, `LIVEKIT_*`, …) остаются: 
  `sync-prod-env.sh` только добавляет недостающие ключи и лишние не удаляет. Безвредны.

**Долг:** файлы Academy-генераций в `shared/uploads` (учебные фоны из общей медиатеки) остаются
на диске как сироты — записи БД удалены, ссылок нет; чистятся вручную при необходимости.
