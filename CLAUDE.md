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
