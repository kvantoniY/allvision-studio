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

## Этап E13 ✅ — Скорость клипа: «растянуть» перестало означать «обрезать»

Последний невыполненный пункт спецификации редактора. В E12 ручка на краю клипа умела
только обрезку: растянуть трёхсекундный кусок на шесть было нельзя, а замедлить — тем более.

Скорость живёт на медиа-слое (`speed`, 0.25–4), а не на клипе: рендер работает со слоями,
и знание, которого нет у слоя, до ffmpeg просто не доедет. Границы взяты из того, что умеет
ffmpeg без артефактов — звук ускоряется фильтром `atempo`, а он меняет темп не больше чем
вдвое за проход, поэтому 0.25 и 4 набираются двумя ступенями. Дальше пришлось бы городить
третью, а голос к тому моменту уже перестаёт быть голосом.

Ключевое различие, которое пришлось развести по всему контракту: **обрезка задана в секундах
файла, а дорожка — в секундах ролика**. При скорости 2 секунда на шкале съедает две секунды
записи. Из этого следуют все правки:

- `sliceLayer` (разрез клипа на стыке) умножает смещение и длину окна на скорость — иначе
  вторая половина клипа, попавшего поверх стыка, отматывала бы видео назад;
- `sceneDurationSec` делит окно обрезки на скорость: ускоренный кусок занимает меньше экрана;
- `sourceTimeAt` (перемотка предпросмотра) умножает — плеер и ffmpeg обязаны сходиться;
- `trimClip` и `splitClip` в редакторе пересчитывают то же самое при перетаскивании ручек
  и разрезе под курсором.

Единственная точка, где скорость превращается в число, — `layerSpeed()`: у роликов,
записанных до этого этапа, поля нет вовсе, а через схему проходит не каждый прочитанный слой.

Рендер: `setpts=PTS/S` для картинки и цепочка `atempo` для звука; из файла читаем
`durationSec * S` секунд. Кадры не выбрасываются и не дублируются — только пересчитываются
метки времени, а ровный `fps` в конце цепочки приводит результат к частоте ролика. Звук
ускоряется вместе с картинкой: иначе на ускоренном клипе речь разъехалась бы с губами.

Предпросмотр отдаёт скорость браузеру (`video.playbackRate`), но секунду в файле по-прежнему
считаем мы — иначе плеер показывал бы не тот кадр, что окажется в экспорте.

В инспекторе клипа появились ступени 0.25× … 4× — сразу под длительностью, потому что меняют
именно её: кусок записи остаётся тем же, меняется, за сколько он проигрывается, и клип на
дорожке становится короче или длиннее. Так это работает в любой монтажке.

Осознанно не сделано: скорость отдельных дорожек музыки и голоса. Ускоренная фонограмма
меняет высоту звука и почти никогда не нужна, а клип со своим звуком (видео на дорожке)
скорость и так отыгрывает.

Проверки E13: `shared` — 113 passed (12 suites, +4 теста: ускоренный клип занимает столько,
сколько поставили; разрез ускоренного клипа попадает в нужную секунду файла; замедленный
растягивает тот же кусок; длительность ролика считается по шкале, а не по файлу);
`worker` без DB-backed — 153 passed (21 suite, +4 теста на `-t`, `setpts`, две ступени
`atempo` и на то, что обычный слой команду не меняет); билды shared/worker/web — зелёные.

## Этап E14 ✅ — Место на экране: свёрнутое меню, компактная панель ИИ, превью на телефоне

Три правки по итогам работы в редакторе: везде не хватало места.

**Меню свёрнуто в колонку иконок.** `DashboardSidebar` получил режим `rail`, который
включается на маршрутах `/editor`. Свёрнутая колонка — 64 px иконок; полное меню при
наведении выезжает ПОВЕРХ страницы отдельным слоем внутри того же `fixed`-контейнера.
Ключевое: раскладка не пересчитывается — место занимает только свёрнутая колонка, поэтому
холст не прыгает при наведении на меню. Ширина отступа контента переключается в
`UserWorkspaceShell` вместе с режимом.

**Панель ИИ ужата и разделена на три под-вкладки** («Своя» / «Услуги» / «Мои»). Раньше
подборка готовых услуг висела прямо в форме генерации и съедала половину панели — форма не
помещалась на экран, кнопка запуска уезжала под сгиб. Услуги — отдельное занятие, поэтому
у них своя вкладка (`SceneGenerator` получил проп `tab`).

Сама форма собрана плотнее:

- заголовок «Сгенерировать нейросетью» убран — то же самое написано на вкладке;
- главный референс и слоты модели слиты в ОДНУ строку квадратов: это ответ на один вопрос
  «от чего считаем», а было два блока с заголовками и пояснениями;
- под строкой одна строка-подпись вместо трёх абзацев;
- чипы выбора референса и места результата сведены в один ряд («Выделенный · Кадр сцены ·
  Без референса → Новым слоем · Заменить»);
- категория стала двумя иконками и встала в один ряд с моделью и шестерёнкой настроек;
- описание сцены — две строки вместо трёх, кнопка запуска во всю ширину.

Расширенные настройки как жили в модальном окне, так и живут: у части моделей их полтора
десятка, в панели им места нет.

**Медиатека разделена на вкладки** «В проекте» и «Студия». Загруженные кадры и образы Студии
приходят из разных мест и живут своей жизнью — в общей куче они мешали друг друга искать.
Кнопка загрузки показывается только во вкладке проекта, бейдж «Студия» на плитках больше не
нужен.

**Телефон.** Превью перекрывало шкалу: холст считает свой размер сам, и на узком экране мог
вылезти за колонку. Исправлено тремя вещами:

- у контейнера кадра появился `overflow-hidden` — холст физически не может накрыть соседей;
- редактор на телефоне больше не пытается уместить всё в один экран без прокрутки: страница
  скроллится, а превью занимает фиксированную долю (`46dvh`), поэтому шкала и настройки
  остаются достижимы;
- колонки переставлены под палец: инструменты → кадр → панель инструмента → настройки клипа.

Плюс кнопка «во весь экран» в транспорте — и на телефоне, и на компьютере. Разворачивается
порталом, а не CSS: иначе холст остался бы внутри колонки со всеми её ограничениями по высоте
и «весь экран» показал бы тот же маленький кадр. Выход — крестиком или Esc.

Проверки E14: билд `@allvision/web` — зелёный. Логику это не трогает (контракт таймлайна,
рендер и API не менялись), поэтому новых тестов нет; проверять — глазами на проде.

## Этап E15 ✅ — Звук как в монтажке и живой слайдер на главной

**Звуковые дорожки: волна, резка, своя музыка.**

У дорожки появился конец — `durationSec` в контракте таймлайна. Без верхней границы трек
нельзя разделить: второй фрагмент звучал бы поверх первого до конца ролика. Пусто — как
раньше, до конца файла или ролика.

- Рендер: `atrim=start=..:end=..` вместо одного `start`; для зацикленной дорожки эта же
  граница обрывает бесконечный вход. Затухание привязано к концу САМОЙ дорожки, а не
  ролика — у фрагмента он раньше, и общий хвост уводил бы в тишину не тот кусок.
- Предпросмотр: фрагмент замолкает на своей секунде.
- Резка под курсором (`splitAudioTrack`): хвост продолжает файл ровно с той секунды, где
  кончилась голова. Затухание на месте разреза снимается — иначе на стыке двух кусков,
  стоящих вплотную, звук проваливался бы в тишину и возвращался. Повтор у обоих кусков
  выключается: после разреза это уже не «песня на весь ролик», а фрагменты с границами.
- Оба края дорожки тянутся мышью: левый режет начало (уезжает и позиция, и точка входа в
  файл), правый задаёт длину.

**Звуковая волна** (`useWaveform` + `Waveform`): файл скачивается один раз на вкладку,
декодируется Web Audio и сворачивается в 600 пиков; рисуем canvas, а не сотню `<div>` —
полоса перерисовывается на каждом кадре перетаскивания. Показываем ровно тот кусок файла,
который звучит: волна начинается с секунды обрезки и кончается вместе с фрагментом, иначе
картинка врала бы. Пики считаем в браузере, а не на сервере: это ещё одна колонка в БД и шаг
в загрузке ради картинки, которую браузер строит за полсекунды. Не получилось (CORS, битый
файл) — полоса просто остаётся без волны.

**Своя музыка** загружается тем же путём, что и запись голоса (`uploadMedia` → дорожка
`music`), название берётся из имени файла. Библиотека владельца никуда не делась, но пустая
библиотека больше не тупик.

**Слайдер на главной** переписан. Было: вся лента сдвигалась на несколько десятков пикселей —
жест есть, ощущения листания нет, ничего не появляется и не исчезает. Стало: перекрёстное
затухание, привязанное к пальцу. Чем дальше протянули, тем сильнее проявляется соседний слайд
(и подъезжает, и подрастает) и тем прозрачнее текущий; боковое превью, которое вот-вот встанет
в центр, по дороге растворяется.

Порог листания — доля ширины карточки, а не абсолютные пиксели: «половина экрана» должна
значить одно и то же на телефоне и на мониторе. При отпускании затухание сначала докручивается
до конца и только потом меняется активный слайд — если поменять индекс сразу, новый слайд
появится с полной непрозрачностью и вместо проявления получится скачок.

Проверки E15: `shared` — 113 passed, `worker` без DB-backed — 156 passed (+3 теста на
фрагменты звука: границы `atrim`, затухание по концу фрагмента, целая дорожка команду не
меняет); билды shared/worker/web — зелёные.

## Хотфикс E16 ✅ — Сборка ролика падала на смешанной склейке (xfade + concat)

Симптом с прода: экспорт ролика падал `ffmpeg exited with code 234`, коины возвращались.

Точная причина (по логам воркера): `[Parsed_xfade_1] First input link main timebase
(1/1000000) do not match the corresponding second input link xfade timebase (1/15360)`.
xfade отказывается работать, если у двух его входов разные шкалы времени. Выход `concat`
идёт с AVTB (1/1000000), а очередной файл сцены — со своей шкалой из контейнера. Значит
падал РОВНО тот ролик, где встык и переход стоят рядом: только встыки склеиваются concat'ом
без xfade, только переходы дают xfade из двух одинаковых входов. Смешанная цепочка —
типичный ролик из редактора — не собиралась никогда, и именно поэтому дефект дожил до прода:
все двенадцать шаблонов поздравлений собраны однородно.

Фикс: каждая сцена приводится к общей шкале перед склейкой —
`[i:v]settb=AVTB,fps=25,setsar=1,format=yuv420p[svi]`, и дальше склеиваются уже
нормализованные входы.

## Этап E17 ✅ — Стыки и переходы как в монтажке, обрезка по записи

**Переход теперь принадлежит стыку, а не клипу.** Плашка стоит МЕЖДУ кадрами, а не на краю
одного из них, и открывает выбор перехода и его длины (0.3 / 0.5 / 1 с). Пока стоит переход,
наложение видно заштрихованной полосой: это и есть секунды, в которые один кадр растворяется
в другом, и на шкале они занимают ровно столько же, сколько в готовом файле.

Между кадрами пауза — плашки перехода нет, вместо неё кнопка «придвинуть вплотную»:
накладывать далеко стоящие клипы значило бы молча стереть кусок ролика, а без стыка перехода
не бывает. Так требование «переход только на стыке» объясняет себя само, а не отказывает
молча.

Что было сломано в прежней модели:

- `setTransition` двигал только ОДНОГО соседа и оставлял за ним дыру, ролик не укорачивался
  на длину перехода. Теперь сосед встаёт в точное положение (`конец предыдущего − длина
  наложения`), а весь хвост дорожки едет вместе с ним — как в любой монтажке.
- Наложение, созданное переходом, сносилось первым же перетаскиванием: `moveClip` считает
  пересечение ошибкой и отодвигает клип. Теперь перетаскивание СНИМАЕТ переход и у самого
  клипа, и у бывшего соседа слева — стыка больше нет, значит и перехода нет. Случайно
  «засунуть один клип под другой» по-прежнему нельзя: место ищет `freeSlotSec`, а
  прилипание к краям соседей помогает попасть в стык.

**Обрезка стала обрезкой, а не растягиванием.** У медиа-слоя появилось
`sourceDurationSec` — длина записи, которую браузер меряет при добавлении файла (ffprobe
на сервере нет). По ней ограничены обе ручки: правая режет КОНЕЦ и не тянется дальше конца
записи, левая режет НАЧАЛО и не уходит левее её начала. Раньше правый край растягивал клип
сколько угодно, а ffmpeg дотягивал сцену застывшим последним кадром — ровно то «видео
подвисает», которое видно в готовом файле. Та же граница применена к полю «Длительность» в
инспекторе и к живому предпросмотру перетаскивания: полоса больше не тянется туда, откуда
на отпускании отскочит.

Ограничение честно молчит на картинках и заливках: у них нет «конца записи», и держать их
в кадре можно сколько угодно.

Проверки E16/E17: `worker` без DB-backed — 156 passed (обновлён тест склейки: входы
нормализуются, в графе есть `settb=AVTB`); `shared` — 113 passed; билды shared/worker/web —
зелёные. Живая сборка ролика с переходами — на проде: локально ffmpeg нет.

## Этап E18 ✅ — Редактор перестал подвисать: причины и что сделано

Симптом: предпросмотр и особенно перетаскивание ползунка тормозили, иногда вкладка
переставала отвечать; сильнее всего — в момент перехода между клипами.

**ВМ ни при чём.** Предпросмотр целиком браузерный: сервер отдаёт файлы и всё. Проверено на
проде во время жалобы — 2 ядра, load average 0.06, все контейнеры около нуля по CPU;
`/static` отдаётся с `Cache-Control: public, max-age=86400` и `Accept-Ranges: bytes`,
то есть повторная перемотка файлы заново не тянет. Дело было в клиентском коде.

Четыре настоящие причины, от самой тяжёлой:

1. **Пересоздание `<video>` на каждый кадр.** `useMediaElements` считал элемент
   существующим только после `loadedmetadata`. Пока файл грузился, каждый рендер создавал
   ЕЩЁ ОДИН `<video preload="auto">` с тем же адресом. Во время проигрывания рендер идёт
   шестьдесят раз в секунду — полсекунды загрузки превращались в десятки параллельных
   скачиваний одного файла. Отсюда и «особенно на переходе»: там на экране сразу два
   холста, и оба делали это одновременно. Теперь есть отдельный учёт «уже создан, ждём»,
   плюс `onerror` — битая ссылка не тянется вечно.

2. **Раскладка ролика считалась заново по многу раз в секунду.** `timelineScenes()`
   нарезает клипы по стыкам и разбирает схемой каждый слой, а зовут её рендер, плеер, шкала
   и подсчёт длительности. В `EditorStage` она вдобавок вызывалась без мемоизации. Ролик
   неизменяем (любая правка создаёт новый объект), поэтому `timelineScenes` и
   `timelineTimings` получили кэш по ссылке на WeakMap — повторный вызов стал бесплатным,
   а закрытый ролик не держит сцены в памяти.

3. **Часы перерисовывали всё дерево 60 раз в секунду.** Каждый кадр писался в состояние, и
   заново рендерились шкала со всеми клипами, панели и инспектор. Теперь точное время живёт
   в ref и раздаётся подписчикам мимо React, а в состоянии — грубое время с шагом 0.2 с: его
   хватает, чтобы выбрать сцену и решить, доступна ли резка. Плавные вещи двигают DOM сами:
   линия курсора на шкале, ползунок и подпись времени в транспорте. Перемотка при этом
   обновляет состояние сразу, без порога, — картинка обязана идти за рукой.

4. **Мелочи, которые складывались.** Точки прилипания пересчитывались от хода времени;
   ползунок на каждое движение мыши искал сцену через полную раскладку ролика (и отдавал её
   в `onSelectScene`, который в редакторе ничего не делает); карта загруженных элементов
   пересоздавалась каждый рендер и дёргала эффекты холста вхолостую. Всё это убрано,
   `Waveform` завёрнут в `memo`.

Проверки E18: `shared` — 113 passed, `worker` без DB-backed — 156 passed, билды
shared/worker/web — зелёные. Замерить фактический прирост можно только в браузере на проде:
локально редактор не запускается без API и Postgres.

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
- **`packages/database` не может импортировать `@allvision/shared`**: зависимость идёт в обратную
  сторону (shared импортирует типы Prisma из database), поэтому такой импорт — цикл. В прод-Dockerfile
  database собирается первым, и статический импорт из shared роняет сборку с `TS2307: Cannot find module`.
  Локально это НЕ воспроизводится: там уже лежит `packages/shared/dist` от прошлой сборки. Проверять так:
  `mv packages/shared/dist /tmp/x && npm run build -w @allvision/database`. Нужное значение — копировать
  в пакет database (см. `seed-order-types.ts`), а не тянуть импортом.
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
  `docker exec allvision-studio-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > /opt/allvision-studio/shared/backup-before-academy-drop-$(date +%F).sql.gz`
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

**Итог выката (2026-08-25).** Деплой прошёл через GitHub Actions (push в main), релиз
`b51dace`. На проде: `/api/ready` — `database: ok`, `redis: ok` (значит `migrate deploy` с
удалением Academy отработал: без него контейнер API не стартовал бы), витрина Studio открыта
(`/`, `/services`, `/trends`, `/pricing` → 200, страницы конкретных услуг → 200), **45 активных
услуг на месте**, главная снова Studio-лендинг, Academy-маршруты (`/family`, `/lessons`,
`/teacher`, `/constructor`) → 404. Контейнер `livekit` снят деплоем (`--remove-orphans`).

**Долг, вскрытый прогоном API-тестов (существовал ДО отката, не связан с ним).** Впервые за
несколько этапов DB-backed API-набор был запущен по-настоящему (поднял Postgres в Docker):
34 suite, 172 passed, **36 failed в 9 suites**. Код и тесты при этом побайтно идентичны тегу
v0.2 (`git diff v0.2-allvision-studio-final HEAD` без миграций и CLAUDE.md — пуст), то есть эти
тесты падали и на теге. Две причины:
1. Коммит `a00e604` (09.06) «Restrict auth emails to Russian domains» ограничил регистрацию
   российскими доменами, а тесты по-прежнему шлют `test-…@example.com` → `400` вместо `201`.
   Отсюда падения всех наборов, создающих пользователя: `auth`, `account`, `payments`,
   `characters`, `services-launch`, `user-chats`, `admin-services`, `admin-diagnostics`.
2. `admin-blocks` ожидает каталог из 8 блоков, фактически их 18 (блоки добавлялись в P7–P13).

Причина накопления: в прошлых этапах DB-backed API-тесты не гонялись («без Postgres на 5433»),
поэтому рассинхрон тестов с кодом никто не ловил. Починка тривиальная (домен в тестовых email +
ожидаемое число блоков), но она НЕ входила в откат и оставлена отдельной задачей.

`shared` — 35 passed, `worker` — 122 passed (21 suite, включая DB-backed `pipeline-runner` и
`piapi-provider`, которые раньше пропускались), билды всех воркспейсов зелёные.

## Новое направление: сайт подарков (этапы G1–G6)

Решение владельца (2026-08-26): продукт разворачивается в сайт подарков к праздникам.
Существующие AI-услуги остаются как есть, поверх них добавляются видео-поздравления
(шаблоны + редактор со сценами) и, позже, альбомы с печатью. Чат Allvision AI сохраняется
как дополнительный инструмент.

Согласованный план:

- **G1 — витрина: вкладки и каркас.** Четыре вкладки каталога, теги поводов, заглушка альбомов.
- **G2 — рендер-ядро.** Блок `timeline-render` (склейка сцен, переходы, титры, музыка),
  очередь `video-render`, блок TTS. Один рендерер обслуживает и шаблоны, и редактор.
- **G3 — шаблоны видео-поздравлений.** 12 шаблонов в seed, страница шаблона, прогресс по сценам.
- **G4 — редактор, ядро.** `VideoProject` с таймлайном-JSON, сцены из загрузок и библиотеки,
  обрезка, текст, музыка, превью-плеер, экспорт, мобильный UI.
- **G5 — ИИ внутри редактора.** Генерация в сцену, шаблоны генерации, регенерация сцены.
- **G6 — поздравления на заказ.** Типы заказов, бриф, канбан, письма (бывший нереализованный P5).

Продуктовые решения, зафиксированные до начала работ:

- Водяных знаков нет нигде: пользователь платит до генерации, отдавать ему испорченный
  результат незачем. Экспорт в редакторе бесплатный (ffmpeg дешёвый), ограничивается только
  лимитом на злоупотребление.
- Публичных ссылок на результат не делаем: готовый проект живёт в личном кабинете, пользователь
  скачивает файл.
- Ролик ограничен 12 сценами в шаблоне и 3 минутами / 30 сценами в редакторе — дальше растёт
  время рендера и падает мобильное превью.
- Музыкальную библиотеку владелец наполняет сам; код готовит только выбор трека.

Технические решения G2–G4 (приняты заранее, чтобы этапы не разъехались):

- Таймлайн — единственный источник правды (zod-схема в `shared`). Превью в браузере и экспорт
  на сервере читают один и тот же JSON.
- Превью — свой лёгкий плеер на DOM (два переиспользуемых `<video>` в пинг-понг, CSS-переходы),
  без Remotion и headless Chrome: серверный рендер через Chrome стоил бы +700 МБ образа и минуты
  на ролик, тогда как ffmpeg-склейка готовых клипов укладывается в секунды.
- Титры — SVG: инлайном в превью и через `sharp` → PNG → ffmpeg overlay на экспорте. Это даёт
  пиксельное совпадение и снимает проблемы `drawtext` с кириллицей и переносами.
- Набор возможностей намеренно ограничен (4 перехода, фиксированные стили титров, без
  произвольных кейфреймов) — ценой гибкости покупается честное превью.

## Этап G1 ✅ — Витрина: вкладки, поводы, заглушка альбомов

Миграция `20260826120000_catalog_sections`:

- `ServiceCategoryDef.section` (`services` | `greetings`, default `services`) — вкладка витрины,
  в которой показывается категория. Существующие категории по умолчанию попадают в «Готовые услуги».
- `Service.occasionTags String[]` — сквозные теги поводов, `Service.featuredOrder Int` — порядок
  в кураторской вкладке (инициализирован текущим `sortOrder`, чтобы лента не перетасовалась).
- Новая таблица `WaitlistLead` — заявки с заглушек будущих разделов.

Вкладки каталога (`/services?tab=`):

1. **Популярное** (по умолчанию) — кураторская лента из услуг с `isFeatured`, порядок задаётся
   в админке через `featuredOrder`, первая карточка крупная. Это посадочная вкладка для рекламы,
   поэтому фильтров по категориям в ней нет.
2. **Готовые услуги** — существующий каталог с прежней разбивкой по категориям.
3. **Видео-поздравления** — кнопка перехода в редактор (пока заглушена флагом
   `VIDEO_EDITOR_ENABLED` в `apps/web/src/lib/feature-flags.ts`) и сетка шаблонов; до G3 сетка пустая.
4. **Альбомы** — заглушка с тремя карточками-обещаниями и формой «сообщить о запуске».

Справочник вкладок и поводов живёт в `packages/shared/src/catalog/sections.ts`: вкладки — это
навигация продукта, а не данные, поэтому список фиксирован в коде, в отличие от категорий.
Поводов 12 (`BIRTHDAY`, `NEW_YEAR`, `MARCH_8`, `FEB_23`, `VALENTINE`, `ANNIVERSARY`, `JUBILEE`,
`WEDDING`, `NEWBORN`, `GRADUATION`, `MEMORY`, `JUST_BECAUSE`); услуга может иметь несколько.

Фронт:

- Весь активный каталог приходит одним запросом, а вкладки/категории/поводы фильтруют его на
  клиенте: переключение вкладок мгновенное, без спиннеров — заметно на телефоне.
- Состояние фильтров пишется в адрес через `history.replaceState`: реклама может вести сразу на
  нужную вкладку, но клики по чипам не засоряют историю и не дёргают сервер.
- Чипы поводов показываются только для тех поводов, что реально встречаются во вкладке.
- `ServicesCatalog` разобран на `components/catalog/*` (ServiceTile, OccasionChips, PopularTab,
  ServicesTab, GreetingsTab, AlbumsTab, catalog-utils с fuzzy-поиском).
- `generateMetadata` даёт свои title/description на каждую вкладку, но canonical у всех один
  (`/services`) — вкладки это фильтр одной страницы, дробить вес между ними не нужно.
- `categoryHref(code, section)` теперь несёт обе координаты, иначе переход с лендинга открывал бы
  «Популярное» и выбранная категория терялась.

Бэкенд:

- `GET /api/services` принимает `section` и `occasion`; при `featured=true` сортировка идёт по
  `featuredOrder`. Секция сужает список категорий, поэтому чужая категория во вкладку не просочится.
- `POST /api/public/waitlist` (captcha + `optionalAuth`) пишет заявку; повторная отправка того же
  адреса отвечает успехом и дубля не создаёт — форма не должна ругаться на второй клик.
- `GET/DELETE /api/admin/waitlist` и страница `/admin/leads` («Заявки» в группе «Пользователи»).
- Админка услуг получила выбор поводов (`OccasionPicker`) и поле позиции в «Популярном»;
  админка категорий — выбор вкладки витрины.
- `toCategorySection()` приводит значение из БД к секции: категория с опечаткой окажется не в той
  вкладке, но не уронит каталог.

Проверки G1: билды `shared`, `database`, `api`, `worker`, `web` — зелёные; `shared` — 41 passed
(7+1 suites, добавлен `catalog-sections.test.ts`, 6 тестов). DB-backed API-тесты локально не
гонялись: Docker-демон не запущен, Postgres `localhost:5433` недоступен. Долг из предыдущего
раздела (36 падающих API-тестов из-за ограничения email российскими доменами и устаревшего
ожидания числа блоков) этим этапом не трогался.

## Этап G2 ✅ — Рендер-ядро: таймлайн, сборка ролика, титры, озвучка

Фундамент и для шаблонов видео-поздравлений (G3), и для редактора (G4): оба входа пользуются
одним рендерером, поэтому качество результата у них не разъедется.

Таймлайн как контракт (`packages/shared/src/timeline/`):

- `types.ts` — zod-схема ролика: сцены (видео/фото/заливка), обрезка, переходы, титры,
  дорожки музыки и озвучки. Набор возможностей узкий намеренно (4 перехода, 6 стилей титров,
  без произвольных кейфреймов): за счёт гибкости покупается то, что предпросмотр в браузере
  честно показывает будущий файл.
- `layout.ts` — раскладка сцен по времени. Из-за нахлёста переходов начало сцены не равно сумме
  предыдущих длительностей, поэтому тайминг считается в одном месте и им пользуются и плеер,
  и ffmpeg. Переход клампится половиной самой короткой из двух соседних сцен — иначе короткая
  сцена исчезала бы в переходе целиком.
- `titles.ts` — титр как SVG. Одна и та же строка идёт инлайном в предпросмотр и через
  `sharp` → PNG → ffmpeg overlay в экспорт. Перенос строк считаем сами, а не отдаём движку
  рендеринга: тогда разбивка совпадает, даже если системный шрифт на сервере и в браузере
  отличается. Заодно снимаются болячки `drawtext` с кириллицей, переносами и тенями.
- Лимиты: 30 сцен и 3 минуты в редакторе, 12 сцен в шаблоне.

Ширина текста откалибрована замером: модель посимвольной ширины совпадает с фактической
отрисовкой на weight 500, но занижает на 7% при 700 и на 21% при 900. Без поправки
`weightFactor()` жирные титры вылезали за плашку — это было видно на первом же смоуке.

Блок `timeline-render` (`apps/worker/src/blocks/`):

- `timeline-plan.ts` — чистый планировщик ffmpeg-команд: ни файловой системы, ни сети, ни
  запуска ffmpeg. Поэтому раскладка, переходы и микс звука проверяются юнит-тестами без окружения.
- `timeline-render.ts` — исполнитель: складывает исходники на диск, уточняет длительности через
  ffprobe, рисует титры, гоняет ffmpeg и заливает результат.
- Рендер в два прохода. Первый нормализует каждую сцену (кадр, обрезка, титры, звук), второй
  склеивает. Титры выжигаются в первом проходе, потому что их время задано относительно сцены,
  а на стыке переход красиво уводит титр вместе с кадром.
- Стык «встык» делается `concat`, а переход — `xfade`. Соблазн сделать cut как xfade нулевой
  длины не годится: xfade требует положительной длительности, и ролик из тридцати склеек уехал бы
  на секунду относительно расчётного тайминга, разъехавшись со звуком.
- Звук сцен раскладывается по своим секундам через `adelay` и смешивается `amix=normalize=0`.
  Без `normalize=0` ролик из десяти сцен звучал бы в десять раз тише. Зеркалить всю цепочку
  xfade ещё и в аудио не стали: наложение дорожек на стыке и так звучит как кроссфейд.
- Под озвучку музыка приглушается фиксированным коэффициентом 0.35. Это грубее
  сайдчейн-компрессии, но предсказуемо и не зависит от версии ffmpeg.
- Фото получают медленный наезд (`zoompan` на удвоенном кадре, иначе картинка мылится):
  статичное фото на четыре секунды выглядит как зависший кадр, а не как сцена.
- Кадр приводится вписыванием с полями, а не обрезкой: из обрезанного чужого видео может уехать
  лицо.
- Каждая сцена остаётся отдельным файлом и попадает в metadata результата — пользователь может
  забрать понравившийся кусок, не пересобирая ролик.

Блок `text-to-speech`:

- Схемы эндпоинтов сверены с OpenAPI fal перед реализацией. `fal-ai/minimax/speech-02-hd` —
  дефолт: у него есть явный `language_boost: Russian` и эмоции. ВАЖНО: `output_format` по
  умолчанию `hex`, url нужно просить явно, иначе аудио приедет шестнадцатеричной строкой.
  `fal-ai/elevenlabs/tts/multilingual-v2` — альтернатива с ровной интонацией, но англоязычными
  голосами (на русском слышен акцент).
- В `AIProvider` добавлен `textToSpeech`, в fal — вид результата `audio` (у речи ответ приходит
  в `output.audio.url`, а не в `images`/`video`). Мок генерирует тишину по длине текста
  (~14 символов в секунду) — монтаж целиком проверяется без расходов у провайдера.
- В режиме `PROVIDER_MODE=piapi` озвучка уходит в мок и возвращает тишину: уронить оплаченный
  ролик из-за недоступной речи хуже, чем отдать его без голоса.
- Аудио отдаётся как выход `type: 'video'` с `metadata.mediaKind: 'audio'` — осознанный
  компромисс: отдельный тип выхода потянул бы за собой `Project`, DTO и весь UI ради
  промежуточного артефакта, который никогда не бывает последним шагом.

Прочее:

- В worker-образ добавлены `font-noto`, `ttf-dejavu`, `fontconfig`: без системных шрифтов
  кириллица в SVG превращается в пустые прямоугольники.
- `ModelOption.provider` получил значение `fal` — с P11 это основной провайдер, а fal-модели
  до сих пор помечались как `piapi`.

Отклонение от плана: отдельная очередь `video-render` в этом этапе НЕ добавлена. Шаблоны идут
через существующую `service-pipeline` (и правильно: их сцены — дорогие AI-вызовы, которым нужна
concurrency 1). Отдельная очередь нужна экспорту из редактора, чтобы дешёвая склейка не стояла
за дорогой генерацией, — там её и добавим, вместе с первым производителем задач.

Проверки G2: `shared` — 53 passed (9 suites, добавлен `timeline.test.ts`, 12 тестов);
`worker` без DB-backed — 119 passed (19 suites, добавлен `timeline-plan.test.ts`, 11 тестов,
`blocks-registry` обновлён под 20 блоков); билды shared/database/api/worker/web — зелёные.
Смоук отрисовки титров прогнан локально через sharp: все шесть стилей дают видимый текст,
кириллица рисуется, после калибровки текст укладывается в плашку и в кадр. Полный ffmpeg-смоук
локально невозможен (ffmpeg на машине нет, Docker не запущен) — первый реальный рендер будет
на проде в G3.

## Этап G3 ✅ — Шаблоны видео-поздравлений

Первый продукт на рендер-ядре G2: пользователь загружает пачку фотографий, каждая становится
сценой, сцены склеиваются в ролик с титрами и музыкой.

Мульти-загрузка (тип поля `photos`):

- Новый тип поля формы с `minPhotos`/`maxPhotos`/`priceCoinsPerPhoto`. Число снимков задаёт
  и число сцен, и цену, поэтому оно проверяется на сервере ДО списания коинов.
- `filesByField` в API теперь хранит массивы: пачка приходит несколькими файлами под одним
  именем поля. Остальные поля по-прежнему допускают ровно один файл — иначе лишний файл молча
  перетирал бы предыдущий.
- Порядок загрузки = порядок сцен, поэтому индекс попадает в имя файла на storage, а в
  интерфейсе снимки можно переставлять стрелками и удалять.
- Цена линейна по числу фото и пересчитывается прямо во время выбора — «сколько сцен заказали,
  столько платных генераций и будет» понятно без калькулятора.

Блок `scene-batch`:

- Повторяет одну операцию для каждой фотографии. Цикл живёт внутри блока по той же причине,
  что и в `carousel-slides`: класть в пайплайн десять одинаковых шагов нельзя, их число
  выбирает пользователь.
- Режимы: оживить как есть, стилизовать и оживить, только стилизовать.
- У каждой сцены свой `stepId` — без этого все клипы писались бы в один путь и перезаписывали
  друг друга (ровно тот баг, что был в карусели, P9.8).
- Одна-две сорвавшиеся сцены не роняют ролик: подарок с девятью сценами вместо десяти
  пользователь не заметит, а полный отказ заметит обязательно. Но если развалилась пятая часть,
  блок падает — тогда честнее вернуть коины, чем отдать огрызок.

Сцена-пачка в `timeline-render`:

- Шаблон не может перечислить сцены заранее, поэтому пишет одну служебную сцену
  `{ "source": { "kind": "batch" } }`, а её оформление (переход, длительность, титр) наследуют
  все развёрнутые сцены.
- Массив клипов приходит ОТДЕЛЬНЫМ параметром `clips`, а не внутри JSON таймлайна: плейсхолдер
  внутри строки раскрывается интерполяцией и превратил бы массив в текст. Отдельный параметр —
  это ровно один плейсхолдер, и runner отдаёт массив как есть. По той же причине отдельными
  параметрами идут `music` и `voiceover`.
- Титры с незаполненным текстом выбрасываются, а заливка без титра — вместе с ними: поля
  заголовка необязательные, и без этой чистки пустой заголовок ронял бы весь ролик вместо того,
  чтобы просто не появиться.

12 шаблонов (`packages/database/src/seed-greetings.ts`, отдельный модуль — они однотипные и в
общем списке услуг были бы нечитаемы): ожившие фотографии, день рождения, юбилей, история любви,
свадьба, Новый год, 8 марта, 23 февраля, первый год малыша, ребёнок в мультфильме, выпускной,
поздравление от питомца. Последний показывает связку с озвучкой: текст пользователя произносится
голосом и ложится отдельной дорожкой, под которую приглушается музыка.

- Модель оживления — `hailuo-2.3-fast` ($0.16 за клип): движение мягкое, лица не плывут, а
  десять сцен на Kling стоили бы впятеро дороже. Цена 35 коинов за сцену (55 у мультфильма,
  где перед анимацией добавляется стилизация кадра).
- Категория `VIDEO_GREETINGS` заведена миграцией `20260826140000_video_greetings_category`
  сразу в секции `greetings`, поэтому во вкладке «Готовые услуги» она не появится.
- Слуги шаблонов добавлены в `NEW_SERVICE_SLUGS_TO_CREATE` на этот деплой.

Прогресс по сценам: блоки сообщают стадию (`Сцена 4 из 10`, `Склеиваем ролик`), она сохраняется
в `Project.stepProgress` и показывается под полосой прогресса. Для ролика, который собирается
минутами, это единственный способ показать, что процесс живой: общий процент растёт слишком
медленно, чтобы по нему что-то понять.

Проверки G3: `shared` — 53 passed; `worker` без DB-backed — 134 passed (21 suite; добавлены
`scene-batch-block.test.ts` — 8 тестов и `greeting-template.test.ts` — 7 тестов на разворачивание
сцены-пачки и чистку пустых титров); `database` — 4 passed; билды всех воркспейсов зелёные.
Все 12 шаблонов прогнаны через `validatePipelineConfig` (ту же валидацию, что и админка) —
проходят. Живой ffmpeg-рендер по-прежнему возможен только на проде.

Попутно починен тест сида, падавший ещё до этого этапа: мок `stylePreset` отстал от кода
(`upsert` вместо `findUnique` + `create`), из-за чего все 4 теста набора падали.

## Этап G4 ✅ — Редактор видео: сцены, предпросмотр, экспорт

Второй вход в рендер-ядро G2: пользователь собирает ролик сам. Шаблоны и редактор пишут
один и тот же таймлайн и рендерятся одним блоком, поэтому качество результата у них общее.

Модель и API:

- `VideoProject` (миграция `20260826160000_video_projects`): вся раскладка одним JSON.
  Мягкое удаление — файлы сцен могут быть уже использованы в готовых экспортах.
- `/api/user/video-projects`: CRUD, загрузка материала сцены, экспорт. Чужой ролик отдаёт 404,
  а не 403: существование чужого проекта — тоже информация.
- Черновик проверяется ТОЛЬКО схемой, полная проверка — на экспорте. Ролик в работе может
  временно нарушать лимиты (набросал сцен, собирается подрезать); отказывать такому
  автосохранению нельзя — пользователь потеряет работу из-за состояния, которое сам
  собирался поправить.
- Длительность загруженного видео меряет браузер и присылает подсказкой: ffprobe в
  API-контейнере нет, а рендер всё равно перемеряет файл сам.
- Экспорт бесплатен: склейка идёт локальным ffmpeg и стоит копейки, а пользователь уже
  заплатил за генерации. Повторный запуск при уже идущем экспорте не создаёт вторую задачу.

Очередь `video-render` (отложенная из G2, теперь у неё появился производитель):

- Отдельная от `service-pipeline`, потому что экспорт — дешёвая локальная склейка: ей незачем
  стоять за дорогими AI-генерациями, которые идут по одной.
- Concurrency 2: склейка упирается в CPU нашей ВМ, а не в чужой API.
- Исполнитель тот же `processServicePipeline` — он полностью generic, и экспорт получает
  готовые прогресс, стадии, обработку ошибок и SSE-события.

Плеер предпросмотра (`TimelinePlayer`):

- Свой лёгкий плеер вместо серверного рендера превью: два переиспользуемых `<video>` в
  пинг-понг плюс CSS-переходы дают картинку за миллисекунды, тогда как рендер каждой правки
  стоил бы минут ожидания.
- Часы плеера считаются сами, а не по `video.currentTime`: сцен несколько, а время ролика
  должно идти непрерывно даже на картинках и заливках.
- Видео-элементы переиспользуются по слоту, а не пересоздаются по сцене: иначе React
  перемонтировал бы их на каждой смене сцены и видео грузилось бы заново, давая чёрные вспышки.
- Время сцены подтягивается только при заметном расхождении — браузер не перематывает по
  кадрам, и постоянная коррекция выглядела бы как дёрганье.
- Титры рисуются тем же SVG, что уходит в экспорт, поэтому разбивка строк и положение блока
  совпадают.
- Точность ограничена осознанно: браузер и ffmpeg по-разному округляют кадры, поэтому превью
  показывает композицию, тайминг и титры, но не является пиксельной копией файла.

Расчёт «что показывать в момент t» вынесен в shared (`sceneAtTime`, `sourceTimeAt`): плеер и
ffmpeg обязаны сходиться в таймингах, иначе превью покажет не тот кадр, что окажется в файле.
Тест на эту функцию сразу поймал ошибку: активной считалась ПОСЛЕДНЯЯ начавшаяся сцена, и
внутри перехода уходящий кадр пропадал раньше времени — растворение выглядело бы как резкая
склейка. Правильно брать первую ещё не закончившуюся сцену.

Интерфейс:

- `/editor` — список роликов, `/editor/[id]` — сам редактор. Одноколоночная раскладка с
  лентой сцен горизонтальной прокруткой: это одинаково работает мышью и пальцем, поэтому
  отдельной мобильной версии не понадобилось.
- Инспектор сцены идёт в порядке вопросов, которые возникают у человека: что показываем,
  сколько это длится, что написано, как звучит.
- Автосохранение с задержкой вместо кнопки «Сохранить»: сохранять каждое нажатие клавиши в
  поле титра — это запрос на символ, а терять работу при закрытии вкладки нельзя.
- Ответ сервера принимается один раз при загрузке: иначе автосохранение перетирало бы то,
  что пользователь успел напечатать, пока летел запрос.
- Флаг `VIDEO_EDITOR_ENABLED` включён, во вкладке «Видео-поздравления» кнопка редактора стала
  рабочей, в сайдбар добавлен пункт «Редактор».

Проверки G4: `shared` — 56 passed (добавлены 3 теста на расчёт кадра и обрезку);
`worker` — 134 passed; билды shared/database/api/worker/web — зелёные. DB-backed тесты API
для `/api/user/video-projects` не добавлялись: локально нет Postgres, как и в прошлых этапах.
Живой экспорт проверяется на проде — это тот же первый прогон ffmpeg, что и у шаблонов G3.

## Этап G5 ✅ — ИИ внутри редактора: генерация в сцену

Редактор перестал быть только монтажным столом: материал сцены теперь можно не только
загрузить, но и сгенерировать, не выходя из ролика.

Переиспользование чата вместо второго пути генерации:

- Эндпоинт `POST /api/user/video-projects/:id/scenes/:sceneId/generate` вызывает тот же
  `createFreeChatProject`, что и Allvision AI. Там уже есть проверка моделей, расчёт цены,
  атомарное списание и возврат коинов при сбое очереди — писать это второй раз значило бы
  завести второе место, где можно ошибиться с деньгами.
- Функция получила опциональные `mode` и `titlePrefix`: сцены роликов пишутся как
  `editor-generation` и не смешиваются с историей чата. Поведение по умолчанию не изменилось.
- Генерация идёт в `service-pipeline` (concurrency 1) — это дорогой AI-вызов, а не склейка,
  и очередь экспорта ему не подходит.

Результат доезжает до сцены даже с закрытой вкладкой:

- При запуске редактор ставит на сцену метку `generationProjectId`, и она сразу сохраняется
  на сервере.
- По завершении `pipeline-runner` сам вписывает материал в сцену (хук на `mode`, как у
  `library-generation`). Оплаченная генерация обязана доехать до ролика независимо от того,
  открыт ли браузер.
- Сцена ищется по метке, а не по индексу: пока шла генерация, пользователь мог переставить
  сцены местами. Правило вынесено в shared (`applyGeneratedSource`) и покрыто тестами —
  воркер и редактор применяют одно и то же.
- Клиент по завершении забирает ТОЛЬКО материал готовой сцены, а не перезагружает ролик:
  иначе правки, сделанные во время генерации, затирались бы ответом сервера.

Шаблоны генерации (`SCENE_PRESETS`, 12 штук): «Двое обнимаются», «Смеются вместе», «Уходит
вдаль», «Салют над городом», «Тихий снегопад», «Свечи на торте», «Листается альбом» и другие.
Это заготовки промпта для ОДНОЙ сцены — не путать с шаблонами поздравлений из G3, которые
собирают весь ролик. Пресеты, которым нужен человек, показываются только когда в сцене уже
есть кадр: предлагать «двое обнимаются» для пустой сцены бессмысленно.

Список моделей сужается под сцену: если в сцене лежит кадр — предлагаются модели, умеющие
принимать изображение (кадр становится референсом, «оживи именно это»); если сцена пустая —
только те, что работают от одного описания. Показывать модель, которая заведомо не отработает,
значит продавать ошибку.

Проверки G5: `shared` — 59 passed (добавлены 3 теста на запись генерации в сцену, включая
поиск сцены после перестановки); `worker` — 134 passed; билды shared/api/worker/web — зелёные.

Известный нюанс (существовал до этапа): `resolveInputRef` принимает наш публичный
`/static/user-uploads/...` URL без проверки владельца. Файлы и так раздаются публично, поэтому
это не расширяет утечку, но при появлении приватного хранилища проверку нужно будет добавить.

## Деплой G1–G5 на прод (2026-08-26)

Выкат через GitHub Actions (push в `main`): SSH-ключа в окружении ассистента нет, поэтому
ручной P14-паттерн был недоступен. Релиз `a9f1133`, сборка заняла ~30 минут (три образа,
worker тянет demo-assets).

Проверено на проде после выката: `/api/ready` — database/redis/uploads ok; три миграции
применены (`catalog_sections`, `video_greetings_category`, `video_projects`); категории отдают
секции (`VIDEO_GREETINGS:greetings`, остальные `services`); 12 шаблонов поздравлений создались
seed-аллоулистом и видны в `/api/services?section=greetings`; прежние 45 услуг на месте во
вкладке «Готовые услуги»; `/services`, `/services?tab=greetings`, `/services?tab=albums`,
`/editor` отдают 200.

Живой ffmpeg-рендер и генерация в сцену на проде ещё не прогонялись — это первая настоящая
проверка ядра G2. Порядок от дешёвого к дорогому: ролик из 2–3 сцен в редакторе на загруженных
фото, затем музыка, затем генерация в одну сцену, затем шаблон на 3–4 фото. Библиотека
`background-music` пуста, поэтому до её наполнения ролики собираются без музыки.

## Этап G6 ✅ — Поздравления на заказ

Последний этап плана и бывший нереализованный P5. AI-кода здесь нет: бриф, статусы, письма.

Данные (миграция `20260826180000_custom_orders`):

- `OrderTypeDef` — тип заказа целиком настраивается в админке: вопросы брифа, вилка цены,
  срок и письма по статусам. Новый заказной формат не требует релиза, и это главное:
  такие форматы придумываются быстрее, чем выкатываются версии.
- `CustomOrder` хранит `typeTitle` копией — чтобы карточка читалась и после удаления типа,
  а сам тип отвязывается через `SetNull`, а не тянет заявку за собой.
- `CustomOrderMessage` — переписка по заявке; смена статуса тоже оставляет в ней след,
  так что обе стороны видят одну историю.
- Legacy-модель `Order` из Studio v1 не трогали: у неё жёсткий enum типов и обязательные
  поля под сказки, мешать их с data-driven брифом значило бы наследовать чужую форму.

Путь заявки описан явно в shared (`canTransitionOrder`): NEW → QUOTED → PAID → IN_PROGRESS →
DELIVERED, отмена из любого рабочего состояния. Переходы перечислены списком, а не выводятся
из порядка, потому что главное здесь — чего делать НЕЛЬЗЯ: закрыть заказ, за который не
заплатили, случайным кликом. На это есть тест.

Оплата — списание коинов одной транзакцией, без отдельного платежа: у пользователя уже есть
баланс, а `TokenTransaction` даёт готовую историю и понятный возврат при отмене.

Письма (`order-service.ts`): шаблон берётся из типа заказа, а если админ его не заполнил —
уходит встроенный текст. Заказчик не должен оставаться без ответа только потому, что до
шаблона не дошли руки. Подстановок пять (`name`, `orderTitle`, `price`, `link`, `note`) —
админ пишет обычный текст, а не разбирается в шаблонизаторе; неизвестный плейсхолдер
остаётся как есть, чтобы опечатка не превращалась в пустое место посреди письма. Ошибка
отправки не роняет смену статуса: заказ уже переведён, письмо вторично.

Интерфейс:

- `/orders` — заявки пользователя и витрина заказных форматов, `/orders/new/[slug]` — бриф,
  `/orders/[id]` — статус, переписка и кнопка оплаты. Старый пустой `/dashboard/orders`
  теперь редиректит на рабочий раздел.
- Во вкладке «Видео-поздравления» появился блок «Не подходит ни один шаблон?»: человек,
  которому шаблон не подошёл, должен видеть выход, а не уходить с пустыми руками.
- `/admin/orders` — канбан по статусам с панелью заявки: бриф, цена, комментарий, переходы
  и переписка. `/admin/order-types` — CRUD типов с конструктором брифа и редактором писем.

Проверки G6: `shared` — 70 passed (11 suites, добавлен `orders.test.ts` — 11 тестов на
переходы, бриф и подстановки в письмах); `worker` — 134 passed; билды shared/database/api/
worker/web — зелёные. DB-backed API-тесты для заказов не добавлялись: локально нет Postgres,
как и в прошлых этапах.

Долг G6: вложения к брифу (`attachments`) хранятся в модели, но загрузки файлов в форме пока
нет — заказчик присылает референсы в переписке; типы заказов в seed не создаются, первый
формат заводится через `/admin/order-types`.

## Ревизия G1–G6 и исправления (2026-08-26)

Перепроверка сделанного после выката G1–G5 нашла четыре дефекта. Все исправлены.

**1. Пустая необязательная озвучка роняла весь оплаченный ролик.** В шаблоне
«Поздравление от питомца» поле текста помечено необязательным («оставьте пустым, если хотите
только музыку»), но `text-to-speech` при пустом тексте бросает `TTS_TEXT_REQUIRED` — падал весь
пайплайн, проект уходил в FAILED с возвратом коинов. Условие шага (`when`) умело только
равенство значению, чего для свободного текста недостаточно, поэтому добавлен второй режим —
`{ field, filled: true }`: шаг выполняется, только если поле вообще заполнено. Пропущенный шаг
не пишет выход, поэтому `{{step_2.output.url}}` разрешается в undefined и дорожка озвучки
просто не появляется.

**2. Результат генерации нельзя было переиспользовать как референс.** Воркер пишет результаты
в `outputs/{userId}/{projectId}/...`, а `resolveInputRef` принимал только `results/` и
`user-uploads|media-assets|service-assets|uploads`. Из-за этого «доработать только что
сгенерированный кадр» в редакторе падало с `INVALID_INPUT_REF`. Добавлена ветка для `outputs/`
с проверкой владельца — путь прямо содержит userId, так что проверка бесплатная и заодно
строже, чем у соседних веток.

**3. Редактор показывал цену генерации без прод-оверрайдов.** Чат берёт
`modelPriceOverrides` из `/api/user/chat/models` и передаёт в расчёт, а панель генерации в
сцене — нет. Так как оверрайды работают как минимум (P14.3), пользователь видел бы цену НИЖЕ
той, что спишет сервер. Панель теперь читает те же оверрайды.

**4. Бриф заказа не подставлял контакты.** Имя и почта брались из профиля в инициализаторе
`useState`, а профиль догружается позже первого рендера — поля оставались пустыми. Подстановка
перенесена в эффект и не трогает то, что человек уже ввёл.

Как исправление №1 доехало до прода: `ensureGiftServices` намеренно create-only, поэтому уже
созданные шаблоны сид не обновляет. Для дефектов в самом пайплайне добавлен точечный
`refreshGiftPipelines` с ЯВНЫМ списком слугов (`GIFT_PIPELINES_TO_REFRESH`): обновляется только
`pipelineConfig` и только у перечисленных услуг — цены, тексты и превью, которые правил админ,
остаются нетронутыми; услуга, созданная в этом же прогоне, пропускается. После деплоя список
нужно очистить.

Проверено и признано не дефектом: `readPath` разбирает вложенный путь `step_1.output.metadata.clips`;
пропуск условного шага не подставляет выход предыдущего; новые admin-роутеры смонтированы до
корневого `adminUsageRouter` и не перехватываются им.

Оставлено осознанно: `stats.activeOrders` в дашборде по-прежнему считается по legacy-модели
`Order` (всегда 0) — эти данные в текущем интерфейсе не отображаются, а смена типа потянула бы
за собой shared-контракт.

Проверки: `shared` — 72 passed (добавлены 2 теста на условие шага), `database` — 4 passed,
`worker` — 134 passed, билды всех воркспейсов зелёные; 12 шаблонов проходят
`validatePipelineConfig`.

## Хотфикс: 500 на страницах с динамическим адресом (2026-08-26)

Симптом: `/editor/<id>` на проде отдавал 500 «Что-то пошло не так».

Причина: в Next 14 `params` приходит в страницу обычным объектом, а в Next 15 — промисом.
Три новые страницы (`/editor/[id]`, `/orders/[id]`, `/orders/new/[slug]`) были написаны по
15-й схеме: тип объявлен как `Promise<...>`, значение разворачивалось через `use(params)`.
На плоском объекте `use()` бросает исключение прямо на рендере — отсюда 500.

Почему не поймал билд: тип промиса я объявил сам, и TypeScript честно проверил код против
этого объявления. Несоответствие фактическому контракту Next статически невидимо.

Что изменено: все три страницы читают `params` как обычный объект. Проверено не билдом, а
запуском `next start` и реальными запросами: раньше падавшие адреса отдают 200, admin-адреса —
307 (редирект гостя), в логе ошибок нет. Билд в этом классе ошибок бесполезен, поэтому впредь
новые страницы с динамическим сегментом проверяются запросом.

## Этап E1 ✅ — Слои в сцене: фундамент нового редактора

Претензия владельца к редактору («двигать нельзя, коллажа нет, генерация непонятно от чего»)
упиралась не в интерфейс, а в контракт: `TimelineScene` держала ровно ОДИН файл в поле
`source`. Отсюда следовало всё остальное — двигать нечего, два фото положить некуда,
референс для генерации может быть только один. Правками интерфейса это не лечится.

Сцена стала списком слоёв (`packages/shared/src/timeline/layers.ts`):

- `media`-слой: источник, рамка, вписывание (cover/contain), обрезка исходника, поворот,
  прозрачность, окно видимости, звук, метка генерации.
- `text`-слой: тот же титр, но со своей рамкой вместо трёх вариантов «сверху/по центру/снизу».
- Геометрия задаётся В ДОЛЯХ кадра, а не в пикселях: один ролик рендерится и в 1080x1920,
  и в 1920x1080, и раскладка не должна от этого разъезжаться.
- Готовые раскладки коллажа (`collageBoxes`): два рядом, друг над другом, четыре плиткой,
  кадр в кадре. Человеку проще выбрать «два рядом», чем выставить четыре числа руками.

Совместимость: старые ролики и все 12 шаблонов записаны в прежней форме («один source плюс
overlays»). Переписывать их не стали — `sceneLayers()` раскладывает такую сцену на слои
при чтении, обе формы работают. Сцена переезжает на слои только когда её действительно
правят (например, когда воркер вписывает готовую генерацию).

Рендерер (`timeline-plan.ts`) собирает сцену композицией:

- Нулевым входом всегда идёт подложка на весь кадр — она даёт стабильную основу нужного
  размера, поэтому слоям не нужно ничем добивать кадр до целого.
- Каждый слой: обрезка исходника → вписывание в свою рамку → поворот с прозрачными углами →
  наложение по координатам рамки. `cover` заполняет рамку и срезает лишнее, `contain`
  вписывает целиком и центрируется — то же различие, что у `object-fit` в браузере, чтобы
  предпросмотр и экспорт понимали слой одинаково.
- Звук: смешиваются все звучащие слои (`amix normalize=0`), иначе два слоя со звуком
  зазвучали бы вдвое тише каждого.
- Наезд на фото остался только там, где сцена — одно фото на весь кадр. На плитках коллажа
  он выглядел бы дёргано.

Титры теперь позиционируются рамкой, и кегль считается от ШИРИНЫ РАМКИ: титр в узкой колонке
коллажа не должен набираться тем же размером, что заголовок во весь кадр.

Осознанно не сделано в E1: скругление углов слоя. Поле напрашивалось для коллажей, но ffmpeg
делает это только через маски, и класть в схему знание, которого экспорт не умеет, значит
завести расхождение превью и файла — тот самый класс проблем, которого мы избегаем.

Компоненты редактора (`SceneStrip`, `SceneInspector`, `TimelinePlayer`, `SceneGenerator`)
переведены на главный слой сцены — это временный мост: в E2 их заменит холст, который
рисует все слои.

Проверки E1: `shared` — 72 passed, `worker` — 140 passed (тесты планировщика переписаны под
слои, добавлено покрытие коллажа, обрезки, поворота и микса звука двух слоёв); билды всех
воркспейсов зелёные. Смоук отрисовки титров в половинной рамке прогнан через sharp.

## Этап E2 ✅ — Холст редактора: слои берутся мышью

Слои, появившиеся в E1, до этого этапа были контрактом без интерфейса: правились числами
в панели, а на экране показывался плеер. Здесь кадр наконец берут рукой.

Холст (`apps/web/src/components/editor/canvas/`):

- Konva через `react-konva`, подключается только на клиенте (`next/dynamic`, `ssr: false`),
  а в сборке серверного бандла пакет `canvas` отключён алиасом — иначе Next падает на
  `Can't resolve canvas`.
- Слой двигается, тянется за углы и вращается; при перетаскивании работает привязка к
  краям, центру и к рамкам соседних слоёв с жёлтыми направляющими.
- Konva масштабирует узел, а таймлайн хранит размеры, поэтому по окончании трансформации
  масштаб сбрасывается в размер: иначе вложенный текст «ехал» бы вместе с рамкой.
- Рисуем теми же числами, что уходят в ffmpeg: доли кадра, `cover`/`contain`, раскладка
  титра из `layoutOverlay`. Титр рисуется нативным текстом, а не картинкой из SVG —
  перетаскивание должно оставаться плавным, а перенос строк всё равно считается общим кодом.
- Во время проигрывания холст превращается в плеер: выделение и ручки пропадают, видео-слои
  синхронизируются со временем сцены, Konva перерисовывается по кадрам.

Раскладка редактора (`VideoEditor`, `EditorStage`, `LayerPanel`, `LayerInspector`):

- Инструменты слева, холст в центре, лента сцен под ним, справа — список слоёв и настройки
  того, что выделено. Прежняя постоянная стопка всех настроек сразу и делала панель
  нечитаемой.
- Инструменты разведены по задачам: медиа (загрузка, заливка, коллаж), текст, звук, ИИ.
- Слой можно переставить по порядку отрисовки, скрыть, залочить и удалить; настройки
  показываются только для выделенного.
- Новый слой кладётся меньше кадра и со сдвигом, а не на весь кадр: иначе он накрыл бы
  предыдущий целиком и человек решил бы, что кадр пропал.

## Этап E3 ✅ — Генерация от выделенного слоя, озвучка, надёжная доставка результата

Последняя часть претензии к редактору — «генерация непонятно от чего» — и дыра, найденная
в E2 при ревизии.

**Дефект: оплаченная генерация могла не доехать.** Клиент помечал `generationProjectId`
слой, а сервер — сцену. Для сцен со слоями (а холст пишет именно их) серверная метка мёртвая:
`sceneLayers()` её игнорирует. Между ответом сервера и автосохранением есть больше секунды,
и если вкладку закрыть внутри этого окна, результат не встал бы никуда, хотя коины списаны.
Теперь клиент называет слой в теле запроса, а сервер ставит метку сам — общим помощником
`markLayerGeneration()` (shared), который заодно переводит сцену прежней формы на слои.
Пометка сцены осталась запасным путём для роликов старой записи.

**Генерация от того, что выделено.** Референсом шёл «главный» кадр сцены независимо от
выделения — на коллаже из нескольких кадров догадаться, от чего считает нейросеть, было
невозможно. Теперь панель показывает референс миниатюрой и называет его словами, а выбрать
можно между выделенным слоем, главным кадром сцены и генерацией с нуля. Отдельно называется
место результата: новый слой поверх (по умолчанию — чужую работу не подменяем) или замена
выделенного. Список моделей по-прежнему сужается под наличие референса.

**Озвучка в редакторе.** Рендер умеет дорожку голоса с G2, но интерфейс знал только музыку.
В инструменте «Звук» теперь две дорожки: готовую запись можно загрузить файлом (загрузка
материала и так принимает аудио), а текст — произнести голосом за коины. Синтез идёт обычным
одношаговым пайплайном `text-to-speech` в очереди `service-pipeline`: списание, возврат при
сбое очереди и прогресс — тем же порядком, что у генерации образа в Студии. Готовую дорожку
вписывает в ролик воркер (`applyVoiceoverToProject`), поэтому голос доедет и с закрытой
вкладкой; ролик назван в `userInputs`, а не берётся «последний открытый» — за время синтеза
человек мог уйти в другой ролик.

Решения, которые стоит помнить:

- Цена озвучки живёт в shared (`voiceoverPriceCoins`) и считается от долларовой
  себестоимости, а не от `estimatedCostCoins` каталога: там осталась старая конвертация
  (18 ₽ за коин), из-за которой обе модели синтеза стоят «1 коин» и дорогая ничем не
  отличается от дешёвой. Цена плоская, не посимвольная: иначе на экране была бы одна сумма,
  а в списании другая. Пол — 5 коинов, сверху — удвоенная себестоимость.
- `text-to-speech` добавляется в список fal-блоков всегда, даже если прод переопределяет
  `FAL_BLOCKS` через env. Откат этого блока на mock означает не «дешевле», а тишину вместо
  голоса — а человек заплатил именно за голос.
- Дорожка голоса не зацикливается: реплика короче ролика должна прозвучать один раз.
- Ошибка запуска генерации убирает только тот слой, который завели ради неё: выбранный
  пользователем кадр из-за нашей ошибки исчезать не должен.

Проверки E3: `shared` — 78 passed (10 suites; добавлены 4 теста на метку слоя, включая
перевод старой сцены на слои и связку «пометили → воркер вписал результат туда же», и 2 на
цену озвучки); `worker` — 138 passed (20 suites); билды shared/api/worker/web — зелёные.
DB-backed наборы (`pipeline-runner`, `piapi-provider`, `asset-reference`) локально не
гонялись: Docker-демон не запущен, Postgres `localhost:5433` недоступен — как и в прошлых
этапах. Значит, `applyVoiceoverToProject` покрыт только типами и ручной проверкой на проде.

Долг E3: живой прогон озвучки (fal MiniMax) не делался — первый настоящий синтез будет на
проде, вместе с первым ffmpeg-рендером ролика; в прод-`.env` стоит проверить `FAL_BLOCKS`
(теперь синтез добавляется к списку принудительно, но остальные блоки редактора должны там
быть). Автоматических тестов на маршруты `/api/user/video-projects` по-прежнему нет.

## Этап E4 ✅ — Отмена, клавиатура, дубль слоя

Холст из E2 дал возможность двигать кадр рукой, но не дал вернуть его назад: в редакторе,
где слой таскают мышью, отсутствие Ctrl+Z замечают на первой же неудачной правке.

История правок (`packages/shared/src/timeline/history.ts`):

- Чистые функции, а не хук: отмена — это правила, и их надо уметь проверить тестами.
  В `past` лежат ПРЕДЫДУЩИЕ состояния, текущее живёт в редакторе — так отмена не зависит
  от того, успел ли редактор записать последнюю правку.
- Частые правки склеиваются окном в 600 мс: набор текста в титре даёт правку на символ, и
  без склейки отмена стирала бы по букве. Перетаскивание записывается один раз в конце,
  поэтому от склейки не страдает.
- Глубина 50 шагов. Любая новая правка обрывает ветку повтора.
- В редакторе история лежит в `ref`, наружу выведена только глубина: перерисовывать всё
  дерево на каждую запись незачем.

Клавиатура (обработчик на окне — фокус обычно на canvas, а он о клавишах не знает):

- Ctrl+Z / Ctrl+Shift+Z (и Ctrl+Y) — отмена и повтор, кнопки те же в шапке.
- Ctrl+D — дубль слоя, Delete — удалить, Esc — снять выделение.
- Стрелки двигают слой на 0.5% кадра, с Shift — на 5%; рамка удерживается в кадре, иначе
  уехавший за край слой нельзя было бы выделить обратно.
- Пока курсор в поле ввода, клавиши принадлежат полю: горячие клавиши не перехватываются.

Дубль слоя (`duplicateLayer`) вставляет копию сразу над оригиналом со сдвигом — точно
поверх она выглядела бы как «ничего не произошло», — и не забирает метку генерации:
иначе ожидаемый результат встал бы в копию.

Под холстом появилась строка с горячими клавишами: догадаться о них иначе невозможно.

Проверки E4: `shared` — 84 passed (11 suites, добавлен `timeline-history.test.ts` — 6 тестов
на склейку, обрыв ветки повтора, границу глубины и пустую историю); билды shared и web —
зелёные.

## Этап E5 ✅ — Доработать готовый результат в редакторе

Шаблон поздравления собирал ролик и на этом заканчивался: поменять титр или порядок сцен
можно было только новым платным прогоном. Теперь готовый результат открывается в редакторе.

- `POST /api/user/video-projects/from-project` делает редактируемый ролик из завершённого
  проекта. Ничего не списывает: генерации уже оплачены, здесь только перенос готового
  в редактируемый вид.
- Шаблон открывается целиком — со сценами, титрами, музыкой и озвучкой. Для этого
  `timeline-render` кладёт в метаданные результата всю разрешённую раскладку
  (`resolvedTimeline`): по одним ссылкам на файлы сцен титры и музыку не восстановить, а
  шаблон без своего поздравления открывать бессмысленно.
- Любой другой результат — из чата, услуги, Студии — открывается одной сценой, из которой
  можно собрать своё. Так кнопка полезна везде, а не только в поздравлениях.
- Кнопка «Доработать в редакторе» стоит рядом с «Сохранить в Студию»: на странице проекта
  и в панели генераций услуги.

Нюанс, который пришлось закрыть отдельно: сервер не знает длину видеофайла (ffprobe в
API-контейнере нет), а сцена без явной длительности схлопывается до четырёх секунд — экспорт
обрезал бы ролик. Поэтому длительность одиночной видео-сцены замеряет браузер сразу после
создания и досылает патчем; не замерилась — попасть в редактор всё равно важнее, длительность
правится там же руками. У шаблонов длительности приходят готовыми и замер не нужен.

Проверки E5: `shared` — 84 passed, `worker` — 138 passed (20 suites), билды shared/api/worker/
web — зелёные. Живая проверка — на проде: открыть готовую генерацию в редакторе и собрать
из неё ролик.

## Ревизия тестов (2026-08-28) — весь набор снова зелёный

Долг, тянувшийся с июня: DB-backed набор API падал 36 тестами, поэтому его перестали
запускать, и он продолжал расходиться с кодом. Разобран целиком.

Почему падало (всё — устаревшие ожидания, не дефекты прода):

- Коммит `a00e604` ограничил регистрацию российскими доменами, а тесты слали
  `@example.com` — 64 адреса переведены на `@example.ru`.
- `admin-blocks` ждал 8 блоков; их 21. Теперь сверяется с `BLOCK_CATALOG.length` —
  захардкоженное число ломалось при каждом новом блоке.
- `admin-services.test.ts` вообще не компилировался: в HEAD лежала строка
  `category: data.category as priceTokens: data.priceCoinsStandard,` — след неудачной
  автозамены в одном из прошлых сеансов. Восстановлено по истории файла.
- Цена слота персонажа менялась (200 → 12), а тесты держали числа. Переписаны через
  `CHARACTER_SLOT_PRICE_TOKENS`.
- Заголовок чата обрезается с многоточием, цена генерации считается с ценовыми полами
  P14.2 — тесты теперь зовут те же функции (`titleFromPrompt`,
  `estimateChatGenerationPriceCoins`), а не повторяют их логику числами.
- Баланс в `/admin/diagnostics` читается у fal, а тест мокал PiAPI-клиент. Переписан на
  мок `fetch`, добавлен случай «ключа нет — говорим об этом прямо».
- Приветственный бонус: продуктовый контракт — ноль, но в локальном `.env` стоит 25.
  Тест сам выставляет переменную, чтобы проверять контракт, а не настройку машины.

Два настоящих дефекта, вскрытых по дороге:

- Запуск услуги с неизвестным значением тарифа молча считал его Pro и списывал по
  дорогому тарифу. Теперь такое значение отклоняется (`INVALID_TIER`); пустое поле
  по-прежнему уходит в Pro-умолчание P9.
- Обработчик admin-услуг всё ещё маппил `TIER_FIELD_REQUIRED`, которого валидатор не
  бросает с P9, и не маппил живую `TIER_FIELD_DUPLICATE` — админ получал общий код.

Добавлено покрытие на то, чего не было:

- `video-projects.test.ts` (8 тестов): создание и чужой ролик за 404, метка генерации в
  названном слое (это фикс E3), `from-project` для шаблона и для любого другого результата,
  отказ на чужой и незавершённый, озвучка со списанием, возвратом при недоступной очереди
  и отказом при нехватке коинов.
- `admin-services`: форма без tier-поля принимается, две tier-формы отклоняются, и общий
  файл обложки двух услуг не удаляется при замене у одной (правило P13.5 не было покрыто).

Как гонять DB-тесты локально: репозиторий ждёт Postgres на `localhost:5433` с паролем
`allvision_pass` (см. `.env`), а `docker/docker-compose.yml` поднимает контейнеры с
фиксированными именами — если на машине уже висит `allvision-postgres` (например, на 5432
с другим паролем), compose падает на конфликте имён. Быстрый обход:
`docker run -d --name allvision-test-pg -e POSTGRES_USER=allvision -e POSTGRES_PASSWORD=allvision_pass -e POSTGRES_DB=allvision -p 5433:5432 postgres:16`,
затем `npx prisma migrate deploy --schema packages/database/prisma/schema.prisma`.
Набор запускать с `--forceExit`: после прогона остаются открытые Redis-хендлы, и без флага
jest висит уже после того, как все тесты прошли (полный прогон — около 30 секунд, а не
получаса, как кажется по зависшему процессу).

Итог прогона: `shared` — 84, `database` — 6, `worker` — 153 (включая DB-backed
`pipeline-runner`, `piapi-provider`, `asset-reference`, которые пропускались с P6),
`api` — 238. Все зелёные.

## Этап E6 ✅ — Один экран, горячие клавиши в русской раскладке, звуковые дорожки

Правки по итогам первого живого прогона редактора владельцем.

**Горячие клавиши не работали вообще.** Обработчик сравнивал `event.key`, а в русской
раскладке Ctrl+Z даёт «я», Ctrl+D — «в». Ни одно сочетание не срабатывало, хотя подсказка
под холстом честно их перечисляла. Теперь сравнивается `event.code` — физическая клавиша,
не зависящая от языка ввода.

**Копирование слоёв.** Ctrl+C и Ctrl+V — в том числе между сценами: буфер живёт в ref и
переживает переход. Вставленный слой получает новый идентификатор и сдвиг и не забирает
метку генерации: результат чужого запуска должен встать в оригинал.

**Рабочая область больше не растягивается вниз.** Было: холст считал размер по ширине
колонки, поэтому вертикальный кадр уезжал на два экрана, а панель инструмента вклинивалась
между кадром и лентой сцен. Стало:

- страница занимает ровно экран (`h-dvh`), скроллятся только боковые колонки;
- кадр вписывается и по ширине, и по высоте — холст меряет доступное место целиком;
- панель инструмента переехала вбок отдельной колонкой;
- внизу постоянная панель со сценами и звуком.

**Звуковые дорожки на шкале времени** (`TimelineTracks`). Раньше музыка и голос были парой
полей в настройках, и понять, где звучит реплика, было нельзя. Теперь у каждой дорожки своя
полоса на шкале ролика: её видно, её можно перетащить мышью (или стрелками с клавиатуры),
рядом громкость, повтор и удаление. Длину полосы даёт настоящая длительность файла — её
меряет браузер, потому что на сервере ffprobe нет.

К дорожке добавлена обрезка начала файла (`trimStartSec` в контракте таймлайна): песню можно
начать с припева, а не со вступления. В ffmpeg это `atrim` плюс обязательный
`asetpts=PTS-STARTPTS` — без сброса меток времени отрезанный кусок вступал бы позже
запрошенного, а сверху ещё ложится `adelay`, и звук уехал бы дважды.

Проверки E6: `shared` — 85 passed (добавлен тест на обрезку и умолчание), `worker` —
timeline-plan/greeting-template/scene-batch 31 passed, билды shared/worker/web — зелёные.

Осознанно не сделано: обрезка КОНЦА аудио и несколько дорожек одного типа. Контракт
рендера знает одну дорожку музыки и одну голоса; добавлять их пачкой стоит только вместе с
микшированием, иначе в предпросмотре и в файле получится разное.

## Хотфикс E6.1 ✅ — Чёрный ролик, упавший экспорт, невидимый статус

Разбор по следам первого живого прогона (диагностика по SSH на проде).

**Чёрный ролик за 210 коинов — блок молча ушёл в mock.** Шаблон «Юбилей» отработал
«успешно»: шесть клипов, статус COMPLETED, а в файле титр и двадцать секунд темноты.
Причина: прод переопределяет `FAL_BLOCKS` через env, и списка не хватало — `scene-batch`
(новый блок из G3) не попал ни в `FAL_BLOCKS`, ни в `PIAPI_BLOCKS`, а селектор провайдера
для незнакомого блока возвращал **mock**. MockAIProvider отдаёт односекундный чёрный mp4 —
он и уехал в ролик. Шесть генераций за 42 секунды в логе как раз и выдавали подмену:
реальный Hailuo столько не успевает.

Исправлено в селекторе: в боевом режиме незнакомый блок идёт на fal, а не в mock, и пишет
предупреждение в лог. Молчаливая подмена результата хуже честной ошибки — после ошибки
коины возвращаются, а после подмены человек платит за чёрный экран.

**Экспорт из редактора падал — регрессия E1.** `normaliseTimelineInput` отбирал сцены по
полю `source`, которого у сцены со слоями нет. Из ролика уходили ВСЕ сцены, схема получала
пустой список и роняла шаг с «Array must contain at least 1 element». Теперь сцена со
слоями проходит фильтр; пустая заливка без титра по-прежнему выбрасывается.

**Статус генерации и сборки не был виден.** Добавлено:

- на кадре, пока идёт генерация, рисуется рамка с подписью и процентом — видно, куда
  встанет результат и что процесс жив;
- под шапкой — полоса прогресса для генерации и для сборки ролика с пояснением, что
  файл появится здесь же и ждать на странице необязательно;
- упавшая генерация теперь снимает метку со слоя и говорит о возврате коинов. Раньше метка
  оставалась навсегда: слой ждал результат, которого не будет, а страница поллила пустоту.

**Генерация зависала после выката.** Воркер, перезапущенный посреди работы, оставлял проект
в `PROCESSING`; очередь отдавала задачу повторно, а проверка статуса отбивала её как дубль.
Теперь повтор с `attemptsMade > 0` считается продолжением после обрыва и запускается заново.
Зависший проект на проде закрыт вручную с возвратом коинов.

**«Ролик не найден» при обрыве связи.** Любая ошибка загрузки показывалась как «возможно,
он был удалён» — при перезапуске API это ложь. Теперь 404 и временная ошибка различаются,
у второй есть кнопка «Повторить».

Проверки E6.1: `worker` — 155 passed (24 suites; добавлены тесты на сцену со слоями в
нормализаторе и на отбрасывание пустой заливки), билды shared/worker/web — зелёные.

Долг: если задача исчерпает все попытки, проект так и останется в `PROCESSING` — нужен
отдельный сборщик зависших генераций (проверять, что в очереди нет ни активной, ни ждущей
задачи, и закрывать с возвратом). Прод-`FAL_BLOCKS` стоит привести в порядок: сейчас код
подстраховывает список, но честнее держать env актуальным.

## Этап E7 ✅ — Рабочие модели, видимая генерация, библиотека и платная сборка

Второй заход по следам живого прогона.

**Шаблоны падали на несуществующем эндпоинте.** `SCENE_BATCH_FAILED: собрано 0 сцен из 6`,
а под ним `fal 404: Path /hailuo-02/fast/image-to-video not found`. Проверка эндпоинтов на
живом fal показала: у fast-версии Hailuo путь пишется через дефис
(`minimax/hailuo-02-fast/image-to-video`), а text-to-video у неё нет вовсе. Обе записи
исправлены в карте моделей воркера и в таблице цен.

По решению владельца шаблоны переведены на **Kling 3.0 Standard** (оживление фото) и
**Nano Banana Pro** (стилизация), длительность сцены — минимальные 3 секунды: платят за
каждую фотографию, и лишние секунды дорожают ролик, ничего не добавляя. Слуги шаблонов
добавлены в `GIFT_PIPELINES_TO_REFRESH`, иначе правка не доехала бы до прода — услуги там
уже созданы, а сид их не обновляет. **После выката список нужно очистить.**

**Генерация не появлялась в редакторе.** Корень: `applyGeneratedSource` подставлял кадр, но
не снимал метку `generationProjectId`. Слой навсегда оставался «ждущим»: заглушка висела
поверх готового кадра, а следующая генерация в той же сцене вообще не отслеживалась —
редактор продолжал следить за первой. Метка теперь снимается при подстановке (одной
функцией и на клиенте, и в воркере). Плюс если воркер не нашёл, куда положить кадр, клиент
берёт серверную копию ролика целиком, а не затирает её своим состоянием: за кадр уже
заплачено.

**Видно, что происходит.** Библиотека генераций отдельной вкладкой в панели инструментов:
весь список с прогрессом, а готовый кадр можно поставить в текущую сцену. Экран сборки
занимает всю рабочую область — инструменты на это время убираются (правки всё равно не
попадут в идущий рендер), а после сборки остаётся файл, кнопка возврата в редактор и список
прошлых сборок со скачиванием.

**Озвучка не звучала в предпросмотре.** Плеер играл только музыку — дорожки голоса в нём не
было вовсе. Теперь обе дорожки синхронизируются одним кодом, учитывают `startAtSec` и
`trimStartSec` и приглушают музыку под голос тем же коэффициентом, что и экспорт: иначе
предпросмотр звучит не так, как файл. Добавлена запись с микрофона (`MediaRecorder`):
записанное уходит тем же путём, что и загруженный файл.

**Сборка стала платной — 2 коина.** Внешним провайдерам склейка ничего не стоит, но занимает
CPU машины; плата отбивает привычку пересобирать ролик по десять раз вместо правки таймлайна.
Списание атомарное, при недоступной очереди коины возвращаются. Цена написана на кнопке.

Прошлые сборки теперь связаны с роликом через `userInputs.videoExport.videoProjectId` —
раньше связь жила только в задаче очереди и после неё терялась.

Проверки E7: `shared` — 86 passed, `worker` — 155 passed, `api` — 239 passed (36 suites),
билды всех воркспейсов зелёные.

## Этап E8 ✅ — Правки редактора по списку владельца

**Запись голоса не работала.** MediaRecorder пишет в `audio/webm` (Chrome) или `audio/mp4`
(Safari), а список разрешённых типов знал только mp3/wav/ogg — запись отбивалась как
«не аудиофайл». Типы расширены в обоих местах (multer-фильтр и file-service) вместе с
расширениями файлов.

**Звук доигрывал после остановки.** Видео-элементы живут в ref внутри `useMediaElements`, а
не в разметке, поэтому при размонтировании холста продолжали играть. Добавлена остановка
всех элементов на размонтировании.

**Первое фото вставало поверх заливки маленьким прямоугольником** — и выглядело это как
«добавил картинку, а появился залитый фон». Теперь первое медиа ЗАМЕНЯЕТ пустую
заливку-подложку и занимает весь кадр; вторым и далее слоям по-прежнему даётся меньший
сдвинутый прямоугольник, чтобы предыдущий кадр не пропадал из вида.

**«Один кадр» в коллаже ничего не менял.** Рамку получал только первый слой, второй
оставался поверх — раскладка выглядела нерабочей. Теперь в этой раскладке во весь кадр
разворачиваются ВСЕ кадры (верхний виден, остальные под ним и никуда не пропадают), и
вписывание переключается на `contain`: обрезать единственное фото по краям никто не просил.

**Панель звука переделана.** Две вкладки (Музыка / Голос) на всю ширину вместо двух узких
колонок, в которых кнопки не помещались. Загрузка и запись — иконками, выбор голоса и эмоции
— выпадающими списками вместо стены кнопок.

**Сцены переехали на шкалу времени.** Ширина блока сцены равна её длительности, ряд стоит над
дорожками музыки и голоса — видно, где заканчивается сцена и куда попадает реплика. Действия
(сдвинуть, дублировать, удалить, добавить) остались рядом с дорожкой и работают с выбранной
сценой.

**Референсы в панели ИИ.** Заглушка «с нуля» стала кнопкой прикрепления файла, а под ней —
слоты по числу референсов, которые принимает выбранная модель (для omni это два фото плюс
видео). Слоты собираются тем же общим `chatReferenceSlots`, что и скрепка в чате, и уходят в
`params` — то есть «объединить два фото» работает так же, как в Allvision AI.

**Переходы шли по застывшей картинке.** Причина не в переходах: сцена сохраняла прежнюю
длительность, а приехавший из генерации клип оказывался короче — ffmpeg дотягивал сцену
последним кадром (`overlay` по умолчанию повторяет последний кадр на EOF). Теперь при
подстановке генерации и при вставке из библиотеки браузер измеряет длину клипа и подгоняет
длительность сцены под него.

Проверки E8: `shared` — 86 passed, `worker` — 155 passed, билды api и web — зелёные.

**Не сделано в этом заходе** (осознанно, отдельной задачей): каталог шаблонов сцен с
картинками-превью, которые владелец загружает через админку, и отдельная секция шаблонов для
совместных фото (обнимаются, целуются, смеются, в студии). Под это уже есть подходящая модель
`StylePreset` с полями `kind`/`thumbnail`/`promptText` и готовый экран `/admin/style-presets`,
так что работа сводится к новым видам пресетов, сиду с осмысленным набором и плитке с
превью в панели ИИ вместо текстовых чипов.

## Этап E9 ✅ — Каталог шаблонов сцен с превью из админки

Последний невыполненный пункт из списка владельца: шаблоны сцен должны быть квадратами с
картинкой-примером, которую он загружает сам, плюс отдельная секция для совместных фото.

Отдельной модели не заводил: у `StylePreset` уже есть `kind`, `title`, `description`,
`promptText`, `thumbnail`, `sortOrder`, `isActive` и готовый экран `/admin/style-presets`.
Добавлены два вида — `editor-scene` (работа с одним кадром) и `editor-scene-duo`
(совместные кадры, где в промпте прямо сказано сохранять обе внешности без подмены лиц).

- Список видов вынесен в общий `STYLE_PRESET_KINDS` (shared). Раньше он был продублирован
  строками в четырёх местах — админском роутере, публичном роутере, типах RTK и странице
  админки, — и новый вид пришлось бы дописывать в каждое.
- `POST /api/admin/style-presets/thumbnail` кладёт картинку в те же `service-assets`, что и
  обложки услуг, и возвращает ссылку. Поле превью в админке получило кнопку загрузки и
  показывает саму картинку: без неё «загружу превью» означало сначала залить файл куда-то
  ещё и вручную найти URL.
- Сид добавляет 15 шаблонов: восемь одиночных (кадр оживает, медленный наезд, золотой час,
  снегопад, салют, свечи, студия, альбом) и семь совместных (обнимаются, целуются, смеются,
  вдвоём в студии, танцуют, поднимают бокалы, идут вместе). Превью не заполняются — их
  прикладывает владелец.
- В панели ИИ шаблоны рисуются плитками с превью двумя секциями. Пока каталог пуст,
  показывается прежний встроенный список: редактор не должен остаться без подсказок на
  свежей установке.

Проверки E9: `shared` — 86 passed, `database` — 6 passed, API-тесты пресетов — 5 passed,
билды shared/database/api/web — зелёные.

## Этап E10 ✅ — Сборщик зависших генераций, цены по факту, чистка allowlist

**Сборщик брошенных генераций** (`stalled-generation-reaper`). Задачу обрывает перезапуск
воркера или выкат; очередь обычно отдаёт её повторно (это чинилось в E6.1), но если попытки
исчерпаны — проект навсегда остаётся в `PROCESSING`: коины списаны, страница крутит прогресс,
файла не будет. Раз в пять минут ищем проекты старше получаса, которых НЕТ ни в одной
очереди, закрываем с `GENERATION_ABANDONED` и возвращаем коины.

Ключевое решение: признак брошенности — отсутствие задачи в очереди, а не время само по себе.
Долгая генерация это норма (Kling на пятнадцати секундах считает минуты), и закрывать её по
таймеру значило бы отменять оплаченную работу. Если Redis недоступен, обход падает целиком и
не закрывает ничего: ошибочный отказ хуже лишних получаса ожидания. Статус проверяется
повторно внутри транзакции — за время обхода воркер мог довести проект до конца.

**Цены поздравлений пересчитаны по факту.** Замер по `AIUsageLog` за сутки: Kling 3.0 Standard
— семь успешных вызовов, $3.22, то есть **$0.46 за клип**. Это 37 коинов себестоимости на одну
фотографию при цене 35 — продавали ниже себестоимости. Новая цена: **75 коинов за снимок**
(примерно вдвое от себестоимости) и **100** у мультяшного шаблона, где сверху ложится
стилизация Nano Banana ($0.15). Ролик из шести фото: 450 коинов при себестоимости 222.

Цены обновлены и в сиде (для свежих установок), и напрямую в прод-БД — включая
`priceCoinsPerPhoto` внутри `userInputForm`, по которому считается сумма за все снимки.
Сид существующие услуги не переписывает: каталог живёт в админке.

**`GIFT_PIPELINES_TO_REFRESH` очищен.** В нём лежали все двенадцать шаблонов ради перевода на
Kling 3.0; список перетирает `pipelineConfig` на КАЖДОМ деплое, поэтому дальше он затирал бы
правки владельца в админке. Правило записано прямо в коде: слуг добавляют ровно на один
выкат и сразу убирают.

Проверки E10: `api` — 243 passed (37 suites; добавлен `stalled-generation-reaper.test.ts` —
4 теста: закрытие с возвратом, живая задача не трогается, свежая генерация не трогается,
недоступный Redis ничего не закрывает), `shared` — 86, `worker` — 155, `database` — 6, билды
всех воркспейсов зелёные.

## Этап E11 ✅ — Обложки роликов и живые заказы

**Список роликов получил обложки.** Карточка показывает первый настоящий кадр ролика —
первый медиа-слой с файлом; пустые сцены-заливки пропускаются, чтобы не показывать чёрный
прямоугольник вместо превью. Видео браузер сам рисует первым кадром. Длительность вынесена
на обложку, дата — под названием.

**Заказы заработали по-настоящему.** Механика G6 (типы, бриф, канбан, письма) была на месте,
но раздел стоял пустым: не было ни одного типа заказа, а в форме не хватало двух вещей.

- Сид создаёт формат «Поздравление под ключ» с подробным брифом: повод, задумка, кто в кадре,
  дата, ссылка на референс, исходные фотографии. Create-only, как и услуги: тексты и цены
  владелец правит в админке, и деплой их не затирает.
- Базовая цена — **2990 коинов** (константа `CUSTOM_ORDER_PRICE_FROM_COINS` в shared), итог
  называет менеджер после разбора брифа. Так и написано в интерфейсе: обещать точную сумму
  до разговора нечестно, объём заказных работ отличается в разы.
- **Загрузка исходников прямо в форме**: `POST /api/user/orders/attachments` кладёт файл в
  отдельную папку заявки. Отдельную, а не рядом с генерациями, потому что у заявки другой
  срок жизни — она живёт, пока идёт работа с менеджером. Это закрывает долг G6.
- **Способ связи**: MAX, Telegram или WhatsApp с ником/номером — миграция
  `20260828120000_order_contact_channel` добавила `contactMessenger` и `contactHandle`
  отдельными колонками. В JSON брифа им не место: это контакт, а не ответ на вопрос, и
  админской карточке он нужен рядом с именем и почтой. Не выбрал мессенджер — общаемся
  почтой, как раньше.
- Админская карточка показывает выбранный канал, а из статуса «цена названа» теперь можно
  сразу перевести заявку **в работу**: с заказными работами часто договариваются с менеджером
  и платят мимо сайта, и требовать статус «оплачено» ради начала работы значило бы выдумывать
  процесс за него. Запрет остался там, где он важен: выдать результат можно только из «в
  работе».

Проверки E11: `shared` — 88 passed (обновлён тест переходов: прежний запрещал QUOTED →
IN_PROGRESS, теперь проверяется настоящее правило — нельзя выдать неоплаченное мимо работы),
`api` — 243, `worker` — 155, `database` — 6 (в мок Prisma добавлен `orderTypeDef`), билды
всех воркспейсов зелёные.

## Этап E12 ✅ — Редактор в духе CapCut: дорожки и клипы вместо сцен

Три шага по списку владельца. Первый — правки, не трогающие контракт; второй — новая модель
записи ролика; третий — интерфейс монтажа.

### E12.1 — правки редактора и услуг

- **Услуга из редактора падала.** Значения формы уходили строками, а шаг пайплайна ждал
  число (`duration`) — zod отбивал запуск. Значения приводятся к типу поля так же, как это
  давно делает витрина (`coerceFieldValue` в `editor-service-generation.ts`).
- **Прогресс на странице услуги «зависал».** Он рисовался сглаженной анимацией поверх редких
  обновлений и на длинных генерациях подолгу стоял на месте. Процент убран и со страницы
  услуги, и с карточки услуги в редакторе: это не место ожидания — отсюда сразу запускают ещё
  одну генерацию, а ход работы показывает раздел генераций.
- **«Мои» переехали внутрь вкладки ИИ** двумя под-вкладками; после запуска редактор сам
  переключается на «Мои генерации».
- **Выбор категории (фото/видео) и расширенные настройки** в генерации из редактора. Поля
  настроек вынесены из чата в общий модуль `components/ai/advanced-params.tsx`: одна и та же
  модель должна настраиваться одинаково в чате и в редакторе.
- Полосы прокрутки приведены к одному виду на всём сайте (`globals.css`, глобальные правила
  вместо одного класса).

### E12.2 — контракт: дорожки и клипы

`packages/shared/src/timeline/tracks.ts`. Сцена означала «кадры друг за другом, следующий
начинается там, где кончился предыдущий». Из этой записи не следует ничего, что человек ждёт
от монтажа. Появилась вторая форма: дорожки, на которых клипы стоят на своих секундах. Первая
дорожка задаёт кадр целиком, остальные ложатся поверх.

- **Рендер и предпросмотр про дорожки не знают**: `flattenTracks()` раскладывает их обратно в
  сцены, и вся проверенная цепочка сборки (переходы, титры, микс звука) работает без правок.
- **Секунда на шкале = секунда в файле.** Переход задан САМИМ наложением соседних клипов,
  поэтому он ничего не сдвигает. Наложение без перехода — это обрезка предыдущего клипа, как
  потом и склеит ffmpeg.
- **Пауза превращается в заливку**, а не в пропуск: иначе всё дальнейшее уехало бы вперёд.
- **Наложение поверх стыка режется по сценам со сдвигом обрезки** — без этого видео на стыке
  отматывалось бы в начало.
- Чтение сцен ушло в `timelineScenes()`: рендер, предпросмотр и подсчёт длительности зовут её,
  а не `timeline.scenes`. Пока живут обе формы, проверка «а вдруг дорожки» в трёх местах —
  верный способ забыть её в четвёртом.
- Запись результата генерации умеет обе формы: у ролика на дорожках метка ставится в клип,
  иначе монтаж схлопнулся бы в плоский список.
- `scenes` в схеме стали необязательными; `superRefine` требует хотя бы одну из двух форм.

### E12.3 — интерфейс монтажа

- `ClipTimeline.tsx` — шкала с линейкой, курсором, дорожками и звуком в одной колонке. Клип
  тянут мышью по времени и на соседнюю дорожку, края тянут для обрезки, есть прилипание к
  соседям и курсору, зум, разрез под курсором, дубль, удаление и переход на стыке.
- `useTrackEditor.ts` — правила монтажа в одном месте: клип не встаёт поверх соседа (ищется
  ближайшее свободное место), обрезка видео правит и окно файла, разрез продолжает файл с той
  же секунды, дубль не забирает метку генерации, основную дорожку удалить нельзя.
- `MediaLibraryPanel.tsx` + вкладка «Медиа»: все загруженные файлы и образы Студии плитками,
  добавляются кликом или перетаскиванием на дорожку. Для этого загрузка в редактор теперь
  создаёт `MediaAsset` вида `user-upload` — без записи файл существовал только внутри той сцены,
  куда его положили.
- Правая панель показывает настройки выделенного клипа: когда идёт, сколько длится, переход,
  плюс прежний инспектор слоя. Ролик (формат кадра) настраивается, когда ничего не выделено.
- Клавиатура: пробел — играть, S — разрезать, Ctrl+C/V — клип целиком (в том числе на другую
  дорожку), Ctrl+D, Delete, стрелки двигают кадр.
- Удалены `SceneStrip`, `TimelineTracks`, `LayerPanel`, `useEditorTimeline` — их работу делают
  шкала и инспектор клипа.

Проверки E12: shared — 109 passed (12 suites, добавлен `timeline-tracks.test.ts` — 20 тестов:
раскладка, пауза, наложение с переходом и без, разрез наложения по стыку, скрытая дорожка,
обратный перевод сцен в дорожки, генерация в клип, валидация); worker без DB-backed — 149
passed (21 suite, в `timeline-plan` добавлен стык «ролик на дорожках»: длительность по
позициям и `xfade` на той же секунде); билды всех воркспейсов зелёные. DB-backed API-тесты
локально не гонялись — Docker-демон не запущен.

Долг E12: у операций дорожек нет юнит-тестов (в web-воркспейсе нет тест-инфраструктуры);
скорость клипа (замедление/ускорение) не реализована — «растянуть» сейчас значит обрезать;
ролик переводится на дорожки при первом открытии в редакторе, отката к сценам нет.
