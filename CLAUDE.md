# Allvision Academy — персонализированная онлайн-школа (реворк)

## Что это

С 2026-07-20 проект реворкается из Allvision Studio (gift factory) в **Allvision Academy**: персонализированную онлайн-школу, где ребёнок проходит учебную программу внутри интерактивного приключения вместе с живым преподавателем. Нейросети создают реалистичного персонажа с внешностью ребёнка, позы, сюжетные иллюстрации и кат-сцены; учитель ведёт занятие по видеосвязи и управляет сценами; браузерная игра превращает материалы в интерактивный урок. Направления: английский, нейросети/AI-контент, программирование, позже — школьные дисциплины.

Точка отката к Studio: git tag `v0.2-allvision-studio-final`.

## Ключевые решения реворка

- **Бэкенд остаётся Express+Prisma+BullMQ** (NestJS из концепт-дока отклонён): сохраняем боевой AI-слой (fal/PiAPI, прокси, ретраи, учёт затрат), auth, платежи, деплой.
- **Движок сцен — PixiJS** (кастомный редактор слоёв + событийная логика «событие→условие→действие»).
- **Видеосвязь — self-hosted LiveKit** (план Б — внешний сервис).
- **Дизайн — светлая бело-оранжевая премиальная тема** (`.academy-theme` в globals.css); старые Studio-экраны доживают в тёмной теме до катовера.
- **Разработка аддитивно в main**: новые модели/роуты рядом с legacy, прод остаётся рабочим; промежуточные коммиты с `[skip ci]`, деплой вручную по SSH на границах этапов (push в main без [skip ci] триггерит платный Actions-деплой).
- Роли: родитель = User с ролью `PARENT` (новые регистрации), ребёнок = `ChildProfile` под родителем (не User), `TEACHER`/`METHODIST` — роли User. Legacy `USER` действует как родитель (`requireParent`).

## План этапов Academy

A1 ✅ модель данных и роли · A2 ✅ AI-профиль персонажа · A2.5 ✅ cutover-lite (Academy — лицо фронта) · A3 ✅ программы и прогресс · A4 ✅ запись и деньги · A5 ✅ панель генерации · A6.1–A6.6 ✅ конструктор, многосценовый урок и AI-сцены · A7 🚧 проведение урока (ядро + надёжность + зеркалирование интерактива A7.1/A7.2 ✅, видео A8) · A8 видеосвязь (LiveKit) · A9 ✅ геймификация · A10 ✅ отчёты/мессенджер/выплаты/удаление данных · A11 🚧 локальный катовер A11.1–A11.2 ✅, production DoD ждёт A8/деплоя.

Полная концепция (типы пользователей, структура урока, конструктор, библиотеки, защита данных) — в переписке владельца; секции этапов ниже дополняются по мере реализации.

---

# [Legacy до катовера] Allvision Studio — AI-фабрика цифровых подарков

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

## Этап A1 ✅ — Academy: модель данных, роли, семья, учебная программа, дизайн-токены

Первый этап реворка Allvision Academy (см. шапку файла).

Prisma (миграция `20260720120000_a1_academy_core`, написана вручную — Postgres локально не поднят):

- `Role` расширен: `PARENT`, `TEACHER`, `METHODIST`. Регистрация теперь создаёт `PARENT`; legacy `USER` действует как родитель через `requireParent`.
- `ChildProfile` — ребёнок НЕ User: профиль под родителем (name/birthDate/notes + заготовки геймификации level/xp/streakCount/streakFreezes для A9), cascade delete.
- `Consent` — согласия родителя по ребёнку, 5 типов (`ConsentType`: IMAGE_PROCESSING, AI_CHARACTER, AI_GENERATION, EXTERNAL_PROVIDERS, DATA_RETENTION), unique(childId, type), повторное принятие после отзыва — upsert (revokedAt=null).
- `ChildPhoto` — исходные фото ребёнка в **закрытом хранилище**: НЕТ publicUrl, файлы лежат в `CHILD_PHOTOS_DIR` (`./private-uploads/child-photos`, прод `/app/private-uploads/child-photos`) ВНЕ uploads/, nginx их не раздаёт; выдача только через авторизованный эндпоинт с ownership-проверкой.
- Учебная программа: `Subject` → `Course` (level/ageMin/ageMax) → `CourseModule` → `Topic` (durationMin 25|45, difficulty, goal, `content Json` для слов/сценария/наград/домашки, aiBudgetUsd) → `SkillDef` + join `TopicSkill`. Всё cascade.

Shared (`packages/shared/src/academy/`): `CONSENT_DEFINITIONS` (русские тексты согласий), `hasAllPhotoConsents`, zod-схемы child-профиля (возраст 2–18), curriculum-схемы, DTO. Экспорт через корневой index.

API:

- `requireRole(...)` фабрика в `middleware/require-role.ts` (ADMIN проходит всегда), `requireParent` (PARENT|USER), `requireMethodist`. `JwtRole` расширен.
- `/api/family/*` (requireAuth+requireParent): CRUD детей; POST/DELETE consents (принятие списком, отзыв по типу); фото — список/upload (multer `photos[]`, image-only, 15MB, максимум 10 на ребёнка)/удаление; `GET .../photos/:photoId/file` стримит файл из закрытого хранилища. **Upload фото заблокирован (403 CONSENTS_REQUIRED), пока не приняты все 5 согласий**; отзыв любого согласия снова блокирует. Удаление ребёнка каскадно чистит БД и файлы (`deleteChildPhotoDir`).
- `/api/academy/curriculum/*` (requireAuth+requireMethodist): дерево программы одним GET + CRUD subjects/courses/modules/topics(+skillIds)/skills, slug-коллизии 409, человекочитаемые русские ошибки.

Web:

- **Дизайн-токены Academy**: `.academy-theme` в globals.css — светлая бело-оранжевая премиальная тема (белая база, тёплые нейтральные, primary orange 24 94% 50%, radius 0.875rem, animate-academy-in). Scoped: Studio-экраны остаются тёмными до катовера; новые Academy-экраны оборачиваются в `.academy-theme`.
- `/family` — первый Academy-экран (кабинет родителя): список детей с уровнем/XP/бейджами, добавление профиля, чекбокс-блок согласий с полными текстами, загрузка/просмотр/удаление фото (превью через авторизованный fileUrl, не /static), удаление профиля с подтверждением. RTK slice `family-api.ts` зарегистрирован в store. В sidebar добавлен пункт «Семья» (`/family`).

Инфраструктура: `.gitignore` + env-примеры получили `CHILD_PHOTOS_DIR`; в `docker-compose.prod.yml` api-контейнеру добавлен bind mount `/opt/allvision-studio/shared/private-uploads:/app/private-uploads` (на ВМ каталог нужно создать с owner 1000:1000 перед деплоем A1).

Попутные фиксы: `SupportActor.role` расширен до `JwtRole` (билд падал после добавления ролей).

Проверки A1: `prisma generate` — ок (dev не запущен, EPERM не было); билды shared/database/api/worker/web — зелёные; shared `academy-consents` — 9 passed. DB-backed API-тест `family.test.ts` (17 тестов: PARENT-роль при регистрации, ownership 404 для чужого ребёнка, consent-gate загрузки фото, авторизованная раздача файла, каскад удаления, доступ методиста к curriculum, дерево subject→course→module→topic+skills) написан, но локально не гоняется без Postgres `localhost:5433`/Docker — прогнать на проде/CI как в прошлых этапах.

Долги A1: worker не имеет доступа к private-uploads (понадобится в A2 для генерации персонажа — добавить mount и резолв ключей); согласия фиксируются без снапшота текста версии (только version-строка); детский вход (отдельный доступ ребёнка) не реализован — по концепции появится позже; фото-эндпоинт отдаёт оригиналы без превью-даунскейла.

## Этап A2 ✅ — Academy: AI-профиль персонажа ребёнка

Второй этап реворка. Из загруженных фото ребёнка (A1) создаётся утверждаемый «профиль внешности» — эталонный набор референсов, который дальше используют все генерации Academy (позы, сцены, кат-сцены).

Prisma (миграция `20260720150000_a2_character_profile`, вручную — Postgres локально не поднят):

- `CharacterProfile` (childId unique, status DRAFT|GENERATING|READY|APPROVED|FAILED, progress, errorMessage, approvedAt) — один профиль на ребёнка, cascade delete.
- `CharacterReference` — референс в **закрытом хранилище** (`CHARACTER_REFS_DIR`, без publicUrl): kind, storageKey, width/height, promptUsed, model, costUsd. Раздача только через авторизованный эндпоинт.
- 7 kind'ов: portrait, profile_side, three_quarter, full_body, neutral_pose, expression_joy, expression_surprise (раздел 7 концепции).

Shared (`packages/shared/src/academy/character.ts`): `CHARACTER_REF_KINDS`, русские подписи `CHARACTER_REF_LABELS`, identity-промпты `CHARACTER_REF_PROMPTS` (сохранение внешности + кинематографический стиль, НЕ плоская мультяшка), дефолтная модель `nano-banana`, бюджет-потолок $3, DTO. Новая очередь `CHARACTER_PROFILE` + `CharacterProfileJobData` в `types/queue.ts`.

Worker (`processors/character-profile.ts`, очередь `character-profile`, concurrency 1):

- Читает до 3 фото ребёнка из закрытого хранилища (`utils/private-storage.ts`, тот же bind mount что у api), EXIF-поворот + downscale ≤1600 → data-uri.
- Для каждого kind вызывает `AIProvider.imageEdit` (fal nano-banana; `image-edit` блок) с identity-промптом и остальными фото как доп. референсами; результат пишет в закрытое хранилище, создаёт `CharacterReference`, двигает progress, публикует SSE.
- Контейнер генерации — `Project` (mode `character-profile`, `inputText`=profileId) для FK `AIUsageLog`/SSE/админ-обзора; worker находит свой pending-проект по этим полям.
- Бюджет-гейт (`CHARACTER_PROFILE_MAX_USD`, дефолт $3) поверх дневного капа; при превышении — FAILED с дружелюбным сообщением. Ошибка любого шага → FAILED, частичные референсы сохраняются. Перегенерация одного kind заменяет старые референсы этого вида (и файлы).
- `readOutputBytes` тянет результат из data-uri/stub/локального /static/внешнего URL; для /static-копии детского контента делает cleanup (не оставляем в публичном uploads).

API (`/api/family/children/:childId/character/*`, requireParent + ownership):

- `GET` — профиль + референсы с авторизованными fileUrl; `POST /generate` — гейт всех 5 согласий + ≥1 фото, создаёт/перезапускает профиль и ставит job (409 при GENERATING); `POST /approve` (READY→APPROVED); `GET .../references/:refId/file` (стрим из закрытого хранилища); `DELETE .../references/:refId`; `POST .../references/:refId/regenerate` (перегенерация одного kind). Удаление ребёнка чистит и каталог референсов.

Web (`/family`): в карточку ребёнка добавлен блок «AI-персонаж» — статус-бейдж, прогресс-бар (поллинг 3с), сетка референсов с русскими подписями, кнопки «Создать персонажа»/«Создать заново»/«Утвердить», per-ref «Перегенерировать»/«Удалить». Тема `.academy-theme`. RTK slice расширен эндпоинтами персонажа.

Инфра: worker-контейнеру добавлен bind mount `private-uploads` (compose); env `CHILD_PHOTOS_DIR`/`CHARACTER_REFS_DIR`/`CHARACTER_PROFILE_MODEL`/`CHARACTER_PROFILE_MAX_USD` в worker/.env.example, infra и корневом .env.example.

Проверки A2: `prisma generate` — ок; билды shared/database/api/worker/web — зелёные; shared `academy-character` — 3 passed (промпты/kind'ы/модель в каталоге), worker `character-profile-utils` — 6 passed (readOutputBytes: data-uri/stub/local-static+cleanup/path-traversal, toDataUri). DB-backed `family.test.ts` дополнен 7 тестами персонажа (null до генерации, GENERATING + создание Project, 409 при повторе, ownership 404, approve до READY = 409, PHOTOS_REQUIRED) — локально не гоняется без Postgres, прогнать на проде/CI.

Долги A2: identity-похожесть на mock не проверить — реальный fal-смоук на проде первой генерацией (nano-banana, ~$0.8–1.5 за набор из 7); превью-даунскейл выдачи файла не делается (отдаём оригинал); нет отдельного admin-обзора персонажей (только через Project). Закрыт долг A1 «worker без доступа к private-uploads».

## Этап A2.5 ✅ — Cutover-lite: Academy становится лицом продукта (фронт)

По решению владельца визуальный катовер вынесен вперёд из A11 (чтобы `npm run dev` больше не показывал gift-factory Studio). Аддитивный принцип сохранён: **удалений не было** — витрина Studio скрыта редиректами, бэкенд услуг/тренды/эпизоды/персонажи/заказы и вся админка Studio остались рабочими (от них зависят чат и этапы A3–A10).

- **Навигация** (`components/dashboard/sidebar-nav.tsx`): только Academy — Главная / Семья / Нейролаборатория (AI-чат) / Профиль (+ Админ панель для ADMIN). Убраны Услуги/Студия/Тренды/Поддержка из основного меню.
- **Воркспейс перекрашен в светлую Academy-тему**: `DashboardSidebar`, `DashboardSidebarMobile`, `UserWorkspaceShell` переведены с тёмных slate-классов на токены `.academy-theme` (bg-card/bg-background/text-foreground/bg-primary/border-border). Бренд «Allvision Studio» → «Allvision Academy». Из сайдбара убран gift-factory блок баланса коинов и «Купить» — оставлены профиль + выход (деньги Academy = баланс занятий, A4).
- **Главная `/`** (`app/page.tsx` + `components/academy/AcademyHome.tsx`): для гостя — Academy-лендинг (герой «ребёнок — главный герой урока», 3 направления, как это работает, CTA войти/регистрация); для авторизованного — хаб (приветствие, быстрые действия Семья/Нейролаборатория, плейсхолдер «уроки скоро»). Старый `HomePageContent` (gift factory) больше не используется, но оставлен в репо. Метаданные/JSON-LD главной обновлены под школу.
- **AppShell**: гостевой `/` рендерится «голым» (без Studio Header/Footer) — Academy-лендинг самодостаточен.
- **Middleware**: витрина Studio (`/services`, `/trends`, `/scenarios`, `/studio`, `/pricing`, `/dashboard`) редиректит 301 на `/` для всех. Оставлены `/ai`, `/family`, `/profile`, `/support`, `/admin`, auth. Бэкенд-роуты (`/api/*`) и `/admin/*` не тронуты.
- **Чат `/ai`**: переименован в «Нейролабораторию» (fallback-заголовок). Глубокая перекраска внутренностей чата (страница + `ChatHistoryList`/`ChatResultView`/`ChatForm` — тяжёлый тёмный UI) НЕ делалась: частичная перекраска ломает вид, полная — большой отдельный заход. Пока чат остаётся тёмной самодостаточной поверхностью, доступной из светлого сайдбара.

Проверки A2.5: `npm.cmd run build -w @allvision/web` — зелёный, все роуты генерируются (Studio-страницы существуют, но недостижимы через UI из-за middleware).

Долги A2.5 (в бэклог перекраски / к A11): обновить `sitemap.ts` (ещё перечисляет services/trends/scenarios) и Studio `Header`/`Footer`/легальные страницы (`/about`,`/contacts`,`/offer`…) под Academy; физическое удаление legacy Studio-кода — отдельным решением на A11, когда ничего живое от него не зависит.

### A2.5.1 ✅ — Полная светлая перекраска: чат, профиль, auth + фикс кнопки

Добито то, что A2.5 оставил тёмным.

- **Кнопка (`ui/button.tsx`)**: вариант `outline` был захардкожен в тёмный slate (`bg-slate-800`) — на светлом лендинге «Войти» выглядела тёмной кнопкой с тёмным текстом (жалоба владельца). Переведён на токены: `border-input bg-background text-foreground hover:bg-accent`. Тема-корректно и в Academy (светло), и в админке (там outline-кнопки станут светлыми на тёмном zinc — читаемо, косметика внутреннего инструмента).
- **Auth (`(auth)/*`)**: новый премиум Academy-лейаут (светлый фон + тёплое оранжевое radial-сияние, бренд «Allvision Academy» с Sparkles), карточки с заголовком+подзаголовком (`CardDescription`) на login/register/forgot/reset/verify. Формы используют токен-компоненты → primary-кнопка автоматически оранжевая. Редиректы `login`/`register` `/dashboard` → `/`; убран gift-factory welcome-тост про коины → Academy-текст «добавьте профиль ребёнка».
- **Профиль (`/profile`) и чат (`/ai` + `ChatForm`/`ChatHistoryList`/`ChatResultView`/`InputSourcePicker`/`ReferenceLightbox`)**: системная конверсия тёмных utility-классов в токены темы (slate→background/card/muted/secondary/border/foreground/muted-foreground; violet-акцент→primary; amber→primary/accent; emerald-успех→читаемые emerald-700/50). Чёрные/белые оверлеи лайтбокса оставлены (стандартный тёмный просмотрщик медиа). Портал-Sheet чата обёрнут в `academy-theme`. После конверсии выловлены и починены 5 мест «оранжевый фон + тёмный текст» (активные табы профиля, бейджи, кнопка нового чата) → `text-primary-foreground`.

Проверки A2.5.1: `npm.cmd run build -w @allvision/web` — зелёный. Осталось тёмным только: админка (внутренняя, `admin-theme` намеренно тёмная) и Studio-витрина (скрыта редиректами).

## Этап A3 ✅ — Academy: программы и прогресс

Методист ведёт учебную программу в админке; система хранит прогресс ребёнка по темам и навыкам и рекомендует следующую тему.

Prisma (миграция `20260721120000_a3_progress`, вручную):

- `Enrollment` (childId+courseId unique, status ACTIVE|PAUSED|COMPLETED) — запись ребёнка на курс.
- `TopicProgress` (enrollmentId+topicId unique, status LOCKED|RECOMMENDED|IN_PROGRESS|COMPLETED, completedAt, teacherNote).
- `SkillProgress` (childId+skillId unique, level 0..3) — «знает числа 1–10» и т.п.
- `TopicChangeLog` (fromTopicId/toTopicId, reason REPEAT|GAP|PARENT_WISH|SPECIAL_PROJECT, note, changedById) — журнал ручной смены рекомендованной темы. Всё cascade.

Shared (`packages/shared/src/academy/progress.ts`): статусы/причины + русские подписи, уровни навыков; **чистая функция `computeNextTopic(orderedTopics, completed)`** — первая незакрытая тема по порядку (модуль→тема) с учётом prerequisites; `readTopicPrerequisites(content)` мягко читает `Topic.content.prerequisites: string[]`; zod-схемы (enroll/topic/skill/override) и DTO.

API-сервис `academy-progress-service.ts`: `buildChildProgress`/`buildEnrollmentProgress` собирают DTO; резолвинг рекомендованной темы — приоритет IN_PROGRESS → явный RECOMMENDED (override преподавателя) → алгоритм.

API:

- `/api/family/*` (родитель, ownership): `GET /courses` (активные направления→курсы для записи), `GET/POST/DELETE /children/:id/enrollments`, `GET /children/:id/progress`.
- `/api/academy/progress/*` (requireRole TEACHER|METHODIST, ADMIN всегда): `POST /topic` (статус темы; авто-COMPLETED энролмента когда все темы пройдены), `POST /skill` (уровень навыка), `POST /enrollments/:id/override` (смена темы с обязательной причиной → TopicChangeLog), `GET /enrollments/:id/next-topic`.
- Валидация: тема должна принадлежать курсу энролмента; курс активен; дубль-enrollment → 409.

Web:

- **Admin `/admin/curriculum`** (пункт «Программа» в группе «Академия», тёмная admin-тема): master-detail Направления → Курсы(+навыки направления) → Модули+Темы. Редактор темы: название, цель, длительность 25/45, сложность, AI-бюджет, навыки (мультивыбор), prerequisites (мультивыбор тем курса). RTK slice `admin-curriculum-api.ts` поверх готового с A1 CRUD `/api/academy/curriculum/*`.
- **`/family`**: блок «Программы и прогресс» в карточке ребёнка — запись на курс (каталог по направлениям), прогресс-бары курсов, список тем со статусами и бейджем «Следующая», освоенные навыки с уровнями. `family-api` расширен (courses/progress/enroll/unenroll).

Проверки A3: билды shared/api/worker/web — зелёные; shared `academy-progress` — 9 passed (алгоритм next-topic: порядок, prerequisites, blocked, allCompleted; readTopicPrerequisites). DB-backed `academy-progress.test.ts` (enrollment, рекомендация, methodist-only мутации, override+журнал, авто-завершение курса) — локально не гоняется без Postgres, на CI/проде. Windows EPERM на `prisma generate` (запущен dev держит engine DLL) — TS-типы Prisma пишутся до замены DLL, поэтому tsc-сборки зелёные; на проде generate идёт в Docker.

Долги A3: enrollment сейчас self-service родителем (в A4 привяжется к записи на урок/оплате); нет drag-and-drop переупорядочивания тем/модулей (только через sortOrder в API); teacher-кабинет для отметки прогресса появится в A4 (пока мутации доступны методисту/админу).

## Этап A4 ✅ — Academy: запись и деньги

Родитель покупает абонементы (предоплаченный баланс занятий), записывает ребёнка к преподавателю на свободный слот; преподаватель ведёт расписание и получает 30% от стоимости урока.

Prisma (миграция `20260721160000_a4_booking`, вручную):

- `TeacherProfile` (userId unique, subjects[], isActive), `TeacherSlot` (конкретный datetime UTC, durationMin, isBooked).
- `LessonCredit` (parentId, durationMin, source purchase|refund|manual, consumedAt, lessonId) — баланс занятий = непотреблённые кредиты; **непереводим/невыводим**.
- `Lesson` (childId, teacherId, slotId unique, topicId?, durationMin, startsAt, status, priceRub, creditId, cancelledBy/Reason) + `LessonStatus` (BOOKED→…→REPORT_SENT, CANCELLED_*, NO_SHOW).
- `TeacherEarning` (lessonId unique, amountRub, status PENDING|AVAILABLE|PAID|REJECTED).
- `PaymentPurpose` расширен `LESSON_PACKAGE`.

Shared (`packages/shared/src/academy/booking.ts`): сетка цен (25мин=1000₽/45мин=1500₽), пакеты 1/4/8/16 со скидками 0/3/7/12% (`buildLessonPackages`, `lessonPackagePriceRub` — совпадает с опубликованной таблицей), `TEACHER_SHARE=0.3` + `teacherEarningRub`, статусы урока/выплат с подписями, **правила отмены `resolveCancellation`** (преподаватель/система — всегда возврат; родитель — возврат при ≥8ч до урока, иначе кредит сгорает), zod-схемы, DTO.

Платежи: `createLessonPackagePayment` (зеркало topup, purpose `LESSON_PACKAGE`, детали пакета в metadata) переиспользует существующий mock/Robokassa-флоу; провайдеру передаётся label `topup`, грант завязан на `Payment.purpose`. В `applyPaymentEvent` добавлена ветка: при успехе создаётся N `LessonCredit(source=purchase)`.

API (`/api/academy/*`, `academy-booking-service.ts` + `academy-booking.ts`):

- Родитель (requireParent): `GET /packages` (каталог), `POST /packages/purchase` (→ confirmationUrl), `GET /balance` (кредиты по длительности), `GET /teachers` (активные препы со свободными будущими слотами, фильтр по subject), `POST /booking` (атомарно занимает слот + потребляет кредит + создаёт урок и начисление PENDING; 402 при нехватке кредитов, 409 при гонке за слот), `GET /lessons`, `POST /lessons/:id/cancel` (правила отмены → возврат/сгорание кредита, освобождение слота, earning REJECTED).
- Преподаватель (requireRole TEACHER, профиль создаётся лениво): `GET /teacher/me`, `GET/POST/DELETE /teacher/slots`, `GET /teacher/lessons`, `POST /teacher/lessons/:id/status` (COMPLETED → earning AVAILABLE, NO_SHOW → REJECTED), `GET /teacher/earnings` (сводка по статусам).

Web:

- **Навигация по ролям** (`sidebar-nav.tsx`): у родителя добавлен пункт «Занятия» (`/lessons`); у роли TEACHER отдельный сайдбар (Кабинет `/teacher` / Нейролаборатория / Профиль). `DashboardSidebar` выбирает набор по роли.
- **`/lessons`** (родитель, academy-theme): карточка баланса, модалка абонементов (покупка → редирект на оплату), запись (выбор ребёнка → преподаватели со слотами → бронь по клику), «Мои уроки» со статусами и отменой.
- **`/teacher`** (преподаватель, academy-theme): управление слотами (datetime-local → ISO, добавить/удалить свободный), уроки со сменой статуса, сводка дохода по статусам выплат.

Проверки A4: билды shared/api/worker/web — зелёные; shared `academy-booking` — 7 passed (сетка цен совпала с таблицей, 30% препу, правила отмены 8ч/преп/поздно/уже-прошёл). DB-backed `academy-booking.test.ts` (каталог, слоты teacher-only, 402 без кредитов + откат слота, бронь+потребление кредита+earning 300₽, дубль-бронь 409, отмена+возврат кредита+освобождение слота, COMPLETED→earning AVAILABLE) — локально не гоняется без Postgres, на CI/проде. Windows EPERM на `prisma generate` (dev держит DLL) — tsc-типы актуальны.

Долги A4: слоты только конкретные datetime (recurring-шаблоны недели — позже); TZ хранится/сравнивается в UTC, UI показывает локально (без явного выбора TZ, дефолт браузера); after-payment редирект ведёт на `/profile?tab=billing` (generic), не на `/lessons`; выплаты преподавателю (перевод денег, отметка PAID пятого числа) — это A10 `/admin/payouts`, сейчас только начисления; привязки урока к рекомендованной теме энролмента (A3) в бронировании нет (topicId опционален, преп проставит вручную); онлайн-проведение урока (сцены/видео/WebSocket) — A6–A8.

## Этап A5 ✅ — Academy: панель генерации и три библиотеки

Преподаватель/методист/админ заранее генерирует учебные изображения с оценкой стоимости; generic-материал автоматически попадает в личную библиотеку автора, а материал с внешностью ребёнка — в закрытую персональную библиотеку ученика. Следующий этап — A6 (PixiJS-конструктор сцен, подэтапы A6.1–A6.4).

Prisma (миграция `20260721200000_a5_academy_assets`, вручную):

- `ChildAsset` (`pose|scene|cutscene|project`) с child/createdBy, закрытым `storageKey`, model/prompt/cost/params, `sourceRefIds`, project-id и медиа-метаданными. Связи каскадны по ребёнку; удаление пользователя-создателя не удаляет детский результат.
- `MediaAsset` расширен nullable-метаданными генерации `generationModel/generationPrompt/generationCostUsd/generationParams`; Academy-kind'ы остаются строками (`academy-background|academy-prop|academy-npc|academy-effect|academy-audio`).
- Новый закрытый корень `CHILD_ASSETS_DIR=private-uploads/child-assets`; удаление профиля ребёнка теперь чистит фото, CharacterReference и ChildAsset-файлы.

Shared (`packages/shared/src/academy/materials.ts`): kind'ы/русские подписи, три scope (`shared|teacher|child`), чистые правила read/mutate/promote, параметры и zod-схема генерации, DTO/drag payload для A6, prompt builder и предварительная стоимость через `estimateModelCostUsd`. Поддержаны типы фон/предмет/NPC/эффект/поза/сцена/ключевой кадр и операции generate/transparent/keyframe/variation/inpaint/upscale; variation/inpaint/upscale требуют библиотечный референс. Детский childId/CharacterReference API-инвариантом запрещён для MediaAsset.

Worker:

- Отдельная BullMQ-очередь `academy-generation` (concurrency 1), не legacy `service-pipeline`, чтобы не смешивать Studio-статистику. Один job создаёт 1–4 результата и обновляет контейнер-`Project(mode=academy-generation)`.
- Генерация переиспользует `AIProvider.imageEdit`; для ребёнка берёт только `APPROVED` CharacterReference из A2, читает их из закрытого хранилища и передаёт data URI. Реальный fal, mock и stub поддержаны; PiAPI для персональных генераций намеренно отклоняется, потому что его текущий адаптер публикует refs во временный R2/outputs.
- Для детского вызова `ProviderRunContext.privateOutput` заставляет FalProvider не писать промежуточный файл в public `uploads`: внешний output скачивается процессором и сразу сохраняется в `private-uploads/child-assets`. Mock при privateOutput возвращает data URI без публичной записи.
- Прозрачный фон — отдельный post-process `fal-ai/birefnet/v2` в PNG (alpha), mock-first ветка без сети. Каждый fal/PiAPI вызов логирует провайдер; mock/stub-вызовы дописывает процессор — всё есть в `AIUsageLog`.
- Generic-output нормализуется и сохраняется в `MediaAsset` автора; детский — только `ChildAsset`. У `Project` детского результата нет `resultImage/publicUrl`, только private asset id в `resultAssets`.

API (`/api/academy/materials`, роли TEACHER|METHODIST|ADMIN):

- `GET /models`, `GET /children`, `POST /estimate`, `POST /generate`, `GET /generations/:id`.
- `GET/PATCH/DELETE /library/:scope`; закрытый `GET /library/child/:id/file`; generic refs проверяются по ownership.
- Shared видна всем ролям панели; личная — только владельцу (ADMIN видит все); детская — ADMIN или преподавателю, у которого есть Lesson с ребёнком. METHODIST персональные детские материалы не видит. Изменять детский asset может создавший назначенный преподаватель либо ADMIN.
- `POST /promote`: только ADMIN физически копирует teacher MediaAsset в shared (не общая ссылка на удаляемый файл). `sourceScope=child` всегда возвращает `CHILD_ASSET_PROMOTION_FORBIDDEN`, включая ADMIN.
- Гейты генерации: действующие 5 согласий, APPROVED-персонаж, назначение преподавателя, ownership референсов, пользовательский maxCost и `Topic.aiBudgetUsd` при переданном topicId.

Web:

- Единый светлый `.academy-theme` workspace на `/teacher/library` и `/admin/library`, пункты в обоих sidebar. Панель содержит тип/операцию/модель/стиль/промпты/ученика/одежду/эмоцию/ракурс/свет/формат/качество/count/alpha/maxCost; стоимость показана до запуска.
- Три вкладки библиотек, поиск, редактирование/удаление, admin-промоушен, выбор карточки как референса, polling прогресса. Каждая карточка draggable и кладёт `application/x-allvision-academy-asset` с нормализованным dragData для A6.
- Новый RTK slice `academy-materials-api` зарегистрирован reducer+middleware.

Проверки A5: `prisma validate` — ok; первый `prisma generate` — ok. Билды shared/api/worker/web — зелёные; database `tsc` — зелёный. Shared `academy-materials` — 9 passed; worker без DB-backed `pipeline-runner|piapi-provider` — 20 suites / 118 tests passed. DB-backed `academy-materials.test.ts` покрывает три библиотеки, назначение преподавателя, mock-first launch фона/позы, запрет детского промоушена и admin-copy — локально не запускался без Postgres, прогнать на CI/проде. Повторный full database build получил ожидаемый Windows EPERM на занятой dev-процессом engine DLL; процесс не останавливался, Prisma types и отдельный tsc актуальны.

Долги A5: реальный fal smoke (включая качество identity и BiRefNet alpha/фактическую цену) — на проде; детский file endpoint пока отдаёт оригинал без отдельного thumbnail/downscale; audio-kind доступен библиотеке, но AI-аудиогенератор в A5 не подключён; inpaint/upscale сейчас выполняются универсальным image-edit prompt поверх обязательного референса (маска-редактор и специализированный super-resolution — будущий UX); UI статуса использует polling 2с, SSE можно подключить позже. Персональная генерация через PROVIDER_MODE=piapi заблокирована до появления private-safe PiAPI transport.

## Этап A6.1 ✅ — Формат сцены и PixiJS runtime-ядро

Первый подэтап самого большого A6 завершён отдельно. Следующий подэтап — A6.2: редактор `/constructor` с canvas-инструментами, слоями, inspector, rule-builder, A5 drag/drop, undo и автосохранением. Prisma-шаблоны/версии остаются A6.3, готовые игровые механики — A6.4.

Shared:

- `academy/scene-format.ts`: строгий версионированный `formatVersion=1` zod-формат сцены. В нём viewport, 6 типов слоёв, полный каталог 22 элементов первого формата, transform/opacity/anchor/responsive, style/content/asset ref, состояния и overrides элемента, анимации, studentInteractive/teacherVisible/accessibility, 5 режимов проверки.
- Правила описаны как `event → conditions[] → actions[]`: события click/key/drag/answer/timer/teacher/video/AI/code/custom; условия по state/variables/score/visibility/role/correctness; действия show/hide/toggle/sound/pose/animation/score/hint/state/variable/transition/next/emit.
- Cross-reference validation отклоняет дубли id, отсутствующие initial state, битые element/state refs в глобальных состояниях и правилах. `parseAcademyScene` — единая точка входа для будущего JSON из БД/редактора.
- `academy/scene-runtime.ts`: чистая детерминированная машина без Pixi/DOM. Приоритет правил стабилен, есть `stopPropagation`, последовательное применение действий, role-safe условия, закрытый по умолчанию переход, эффекты для renderer/host и резолв element-state overrides.

Web:

- Подключён `pixi.js@8.19.0`. `lib/scene-engine/PixiScenePlayer` использует v8 async `Application.init`, scene graph Container → layer → element, zIndex, Graphics/Text/Assets/Sprite, pointer и keyboard events, state redraw, простые runtime-анимации/звук, accessibility overlay и явный destroy WebGL/children/textures.
- Персональный A5 asset (`scope=child`) не проходит через публичный Pixi Assets loader: плеер делает авторизованный `fetch(credentials=include, cache=no-store)` закрытого API-файла, создаёт локальную Texture и уничтожает её вместе с player. URL ребёнка не переносится в public storage.
- React-обёртка динамически грузит Pixi только на клиенте, поддерживает reset/focus/send, student/teacher role и русские loading/error states.
- Витрина «Замок чисел: тайна свитка» доступна на `/teacher/scene-player` и `/admin/scene-player` (пункты в навигации, светлая `.academy-theme`). Поток: открыть свиток → выбрать цифру → получить score/награду → разрешить переход. Есть смена роли, teacher-only hint, debug boundaries и журнал runtime-эффектов.

Проверки A6.1: shared build — зелёный; полный shared Jest — 13 suites / 79 tests (новые scene-format/runtime — 7 passed); API build — зелёный; worker build — зелёный; web production build — зелёный, обе новые страницы вошли в route manifest; отдельный `next start :3100` + headless Chrome/SwiftShader визуально отрисовал Pixi canvas (найденная debug-рамка вне debug mode исправлена и перепроверена). В web остались только 4 прежних react-hooks warning в monitoring/services/AdminServiceForm/ServicesCatalog, A6-файлы предупреждений не дают.

Долги/границы A6.1: это player foundation, не редактор. Responsive-поля пока исполняются через единый логический viewport и CSS aspect scaling; сложные anchor/stretch/layout-resize потребуют canvas редактора A6.2. Drag/drop, DOM-input, настоящий timer, video controls, timeline/enter-exit animation presets и игровые механики поиска пары/сортировки/кодового замка реализуются в A6.2/A6.4. Persistence, immutable publication versions и LessonInstance намеренно не добавлены до A6.3.

## Этап A6.2 ✅ — Конструктор сцен: редактор /constructor

Второй подэтап A6. Методист/админ собирает интерактивную сцену урока: слои, элементы, drag на холсте, инспектор свойств, правила «событие→условие→действие», привязка материалов A5, автосохранение, предпросмотр через PixiJS-плеер A6.1. Следующий подэтап — A6.3 (immutable-версии шаблонов, LessonTemplateVersion, LessonInstance с подстановкой персонажа ребёнка).

Shared (`packages/shared/src/academy/scene-editing.ts` — уже лежал заделом, подключён к index + покрыт тестами):

- Чистые иммутабельные хелперы редактора: `createEmptyScene`, `makeElement`, `addElement`, `updateElement`, `patchElementTransform` (drag), `attachAsset` (dragData A5 → `sceneAssetReferenceSchema` 1:1), `removeElement` (+ чистит связанные правила), `addLayer`/`removeLayer`, `reorderElement`, `addRule`/`updateRule`/`removeRule`, `uniqueSceneId`, `collectSceneIds`, `validateScene` (строгая схема → человекочитаемые ошибки).
- **Фикс:** `makeElement` больше НЕ гонит строгий `academySceneElementSchema.parse` — source-типы (image/character/npc/…) валидны только после прикрепления ассета, поэтому редактор допускает промежуточное невалидное состояние; строгая проверка — по кнопке «Проверить»/при публикации.
- Тест `academy-scene-editing` — 9 passed (пустая сцена валидна, add/move/attach/remove+rules/reorder, validateScene).

Prisma (миграция `20260722120000_a6_2_lesson_template`, вручную):

- `LessonTemplate` (topicId?, title, status `draft|published` строкой, `scene Json` — рабочий черновик AcademyScene, createdById). Immutable-версии и LessonInstance — A6.3.

API (`/api/academy/lesson-templates`, requireRole METHODIST; ADMIN всегда):

- CRUD: list (методист — свои, админ — все), create (пустая валидная сцена через `createEmptyScene`), get, patch (title/topicId/status/scene), delete.
- Черновик сохраняется КАК ЕСТЬ (промежуточные невалидные состояния допустимы), с гардами: размер ≤ 2 MB, `scene.layers` обязан быть массивом. **Публикация** (`status: 'published'`) требует строго валидной сцены (`validateScene`) — иначе 400 `SCENE_INVALID`.

Web (`/constructor`, `.academy-theme`, AuthGuard):

- Список шаблонов (создать/открыть/удалить) + редактор `SceneEditor`.
- Пять зон: топбар (название, статус автосохранения, undo/redo, «Проверить», «Предпросмотр», «Опубликовать») · слева слои+элементы (добавить слой/элемент по типу, выбрать, удалить, reorder) · центр — **DOM edit-canvas** со scale под viewport и **drag-to-move** элементов мышью (pointer capture, коммит трансформа через `patchElementTransform`) · справа инспектор (трансформ x/y/w/h/поворот/прозрачность, текст, материал A5, флаги visible/studentInteractive/teacherVisible, reorder) или свойства сцены (название/фон/цель) · снизу редактор правил (`RulesEditor`) с дропдаунами событий/действий по элементам и состояниям.
- Предпросмотр переключает центр на PixiJS-плеер A6.1 (`AcademyScenePlayer`) с ролью ученик/учитель.
- `AssetPickerDialog` — модалка выбора материала из общей/личной библиотеки A5 (`useGetAcademyLibraryQuery`), клик → `attachAsset` на выбранный элемент.
- Автосохранение debounce 1.5с; undo/redo — стеки снимков сцены (до 50).
- RTK slice `academy-lesson-templates-api` (reducer+middleware в store). Навигация: пункт «Конструктор» в сайдбаре METHODIST (новый `METHODIST_SIDEBAR_SECTIONS`) и в админ-сайдбаре (группа «Академия»).

Проверки A6.2: `prisma generate` — ок; билды shared/api/worker/web — зелёные; `/constructor` в route-манифесте. Shared academy — 53 passed (7 suites, включая новый scene-editing 9). DB-backed `academy-lesson-templates.test.ts` (доступ методиста/запрет родителю, create с валидной сценой, loose-сохранение черновика, отказ невалидной структуры и публикации невалидной сцены) — на CI/проде без Postgres.

Долги/границы A6.2: canvas двигает элементы (drag-move), но resize/rotate — только числами в инспекторе (гизмо-ручки, снаппинг, мультиселект — позже); редактор состояний сцены (states) и условий правил упрощён (условия в UI не редактируются детально — только событие+действия; полный condition-builder позже); drag-and-drop материала прямо на холст не сделан (выбор через инспектор/модалку); персонаж ребёнка в шаблоне — это generic-элемент `character`, подстановка конкретного ребёнка и версии/LessonInstance — A6.3. Публикация пока просто помечает `status=published` (без снапшота версии — A6.3).

## Этап A6.3 ✅ — Версии шаблонов и экземпляры урока

Третий подэтап A6. Публикация шаблона создаёт immutable-снапшот версии; экземпляр урока привязывает версию к конкретному занятию (A4) и ребёнку, подставляя персонажа и применяя оверрайды преподавателя. Следующий подэтап — A6.4 (готовые типы сцен первого релиза: карточки, поиск пары, сортировка, кодовый замок и т.д.).

Prisma (миграция `20260722140000_a6_3_versions_instances`, вручную):

- `LessonTemplate` получил `latestVersion Int` + связь `versions`.
- `LessonTemplateVersion` (templateId+version unique, `scene Json` — immutable-снапшот, publishedById) — версия на момент публикации.
- `LessonInstance` (lessonId unique → A4 Lesson, templateVersionId, childId, `overrides Json`, createdById) — экземпляр урока. Cascade по уроку и версии.
- `Lesson` получил связь `instance LessonInstance?`.

Shared (`packages/shared/src/academy/scene-instance.ts`): чистый `resolveInstanceScene(scene, { character, overrides })` — глубокая копия, подстановка `character`-элементам ассета ребёнка (`scope: child`), скрытие `overrides.hiddenElementIds`; `pickCharacterReferenceKind` (приоритет full_body → neutral_pose → three_quarter → portrait). Тест `academy-scene-instance` — 5 passed (инъекция, скрытие, без мутации оригинала, приоритет вида).

API:

- `POST /api/academy/lesson-templates/:id/publish` (методист-владелец/админ): строгая `validateScene` → создаёт `LessonTemplateVersion` (latestVersion+1), ставит `status=published`. `GET /:id/versions` — список версий. Конструктор теперь «Опубликовать» = новая версия (тост «Опубликована версия N»), а не просто статус.
- `/api/academy/lesson-instances` (`academy-lesson-instances.ts`): `GET /published-templates` (teacher/methodist — опубликованные шаблоны с последней версией для пикера); `POST /` (преподаватель СВОЕГО урока/админ — upsert экземпляра, урок → READY); `GET /by-lesson/:lessonId` (участник); `GET /:id/scene` (участник — resolved-сцена: версия + персонаж ребёнка из APPROVED-профиля + оверрайды); `GET /:id/character/:refId/file` (участник — файл референса персонажа из ЗАКРЫТОГО хранилища).
- Проверка участника: преподаватель урока (`lesson.teacher.userId`), родитель ребёнка (`child.parentId`) или ADMIN. Файл персонажа отдаётся только участнику урока и только если референс принадлежит ребёнку экземпляра.

Web:

- Конструктор: «Опубликовать» сохраняет черновик и вызывает publish → immutable-версия.
- Кабинет преподавателя (`/teacher`): у урока (BOOKED/AWAITING_PREP/GENERATING/READY) блок `LessonPrepare` — «Подготовить урок» (модалка с опубликованными шаблонами → создаёт экземпляр, урок → READY), «Предпросмотр» (resolved-сцена в PixiJS-плеере, роль ученик/учитель; подпись, если персонаж ребёнка ещё не создан), «Сменить шаблон». RTK slice `academy-lesson-instances-api`.

Проверки A6.3: билды shared/api/worker/web — зелёные; shared academy — 58 passed (8 suites, включая scene-instance 5). DB-backed `academy-lesson-instances.test.ts` (publish→версия, bump версии, published-templates, гейт родителя, 404 на чужой урок) — на CI/проде без Postgres. Windows EPERM на `prisma generate` (dev держит DLL) — tsc-типы актуальны.

Долги/границы A6.3: полноценный смоук цепочки «экземпляр → resolved-сцена с персонажем ребёнка → плеер» требует APPROVED-персонажа и реального урока — проверить на проде; переопределения преподавателя пока ограничены `hiddenElementIds` (интересы/сложность/доп-генерации — позже); привязка экземпляра к проведению урока (WebSocket-синхронизация) — этап A7.

## Этап A7 (ядро) ✅ — Живая комната урока: синхронизация, рисование, чат

По прямому запросу владельца сделан упор на центр продукта — живой урок. В этом заходе: WebSocket-синхронизация комнаты, PixiJS-сцена у учителя и ученика, рисование учителя поверх сцены в реальном времени, чат, панель управления учителя, полноэкранный режим. Видеосвязь (камера/микрофон/демонстрация экрана, LiveKit) — визуальный каркас на месте, подключение — этап A8. Полное со-проигрывание интерактива сцены (ответы ученика зеркалятся у учителя) — след. заход (нужен onEvent-хук у плеера).

Библиотеки/инфра:

- Установлен `ws@8.18` в `apps/api` (лёгкий WS-сервер в том же процессе API, без внешней инфры). `@types/ws` в dev.
- Prisma: `LessonChatMessage` (lessonId, authorId, role, body) — история чата урока, переживает реконнект; миграция `20260723120000_a7_lesson_chat`.
- `infra/prod/nginx.prod.conf`: добавлен `location = /ws/lesson` с `Upgrade`/`Connection upgrade`. **Долг деплоя**: хостовый SSL-nginx (вне репо) в `location /` тоже должен пропускать WS-upgrade к докер-nginx.

Shared (`packages/shared/src/academy/lesson-realtime.ts`): типы протокола `LessonClientMessage`/`LessonServerMessage` (nav, unlock, draw-start/append/end/clear, reward, scene-event, chat, presence, state), `LessonStroke`/`LessonRoomState`/`LessonChatEntry`, `LESSON_WS_PATH=/ws/lesson`, палитра рисования. Координаты рисования нормализованы 0..1 (масштаб под любой экран). Плюс `readSceneDocument(json)` — читает документ урока: поддерживает будущий многосценовый `{scenes:[]}` и текущий одиночный `AcademyScene`.

API:

- `apps/api/src/realtime/lesson-ws.ts`: `WebSocketServer` на `/ws/lesson?lessonId=`. Auth по cookie `accessToken` (verifyAccessToken) в handshake; роль в комнате: `teacher` (преп урока или ADMIN) / `student` (родитель ребёнка); прочие — close 4003. Комнаты in-memory: `sceneIndex`, `unlocked`, штрихи по сценам, участники. Учитель — источник истины (nav/unlock/reward/draw только от него). Чат персистится в БД и рассылается всем; scene-event проксируется ДРУГИМ. На join — снапшот `state` + история чата из БД + presence. Heartbeat ping/terminate 30с. Прицеплен в `index.ts` через `initLessonWebSocket(server)`.
- `GET /api/academy/lesson-instances/:id/scenes` (участник) — resolved-массив всех сцен урока (персонаж ребёнка + оверрайды) для комнаты.

Web:

- `apps/web/src/lib/lesson-socket.ts` — типизированный WS-клиент с авто-реконнектом (backoff) и ping; URL из `NEXT_PUBLIC_API_URL` (dev → ws://:4000 напрямую; прод → wss через nginx).
- `apps/web/src/app/lesson/[id]/page.tsx` + `components/academy/lesson/LessonRoom.tsx` — полноэкранная комната (выведена из workspace-шелла через `AppShell`): PixiJS-сцена текущего шага, оверлей рисования (`DrawingCanvas`, нормализованные штрихи, перо только у учителя с выбором цвета/очисткой), чат с историей, видео-панель-каркас (кнопки микро/камеры/демонстрации — disabled, «A8»), presence-индикаторы, статус связи, кнопка полного экрана. Панель учителя: предыдущая/следующая сцена, разблокировать, награда (celebration-оверлей у обоих), перо+цвета+стереть.
- Вход в урок: кнопка «Войти в урок» у преподавателя (`LessonPrepare`, когда экземпляр подготовлен) и у родителя в `/lessons` (для READY/IN_PROGRESS) → `/lesson/:lessonId`.

Проверки A7: билды shared/api/worker/web — зелёные; shared academy — 58 passed (типы realtime без отдельного теста). WS-сервер требует запущенного API+Redis? нет — только API-процесс; комнаты in-memory. Реальный смоук двух ролей (учитель рисует → ученик видит, смена сцен, чат) — локально после `npm run dev` (нужны роль TEACHER, подготовленный экземпляр урока и APPROVED-персонаж для инъекции), на проде — после деплоя A7 + правки хостового nginx под WS.

Долги/границы A7: комнаты in-memory (рестарт API теряет позицию/штрихи, чат персистится — восстановление позиции = долг); интерактив сцены не зеркалится полностью между ролями (нужен onEvent у PixiScenePlayer); многосценовый маршрут пока обычно = 1 сцена (полноценный многосценовый конструктор — A6.4/6.5); видео/демонстрация экрана — A8 (LiveKit).

## Хотфикс A7.1 ✅ — Надёжность WS: состояние комнаты в Redis, джиттер реконнекта

По вопросу владельца о качестве соединения. Решение: socket.io НЕ вводим — для одного API-процесса и WSS-через-nginx сырой `ws` + собственный реконнект легче и без привязки к протоколу; polling-фолбэк socket.io на нашей инфраструктуре не нужен. Вместо этого закрыт единственный реальный пробел — персистентность состояния.

- `apps/api/src/realtime/room-store.ts`: Redis-хранилище состояния комнаты (`lesson:room:{id}`, TTL 24ч) — `sceneIndex`, `unlocked`, штрихи по сценам. Fire-and-forget, при недоступном Redis комната просто работает in-memory (без падений). Штрихи обрезаются (−400) чтобы не раздувать значение.
- `lesson-ws.ts`: при первом входе комната восстанавливается из Redis (позиция + рисунки переживают рестарт API и перезаход); мутации (nav/unlock/draw-*) сохраняются дебаунсом 600мс; при уходе последнего участника — финальный флаш в Redis перед выгрузкой из памяти. Итог: перезагрузка страницы, перезаход и даже рестарт контейнера восстанавливают урок с последнего состояния; чат и так в БД.
- Клиент (`lesson-socket.ts`): экспоненциальный backoff реконнекта получил джиттер ±20%.

Долг (горизонтальное масштабирование): при нескольких API-инстансах нужен Redis pub/sub для broadcast между процессами — сейчас broadcast in-process (прод = 1 контейнер, ок).

Проверки A7.1: билды api/web — зелёные.

## Этап A6.4 (многосценовый урок) ✅ — Урок = последовательность сцен

По запросу владельца: конструктор собирает урок «сцена за сценой» (последовательность иллюстраций), а не одну сцену. Это же оживляет переключение сцен в живой комнате A7. Режимы генерации (фон по промпту → в библиотеку; цельная AI-сцена по референсу ученика) — следующий заход A6.5.

Формат документа урока: `LessonTemplate.scene` теперь хранит `{ scenes: AcademyScene[] }` (документ) ЛИБО одиночную `AcademyScene` (legacy). Единая точка чтения — `readSceneDocument(json)` (shared, добавлен в A7): `.scenes` → массив, `.layers` → обёртка одиночной, иначе `[]`. Версии/экземпляры/комната уже читают через него, поэтому многосценовость прошла сквозь весь стек без изменения A6.3/A7.

API (`academy-lesson-templates.ts`):

- `validateLessonDocument(json)` — валидирует ВСЕ сцены документа (первая невалидная → сообщение «Сцена N: …»). Публикация и `PATCH status=published` теперь проверяют весь документ.
- Проверка формы `PATCH scene` принимает и `.layers` (одиночная), и `.scenes` (документ).
- `lesson-instances/:id/scene` (превью подготовки) отдаёт ПЕРВУЮ сцену документа; `/scenes` — весь маршрут (был с A7).

Web (`SceneEditor.tsx`):

- Состояние переведено с одной `scene` на `scenes: AcademyScene[]` + `activeIndex`; `scene` — производная активная. Undo/redo снимают весь документ (снимок массива сцен); драг на канвасе больше не спамит undo (снимок один раз в начале через `applyNoUndo`+`snapshotForDrag`).
- **Лента сцен** под топбаром: выбор сцены кликом, добавить сцену, дублировать, порядок (левее/правее), удалить (мин. 1). Автосохранение и публикация — всего документа; «Проверить» валидирует все сцены и показывает номер проблемной.
- Существующие инструменты (слои, канвас, инспектор, правила, предпросмотр) работают с активной сценой без изменений.

Проверки A6.4: билды shared/api/web — зелёные; shared `academy-scene-instance` — 8 passed (добавлены тесты `readSceneDocument`). A6.2/A6.3 API-тесты остаются валидными (форма/публикация обратносовместимы: одиночная сцена читается как документ из 1 сцены).

Долг A6.5: режимы генерации в конструкторе — (1) «сгенерировать фон по промпту» инлайн → сохранение в библиотеку A5 → привязка к сцене; (2) режим «цельная AI-сцена»: в шаблоне абстрактный персонаж, при подготовке урока для ученика — генерация всей иллюстрации по референсу ребёнка (per-instance-per-scene ChildAsset) и подстановка в resolved-сцену.

## Этап A6.5 (часть 1) ✅ — Генерация фона по промпту прямо в конструкторе

Первый из двух режимов генерации по запросу владельца: «картинки-фоны админ генерирует по промпту → сохраняются в библиотеку (чтобы не перегенерировать) → ставятся на сцену». Второй режим — «цельная AI-сцена по референсу ученика» — часть 2 (A6.6).

Shared (`scene-editing.ts`): `setSceneBackground(scene, drag)` — находит/создаёт элемент типа `background` на весь вьюпорт в фоновом слое и привязывает ассет; повторный вызов заменяет ассет того же элемента (не плодит фоны). Тест `academy-scene-editing` — 10 passed (добавлен кейс фона).

Web:

- `BackgroundGenerator.tsx` — модалка: промпт → `POST /academy/materials/generate` (kind `background`, nano-banana, 16:9, mock/fal как в A5) → поллинг `/generations/:id` 2с → на COMPLETED находит ассет в библиотеке преподавателя и отдаёт его `dragData`. Результат остаётся в библиотеке A5 — переиспользуется без повторной генерации.
- `SceneInspector` (панель сцены в конструкторе) получил блок «Фон-иллюстрация»: «Сгенерировать по промпту» (BackgroundGenerator) и «Выбрать из библиотеки» (AssetPickerDialog). Оба привязывают фон через `apply(setSceneBackground(scene, drag))`. Галочка ✓ показывает, что у сцены уже есть фон-иллюстрация.
- Полностью переиспользует пайплайн генерации A5 (никаких новых очередей/эндпоинтов); при `PROVIDER_MODE=mock` вернётся демо-картинка.

Проверки A6.5.1: билды shared/web — зелёные; shared academy — 10 passed (scene-editing). API не менялся.

Долг A6.6: режим «цельная AI-сцена» — на сцене флаг генерации + промпт; при подготовке урока для ученика вся иллюстрация генерируется по референсу ребёнка (per-instance-per-scene ChildAsset) и подставляется как фон resolved-сцены. Нужен per-instance пайплайн генерации на этапе prep (модель `LessonInstanceSceneAsset` + worker-джоба + подстановка в `/scenes`).

## Этап A6.6 ✅ — Цельная AI-сцена по референсу ученика

Второй режим генерации из запроса владельца: сцена может генерироваться ЦЕЛИКОМ по референсу ученика. В шаблоне — абстрактный вид (обычная сцена с элементом-персонажем), а при подготовке урока для конкретного ребёнка вся иллюстрация генерируется по его APPROVED-персонажу и подставляется фоном resolved-сцены.

Формат (`scene-format.ts`): у сцены добавлено `generation: { mode: 'layered' | 'full-ai', prompt? }` (опционально, default `layered` — обратная совместимость; строгая схема не ломает старые сцены). readSceneDocument/резолв работают с raw JSON, поэтому поле читается через optional chaining.

Prisma (миграция `20260724120000_a6_6_instance_scene_asset`): `LessonInstanceSceneAsset` (instanceId+sceneId unique, projectId) — связка «экземпляр+сцена → academy-generation Project»; связь `LessonInstance.sceneAssets`.

API:

- `services/academy-full-scene-service.ts`: `ensureFullAiSceneGenerations(instance, requestedById)` — на каждую full-ai сцену с промптом (≥8 симв.) создаёт academy-generation Project (kind `scene`, персонаж ребёнка, referenceIds из APPROVED-профиля) + `LessonInstanceSceneAsset` + ставит job. Идемпотентно (уже запущенные сцены пропускаются); без APPROVED-персонажа — пропуск (сцена остаётся абстрактной). `fullSceneStatuses(instanceId)` — статусы генераций из Project.status/resultAssets.
- `lesson-instances POST` (подготовка урока): после upsert экземпляра fire-and-forget запускает `ensureFullAiSceneGenerations` (не блокирует ответ).
- `GET /:id/scenes`: для full-ai сцен со статусом COMPLETED подставляет сгенерированную детскую иллюстрацию фоном через `setSceneBackground` (scope `child`, participant-URL); возвращает `sceneStatuses`.
- `GET /:id/scene-file/:childAssetId` (участник урока) — отдаёт файл сгенерированной сцены из закрытого child-assets хранилища (проверка принадлежности ребёнку экземпляра).

Web (`SceneInspector` в конструкторе): переключатель «Послойная / Цельная AI-сцена» + промпт для full-ai с пояснением «в шаблоне абстрактно, при подготовке для ученика — по референсу». Блок «Фон-иллюстрация» показывается только в послойном режиме. Полностью переиспользует academy-generation (mock/fal), новых очередей нет.

Проверки A6.6: билды shared/api/worker/web — зелёные; shared academy — 62 passed (формат с generation-полем не сломал строгую схему). DB-backed сквозной смоук (подготовка → генерация scene по персонажу → подстановка фоном → отдача участнику) — на проде: нужны APPROVED-персонаж, реальный fal и проведённая подготовка. Для layered-уроков поведение не меняется (ensureFullAiSceneGenerations выходит рано).

Долг A6.6: индикатор «иллюстрации сцен генерируются» в prep-UI преподавателя (сейчас статус есть в `/scenes.sceneStatuses`, но отдельного экрана прогресса нет — комната покажет абстрактный вид, пока генерация не готова, и сгенерированный фон после); перегенерация full-ai сцены при смене промпта версии.

## Этап A7.2 ✅ — Зеркалирование интерактива и статус AI-сцен

Достроена локально проверяемая часть живого урока без A8/LiveKit и без изменений Prisma.

- `PixiScenePlayer` получил callback `onEvent` для сырого локального runtime-события. Он вызывается для пользовательского ввода (клик, ответ, клавиша), а императивный `send()` применяет удалённое событие без повторного callback — инициатор обрабатывает интерактив ровно один раз, WebSocket-эхо не возникает.
- `LessonSceneEvent` теперь точно повторяет поля `AcademySceneRuntimeEvent` без недоверенной клиентской роли (`sourceElementId`, `targetElementId`, `customName`, `correct` и остальные данные больше не теряются). Сервер по-прежнему шлёт событие только другим участникам и добавляет проверенную handshake-роль в `from`; принимающий `LessonRoom` применяет её через `playerRef.send({ ...event, role: from })`. Поэтому role-условия сцены одинаково исполняются у учителя и ученика.
- `LessonRoom` отправляет каждый локальный `onEvent` как `{ t: 'scene-event' }`; удалённый event попадает в очередь state machine плеера и не отправляется обратно.
- `LessonPrepare` читает уже существующий `GET /academy/lesson-instances/:id/scenes.sceneStatuses` и показывает «N сцен генерируется/генерируются · готово X из Y», финальную готовность или число ошибок. Пока есть `PENDING/PROCESSING`, данные поллятся раз в 2,5с; layered-урок после четырёх пустых ответов перестаёт опрашиваться, чтобы список занятий не создавал постоянную нагрузку. RTK-теги обновляют тот же статус при смене шаблона.

Проверки A7.2: `prisma generate` (через build database) — ok; билды shared/database/api/worker/web — зелёные; shared — 15 suites / 97 tests passed; worker без DB-backed `pipeline-runner|piapi-provider` — 20 suites / 118 tests passed. Web — только 4 прежних `react-hooks/exhaustive-deps` warning вне Academy. DB-backed тесты не добавлялись: схема/API-БД не менялись; двухбраузерный smoke требует подготовленного урока и двух ролей, прогнать локально/на проде после осознанного деплоя.

Долг A7.2: runtime-события зеркалятся в активной комнате, но не журналируются в Redis; после полного ухода обоих участников/пересоздания Pixi-плеера интерактивное состояние сцены стартует заново. Позиция сцены, unlock и рисунки по-прежнему восстанавливаются A7.1, чат — из Postgres. Персистентный replay/runtime snapshot можно добавить отдельно, не смешивая с A8.

## Этап A9 ✅ — Геймификация: XP, уровни, серии, достижения и награды

Добавлен полный локально проверяемый контур детской мотивации без публичных рейтингов и без отдельного детского аккаунта: `/kid/:childId` пока работает под родительским логином, как и требовал план.

Prisma (ручная аддитивная миграция `20260725120000_a9_gamification`):

- `XpEvent` — журнал начислений с `reason`, опциональным `lessonId` и уникальным `idempotencyKey`; повторная отправка завершения урока или teacher-request не удваивает XP.
- `AchievementDef` + `ChildAchievement` — каталог условий (`LESSONS_COMPLETED`, `TOTAL_XP`, `STREAK`) и открытия ребёнка.
- `RewardItem` + `ChildRewardItem` — каталог фонов/рамок/костюмов/эффектов/предметов/локаций/эмоций/артефактов, коллекция и выбранная награда (`equippedAt`). `ChildRewardItem.childAssetId` связывает персональный костюм с готовым `ChildAsset` из закрытой библиотеки A2/A5.
- Миграция идемпотентно кладёт стартовый контент: достижение за первый урок → рамка, серия 3 → огненный фон, 100 XP → персональный костюм исследователя.

Shared (`academy/gamification.ts`): 50 XP за завершённый урок; простая квадратичная шкала `100 × (level − 1)²`; расчёт прогресса уровня; серия по календарным дням Europe/Moscow. Соседний день продолжает серию, ровно один пропущенный день расходует единственную заморозку, больший разрыв сбрасывает огонь до 1. Zod-контракты ограничивают ручное начисление преподавателя (1–100 XP, UUID запроса) и выдачу награды.

API:

- Хук в `POST /api/academy/teacher/lessons/:id/status`: после `COMPLETED` в той же транзакции создаёт `lesson-completed:<lessonId>`, атомарно добавляет XP, пересчитывает уровень/серию, открывает достигнутые достижения и их награды. Повторный `COMPLETED` безопасен.
- `/api/academy/gamification/kids/:childId/profile` и equip/file endpoints — только родителю-владельцу. Персональный образ награды читается только из `private-uploads/child-assets` через авторизованный endpoint; публичного URL/`MediaAsset` для детских данных нет.
- Teacher endpoints проверяют, что у преподавателя есть урок с ребёнком: каталог наград и закрытых ChildAsset, ручное XP за миссию/самостоятельность/старание/проект/домашку и выдача/привязка награды. Персональный костюм без ChildAsset отклоняется.

Web:

- `/kid/:childId` — яркий крупный детский профиль в `.academy-theme`: персонаж, уровень и XP-bar, огонь/заморозка, достижения с прогрессом, коллекция и выбор награды, последние начисления. Изображения закрытых материалов грузятся браузером напрямую через auth-endpoint, чтобы cookies и ownership-проверка не терялись в Next Image optimizer.
- В раскрытой карточке ребёнка `/family` появилась ссылка на игровой профиль; middleware защищает `/kid/:path*`.
- Кабинет `/teacher` получил панель «Мотивация учеников»: быстрые +10 за старание / +20 за миссию, выдача награды и выбор персонального ChildAsset для костюма. Новый RTK slice зарегистрирован reducer+middleware.

Проверки A9: `prisma validate/generate` — ok; билды shared/database/api/worker/web — зелёные; shared — 16 suites / 103 tests passed (новые тесты уровней и Moscow-серии/заморозки). Worker без DB-backed `pipeline-runner|piapi-provider` — 20 suites / 118 tests passed. DB-backed API-тест дописан: завершение → 50 XP + первое достижение и рамка; повторный `COMPLETED` не меняет XP и не создаёт второй `XpEvent`/награду. Локально не запускался по правилу сессии (Postgres `localhost:5433` не поднят), прогнать на CI/проде после осознанного деплоя.

Границы A9: стартовый каталог намеренно небольшой — новые определения/награды добавляются контентными миграциями; автоматический хук домашней работы ждёт отдельной модели homework (сейчас teacher API уже принимает reason `HOMEWORK`); выдача нового персонального костюма переиспользует готовые A5-генерации, но сама не запускает AI; отдельный вход ребёнка остаётся задачей A11. A8/LiveKit не затрагивался.

## Этап A10 ✅ — Отчёты, диалоги, выплаты и удаление персональных данных

Операционный контур Academy закрыт отдельными моделями и маршрутами, без переиспользования legacy AI-чата и без изменений A8/LiveKit. Ручная аддитивная миграция `20260726120000_a10_operations` добавляет `LessonReport`, `Thread`/`ThreadMessage`, `TeacherPayout`, `DeletionLog`, `AccessLog`, связь начислений с выплатой и поля обезличивания ребёнка. Миграция также создаёт диалоги для уже существующих записей на занятия; прежние учебные и финансовые связи не переписываются.

Отчёты и сообщения:

- После `COMPLETED` преподаватель заполняет отчёт (тема, успехи, рекомендация и до 20 результатов из закрытой библиотеки ребёнка), урок переходит в `REPORT_SENT`. Родитель видит отчёты в `/family`, открывает результаты через ownership-endpoint и отмечает отчёт прочитанным; правка отчёта снова сбрасывает отметку чтения.
- Диалог родитель↔преподаватель создаётся при первой записи и остаётся единым для пары преподаватель/ребёнок. Системные сообщения фиксируют запись, отмену, готовность материалов и отправку отчёта. Текст и изображения доступны родителю, назначенному преподавателю и администратору; чужой пользователь получает 404. Изображения лежат в `private-uploads/academy-messages`, UI `/messages` опрашивает новые сообщения раз в 5 секунд.
- Ребёнок по-прежнему не является `User`: `/kid/:childId` работает под родительской авторизацией и не даёт отправлять сообщения или получать личные контакты.

Выплаты:

- `/admin/payouts` группирует `TeacherEarning` по выбранному периоду и преподавателю. Администратор вручную формирует выплату только из `AVAILABLE`, может отметить её `PAID` с обязательным изображением/PDF подтверждения либо `REJECTED` с причиной; связанные начисления меняют статус атомарно.
- Подтверждения хранятся отдельно в `private-uploads/payout-proofs` и выдаются только через admin endpoint. Экран сохраняет тёмную тему админки и явно напоминает о ручном регламенте 5-го числа.

Удаление и аудит:

- Удаление ребёнка немедленно стирает персональные поля, отчёты, диалоги, live-chat/instances, фото, согласия, персонажа, награды и `ChildAsset`; проекты генераций очищаются от входов/результатов. Псевдонимизированный `ChildProfile`-tombstone сохраняет уроки, прогресс и начисления без имени/даты рождения. Удаление аккаунта дополнительно очищает legacy-проекты/медиа/чаты/поддержку, сценарии и контакты заказов, но сохраняет обезличенные финансовые записи.
- `academy-deletion` worker удаляет каталоги фото, референсов, детских результатов и вложений, локальные user uploads и перечисленные public storage keys. `DeletionLog` хранит переходы `PENDING → PROCESSING → COMPLETED/FAILED` и не теряет итог БД при добавлении результата файловой очистки. Ошибки доступа к каталогу больше не маскируются успешным статусом.
- `AccessLog` фиксирует минимум, требуемый планом: кто, когда и в какой роли прочитал закрытый файл референса персонажа. При удалении resource id заменяется стойким salted hash. Удалённый аккаунт сразу перестаёт принимать ранее выпущенные access/refresh-токены.

Web: добавлены `/messages`, отчёты в `/family`, форма отчёта в `/teacher`, `/admin/payouts`, обновлённые предупреждения удаления и role-навигация. Пользовательские Academy-экраны находятся в `.academy-theme`; админ-выплаты следуют существующей тёмной теме. RTK-срезы зарегистрированы с reducer и middleware.

Проверки A10: `prisma validate/generate` — ok; билды shared/database/api/worker/web — зелёные; shared — 17 suites / 107 tests passed; worker без DB-backed `pipeline-runner|piapi-provider|academy-deletion-processor` — 21 suite / 120 tests passed, включая листинг четырёх private-каталогов. DB-backed сценарии дописаны для полного цикла отчёта, прав мессенджера, `PAID`/`REJECTED`, обезличивания с сохранением финансов, инвалидирования токенов и перехода worker-журнала с листингом каталогов. Локально они не запускались по правилу сессии (Postgres `localhost:5433` не поднят); прогнать на CI/проде после осознанного деплоя миграции.

Границы A10: отдельного входа ребёнка пока нет (A11); отдельного продукта переноса занятия нет, поэтому системное сообщение о переносе появится вместе с соответствующим booking-endpoint; `FAILED`-очистка остаётся в журнале для ручного повторного запуска/операционного разбора. A8/LiveKit, origin и прод не затрагивались.

## Этап A11.1 ✅ — Локальные кабинеты, лендинг и Academy-катовер

Закрыта вся локально проверяемая часть A11 без A8/LiveKit, деплоя и физического удаления legacy.

Продукт и интерфейс:

- Главная Academy стала полноценным лендингом: ценность «живой преподаватель + AI-персонаж + интерактивная игра», три направления, четыре шага урока, реальные цены из `buildLessonPackages()`, FAQ и CTA «Записаться на пробный». Пробный — одно оплачиваемое занятие 25 минут без абонемента; регистрация сохраняет безопасный внутренний `redirect` в `/family`.
- Авторизованная главная больше не показывает «уроки скоро»: быстрые действия и основной маршрут зависят от роли PARENT/legacy USER, TEACHER, METHODIST или ADMIN. Sidebar админа очищен от родительских разделов; методист допущен в `/admin/curriculum` и видит только Academy-группу админ-навигации. Backend role-checks остаются источником истины.
- Public Header/Footer, `/about`, `/contacts`, `/ai`, `/profile`, диалоги сохранения референсов, auth-письма, платёжные описания и env-примеры переведены на Allvision Academy и светлую `.academy-theme`. Ссылки на снятую `/studio` удалены из доступного UI; данные личной legacy-медиатеки переиспользуются под нейтральным названием «Мои материалы».
- Middleware по-прежнему 301-редиректит Studio-витрину `/services`, `/trends`, `/scenarios`, `/studio`, `/pricing`, `/dashboard` на Academy-главную и теперь серверно закрывает все Academy-кабинеты (`/family`, `/lessons`, `/lesson`, `/teacher`, `/constructor`, `/kid`, `/messages`). Таблицы, API и админ-инструменты Studio не удалялись.

SEO и legal:

- Root metadata, OpenGraph/Twitter, `EducationalOrganization`/WebSite/FAQ JSON-LD переведены на школу. Удалён мёртвый SearchAction в Studio-каталог; sitemap содержит только Academy-главную, контакты и legal, robots закрывает все кабинеты.
- Оферта описывает занятия 25/45 минут, пакеты, баланс занятий, отмену за 8 часов и возвраты; privacy/terms/ПДн разделяют данные родителя и ребёнка, ролевой доступ, закрытые материалы, AI-провайдеров и удаление. На регистрации принятие документов и согласие на ПДн стали двумя отдельными действиями.
- Детские согласия обновлены до `v2`. `Consent.textSnapshot` сохраняет точный текст принятой редакции; ручная аддитивная миграция `20260727120000_a11_consent_snapshots` заполняет исторические v1-снапшоты и меняет default на v2. Старые v1-согласия больше не открывают загрузку/генерацию до явного перепринятия v2. API возвращает снапшот, UI показывает редакцию и полномочия законного представителя.

Проверки A11.1: `prisma format/generate` — ok; билды shared/database/api/worker/web — зелёные; shared — 17 suites / 108 tests; worker без DB-backed `pipeline-runner|piapi-provider|academy-deletion-processor` — 21 suite / 120 tests; отдельный не-DB API-тест Robokassa — 1 suite / 5 tests. Production build главной визуально проверен в Chrome на 1440×1000 и 390×844: desktop/mobile layout без переполнений, тарифы и CTA читаемы. Web сохранил 4 прежних `react-hooks/exhaustive-deps` warning вне Academy. DB-backed family/materials тесты обновлены под `textSnapshot`, локально не запускались из-за отсутствия Postgres; прогнать после осознанного применения миграции.

Границы A11.1: полный A11 DoD (реальный ребёнок end-to-end с видео на проде) намеренно не отмечен выполненным — он зависит от запрещённого в этой сессии A8/LiveKit и отдельного деплоя. Миграция не применялась, origin/прод не затрагивались. Физическое удаление Studio остаётся отдельным решением владельца. Тексты legal реализуют продуктовую модель и актуальное раздельное согласие, но перед публичным запуском желательна профильная юридическая проверка статуса Исполнителя и привлечения преподавателей.

## Этап A11.2 ✅ — Academy-админка без Studio-вкладок

Рабочая информационная архитектура `/admin` очищена от legacy Studio и переведена на светлый бело-оранжевый визуал `.academy-theme`.

- Новый обзор админки ведёт только в учебную программу, конструктор уроков, библиотеку Academy и проверку сцен. Для роли `ADMIN` отдельно доступны диалоги и выплаты преподавателям; `METHODIST` видит только контентный контур, а прямые admin-only URL дополнительно защищены серверной проверкой роли.
- Desktop sidebar, мобильный Sheet, sticky-header и обзор используют Academy-токены (`background/card/primary/accent/border`) вместо тёмной Studio-палитры. Активные экраны curriculum и payouts также переведены на токены; library, constructor, scene-player и messages уже использовали Academy-компоненты.
- Для конструктора и диалогов добавлены канонические адреса `/admin/constructor` и `/admin/messages`, поэтому рабочий переход больше не выбрасывает пользователя из admin-shell.
- Устаревшие Studio-разделы услуг, категорий, media/style/scenario assets, трендов/usage, AI-моделей, диагностики/мониторинга, пользователей, проектов, поддержки, платежей и token packages удалены из desktop/mobile-навигации. Старые закладки получают временный 307 на новый `/admin` без удаления страниц, API, моделей или данных.

Проверки A11.2: билды database/shared/api/worker/web, shared (17 suites / 108 tests) и worker без DB-backed `pipeline-runner|piapi-provider|academy-deletion-processor` (21 suite / 120 tests) — зелёные; web сохранил только 4 прежних lint warnings в legacy-файлах. Production-server smoke подтвердил 307 со старых `/admin/services` и `/admin/users/*` на `/admin`, а новые защищённые маршруты без сессии — на login. Новых миграций и DB-backed сценариев нет.

Границы A11.2: физическая зачистка legacy Studio не выполнялась; A8/LiveKit, origin, прод и деплой не затрагивались. Полный A11 DoD остаётся открытым до A8 и end-to-end проверки на проде.

## Ревью A11.2 ✅ — Возврат операционных разделов админки

При проверке работы Codex перед деплоем найдена функциональная регрессия A11.2: middleware
307-редиректил на `/admin` не только Studio-каталог, но и операционные разделы платформы.
Критично: `/admin/users` — единственный способ назначить роль `TEACHER`/`METHODIST`, без него
Academy нерабочая (нет преподавателей → нет уроков); плюс терялись мониторинг, диагностика,
учёт расходов AI и платежи на живом сервисе с реальными деньгами.

- `middleware.ts`: `RETIRED_ADMIN_PREFIXES` сокращён до Studio-каталога (`services`,
  `categories`, `media-assets`, `style-presets`, `scenario-templates`, `trends`,
  `token-packages`). Операционные (`users`, `payments`, `usage`, `models`, `diagnostics`,
  `monitoring`, `projects`, `support`) снова доступны.
- `AdminSidebarNav`: в группу «Операции» добавлены «Пользователи» и «Платежи»; добавлена
  admin-only группа «Платформа» (Мониторинг, Диагностика, AI-консоль, Модели и цены).

Остальное в работе Codex (A7.2, A9, A10, A11.1, A11.2) принято: билды shared/api/worker/web
зелёные, shared 108 passed (17 suites), worker без DB-backed 120 passed (21 suite), миграции
аддитивные; `20260727120000_a11_consent_snapshots` корректно бэкфиллит `textSnapshot` до
`SET NOT NULL`. Согласия переведены на v2 — исторические v1 требуют повторного принятия
(на проде это 1 тестовый ребёнок).

## Хотфикс A11.3 ✅ — Конструктор: блокеры и UX по замечаниям владельца

Шесть замечаний после приёмки на проде.

1. **Направления/курсы/навыки не создавались.** `slugify` в `/admin/curriculum` вырезал всё,
   кроме `[a-z0-9]`: русское название («Английский язык») давало ПУСТОЙ слаг → zod
   `slugSchema` (min 2 + regex) отбивал запрос 400. Добавлена транслитерация кириллицы
   + фолбэк `item-<base36>`, если после очистки ничего не осталось.
2. **Нельзя опубликовать урок.** Строгая схема требовала ассет у элемента `character`, но
   персонаж ученика в шаблоне ДОЛЖЕН быть абстрактным — реальный ребёнок подставляется
   при подготовке урока (`resolveInstanceScene`). `character` убран из `sourceTypes`
   в `scene-format.ts` (npc/prop/image/video/foreground/audio требование сохраняют).
3. **Выбор элемента сбрасывался.** Клик по элементу всплывал до контейнера холста, у
   которого висел `onClick={() => onSelect('')}`. Теперь снятие выделения только когда
   `e.target === e.currentTarget` (клик в пустое место).
4. **Элементы выглядели одинаковыми оранжевыми блоками.** `ElementVisual` переписан под
   тип: персонаж ученика и NPC — силуэты (пунктир + подпись), `input` — реальное поле с
   плейсхолдером и курсором, `timer` — таймер с секундами, `progress`/`indicator` — шкала,
   `hotspot`/`collision` — пунктирная зона, `platform` — платформа, `audio` — динамик,
   `particles` — частицы. Привязанный материал по-прежнему рендерится картинкой.
5. **Нельзя было менять размер мышью.** У выбранного элемента появились 8 ручек
   (углы + стороны) с корректными курсорами; ресайз за `n`/`w` двигает и позицию, минимум
   16px. Снимок для undo делается один раз в начале жеста (без спама историей).
6. **Правила были только общим блоком снизу.** В инспекторе элемента добавлена секция
   «Что происходит при клике»: кнопка «+» создаёт правило, уже привязанное к этому
   элементу (`event.sourceElementId`), с выбором действия, цели и очков. Общая панель
   «Правила» осталась для сложных сценариев (условия, таймеры, клавиши).

Проверки A11.3: билды shared/web — зелёные; shared — 108 passed (17 suites).

## Хотфикс A11.4 ✅ — Запись на урок: календарь, выбор преподавателя, слоты сеткой

Владелец не мог прогнать тестовый урок: цепочка «преподаватель → слоты → баланс → запись»
упиралась в два блокера админки и неудобную запись.

**Блокеры (API):**

1. `/admin/users` не давал назначить Academy-роли — `z.enum(['USER','ADMIN','READONLY_ADMIN'])`
   в фильтре и в PATCH. Без роли `TEACHER` платформа нерабочая: некому вести уроки.
   Добавлен `ACADEMY_ASSIGNABLE_ROLES` (+ PARENT/TEACHER/METHODIST), подписи ролей и опции
   `<select>` в обеих админ-страницах пользователей, confirm-текст смены роли переписан
   (был захардкожен под «снять роль администратора»).
2. `POST /api/admin/users/:id/lesson-credits` — ручная выдача занятий (`source: 'manual'`,
   25/45 мин, 1–50 штук) с возвратом остатка. Раньше баланс занятий появлялся ТОЛЬКО через
   реальную оплату ЮKassa, т.е. протестировать запись было нельзя. В карточке пользователя —
   блок «Выдать занятия (без оплаты)».

**Запись на урок (`/lessons`)** переписана с плоского списка чипов на пошаговый флоу:
ребёнок → преподаватель (карточки с аватаром-инициалом, био, предметами и числом свободных
слотов) → **календарь месяца** (сетка Пн–Вс, 6 недель фиксированной высоты; дни со слотами
подсвечены и кликабельны, точка-маркер, today — кольцом; месяцы листаются) → время дня
(чипы с длительностью). Слоты раскладываются по локальным дням (`toLocaleDateString('sv-SE')`),
не по UTC. Времена без оплаченных занятий нужной длительности видны, но подсвечены нейтрально
и дают понятную ошибку. Добавлены пустые состояния: нет детей → ссылка на `/family`,
нет преподавателей со слотами → пояснение.

`GET /api/academy/teachers` отдавал первые 30 слотов подряд — календарь на дальних датах
выглядел пустым. Теперь окно 90 дней и `take: 500`.

**Расписание преподавателя (`/teacher`)**: к вводу по одному слоту добавлена сетка —
день + чипы времени (08:00–21:30, шаг 30 мин) + повтор на 1/2/4/8 недель. Один запрос
`POST /api/academy/teacher/slots/bulk` (до 200 дат, дедуп по времени внутри запроса и по
существующим слотам, прошедшие отсеиваются) вместо N запросов; в ответе `created`/`skipped`.

Проверки A11.4: билды api/web — зелёные.

## Хотфикс A11.5 ✅ — Публикация сцен, гейт записи, разделы занятий, панель генераций, индикаторы урока

**1. «Нельзя опубликовать: Связанный элемент не найден».** Корень: `removeLayer` вообще не
чистил правила, а `removeElement` чистил только `event.sourceElementId`, оставляя битые
ссылки в `conditions[].elementId`/`actions[].elementId`. Правило становилось невидимым для
редактора (элемента уже нет) и неустранимым — публикация падала навсегда. Добавлен
`pruneDanglingRefs(scene)` в shared: удаляет правила без источника события, вычищает битые
условия/действия, а правило, у которого после чистки не осталось действий, удаляет целиком
(схема требует ≥1 действия). Вызывается из `removeElement`/`removeLayer` и — важно — при
ЗАГРУЗКЕ документа в `SceneEditor.documentFrom`, чтобы уже сохранённые битые черновики
чинились сами. Тесты: +2 (`removeLayer` prunes rules, `pruneDanglingRefs` strips refs).

**2. Гейт записи (согласия + AI-персонаж).** `ChildProfileDto` получил `characterStatus` и
`readyForLessons` (`photoConsentsComplete && characterStatus === 'APPROVED'`). `POST
/api/academy/booking` проверяет это на сервере (403 `CONSENTS_REQUIRED` / `CHARACTER_REQUIRED`)
— клиент не единственная защита. В `/lessons` неготовому ребёнку показывается чеклист
(согласия / персонаж, с подстатусами «генерация идёт», «осталось утвердить», «не удалась») и
ссылка в «Семью»; шаги выбора преподавателя и даты блокируются.

**3. Список занятий.** Разбит на «Идёт сейчас» / «Предстоящие» / «Прошедшие» со счётчиками
сверху (идёт, предстоящие, проведено). Прошедшие показывают результат («Проведён» /
«Отчёт готов» / причина отмены). Живой урок подсвечен карточкой с пульсирующим бейджем
«Урок идёт» и кнопкой «Присоединиться»; кнопка входа появляется и за 15 минут до начала.
Поллинг 20с. **Индикация «урок начался» честная**: сервер переводит урок в `IN_PROGRESS`
при входе ПРЕПОДАВАТЕЛЯ в WS-комнату (`markLessonStarted`), а не по ручному переключению.

**4. Панель генераций у преподавателя** (`SceneGenerationsPanel`, заменила узкий индикатор в
`LessonPrepare`): прогресс-бар, сводка «генерируется N · готово X из Y · ошибок Z», и по
каждой сцене — миниатюра, статус (по шаблону / не запускалась / в очереди / генерируется /
готова / ошибка / нужен AI-персонаж) и кнопка перегенерации. Перегенерировать можно в любой
момент до урока и ТОЛЬКО сцены с участием AI-персонажа (`generation.mode === 'full-ai'`);
послойные сцены собраны по шаблону и помечены «по шаблону» без кнопки. API: `GET
/lesson-instances/:id/generations` (участник) и `POST /:id/generations/:sceneId/regenerate`
(преподаватель урока/админ). В сервисе выделены `startSceneGeneration` (upsert связки
сцена→проект, поэтому перезапуск заменяет прошлый результат) и `regenerateFullAiScene`.

**5. Индикаторы в окне урока.** `LessonPresence` из двух булевых развёрнут в
`LessonParticipantState` на роль: `online / focused / inChat / micOn / speaking`. Новое
клиентское сообщение `{ t: 'status', ... }`; сервер рассылает presence только при реальном
изменении (speaking шлётся часто). В комнате: качество связи по RTT ping/pong («на связи
120 мс» / «связь нестабильна» / «связь слабая»), чипы участников в шапке (серый — не
подключён, янтарный — вкладка свёрнута, «отвлёкся»), плитки участников с рамкой-подсветкой
когда человек говорит, шкала громкости своего микрофона, значки чата/микрофона и подпись
«собеседник в чате / не в чате» над лентой сообщений. Микрофон теперь реально включается
(`useMicLevel`: getUserMedia + AnalyserNode, порог входа/выхода против дребезга) — но звук
НИКУДА не передаётся, наружу уходит только флаг «говорит»; передача аудио/видео и
демонстрация экрана остаются за A8 (LiveKit), кнопки камеры/экрана по-прежнему выключены.

Проверки A11.5: shared — 110 passed (17 suites); билды shared/api/worker/web — зелёные.

## Хотфикс A8.1 ✅ — Видеосвязь урока: пред-вход, авто-камера/микрофон, реконнект

Симптом владельца: вебки не видно, звука нет, на телефоне «камера мигнула на секунду и пропала».
Диагностика по логам LiveKit (SSH): медиа реально соединялось по UDP (`connectionType: udp`,
выбран `158.160.209.107:50006`), затем клиент слал `CLIENT_REQUEST_LEAVE` — рвал сам браузер,
не сеть. Инфра рабочая: TCP-фолбэк 7881 открыт снаружи, сигналинг `/livekit/` через хостовый
nginx отдаёт 200. Причины — на клиенте.

Найдено и исправлено (только web, `apps/web/src/components/academy/lesson/*`):

1. **Дубль-захват микрофона.** В комнате одновременно жили `useMicLevel` (сырой getUserMedia
   из A11.5, индикатор речи) и LiveKit-микрофон — на телефоне они дрались за устройство, отсюда
   «мигнула и пропала». `useMicLevel` удалён; речь/микрофон теперь из LiveKit
   (`ActiveSpeakersChanged` + `isMicrophoneEnabled`), пробрасываются в presence по WebSocket.
2. **Камера/микрофон не включались автоматически.** После `room.connect()` ничего не включало
   устройства — локальный тайл всегда `VideoOff`. Теперь `start(prefs)` сразу поднимает
   выбранные устройства (раздельно: отказ по одному не блокирует второй, ошибка доступа
   показывается текстом).
3. **Нет пред-входа.** Новый `LessonPreJoin` (green room): запрашивает доступ к камере/микрофону,
   показывает превью себя и уровень микрофона, даёт выключить любое устройство ДО входа.
   По «Войти» превью-дорожки останавливаются и управление отдаётся LiveKit (разрешение уже
   выдано — второго запроса браузера нет). Видеосвязь выключена на сервере → пред-вход
   пропускается, сразу в комнату (`PresenceOnlyPanel`).
4. **Слабый статус/реконнект.** `useLessonVideo` больше не автоконнектит на маунте — подключается
   из пред-входа. Явные фазы `idle/connecting/connected/reconnecting/failed`
   (`RoomEvent.Reconnecting/Reconnected/Disconnected`, `DisconnectReason.DUPLICATE_IDENTITY` →
   «открыт в другом окне»), цветной индикатор и кнопка «Переподключиться» (`retry`).
5. **Выживание после reload.** Выбор устройств сохраняется в `sessionStorage`; при перезагрузке
   пользователь возвращается в урок с тем же выбором без повторного пред-входа.

Инфра-заметки: `livekit.yaml` использует `node_ip: 158.160.209.107` + `use_external_ip: false`
(STUN-автоопределение подмешивало нерутабельные docker-мосты 172.x в ICE-кандидаты). При смене
публичного IP ВМ адрес нужно обновить. Хостовый nginx `location /livekit/` → `127.0.0.1:7880`
и `LIVEKIT_KEYS`/`LIVEKIT_URL` в `shared/.env` — операционные, не в репозитории.

Проверки A8.1: `npm.cmd run build -w @allvision/web` — зелёный; web-образ пересобран и
пересоздан на проде (home 200, healthy). Живой смоук двух ролей (камера/микрофон/экран,
реконнект, reload) — за владельцем.

## Хотфикс A8.2 ✅ — Видеосвязь: всегда подключаемся, выбор устройств, шестерёнка, фикс камеры

Диагностика по логам LiveKit (SSH): (1) ученик вообще не появлялся в LiveKit — фаза застревала
на `idle` («Готовимся…»), а кнопки камеры/микрофона были `disabled` при `phase !== 'connected'` →
тупик: связь не стартовала, кнопки мертвы, запустить нечем; (2) учитель подключался, но
публиковал ТОЛЬКО аудио (`source: MICROPHONE`), видео-трек не публиковался ни разу — гонка:
превью пред-входа держало камеру, я останавливал его и тут же отдавал камеру LiveKit, ОС не
успевала освободить устройство → камера падала, звук проходил; (3) сеть исправна (ICE по UDP).

Исправления (только web):

- **Вход всегда подключает комнату** (даже camera:false/mic:false). Фаза быстро становится
  `connected`, кнопки живые всегда. Кнопки `disabled` только пока идёт само подключение.
  Убран тупик «Готовимся…»: `useLessonVideo.start` переименован в `connect`, «Войти без видео»
  и авто-возврат после reload тоже вызывают `connect` (устройства выключены, но комната есть).
- **Выбор устройств в пред-входе**: `enumerateDevices()` после выдачи доступа, выпадающие списки
  камер и микрофонов, превью пересобирается под выбранное устройство; выбранные `deviceId`
  уходят в `connect`.
- **Шестерёнка в уроке**: попап с теми же списками, `room.switchActiveDevice('videoinput'|'audioinput', id)` меняет камеру/микрофон на лету.
- **Фикс гонки камеры**: пред-вход на «Войти» останавливает превью-дорожки и ждёт 350мс перед
  входом; `enableCameraWithRetry` повторяет `setCameraEnabled` через 700мс при «устройство занято».
- Кнопки камеры/микрофона/экрана и шестерёнка активны при `phase === 'connected'`.

Важно для теста: одну физическую камеру нельзя открыть в двух вкладках одновременно — учителя и
ученика проверять на РАЗНЫХ устройствах. 16-секундные `CLIENT_REQUEST_LEAVE` учителя в логах —
ручные перезагрузки при тесте, не цикл в коде (AuthGuard не перемонтирует при рефетче с кэшем).

Проверки A8.2: `npm.cmd run build -w @allvision/web` — зелёный; web-образ пересобран и пересоздан
(home 200, healthy). Живой смоук двух ролей — за владельцем.

## Этап A6.7 ✅ — WYSIWYG-конструктор, цвет текста, редактируемые поля ввода, проверка ответов

Замечания владельца: конструктор расходится с реальным уроком (картинка не подгружается, поле
ввода выглядит иначе), нужен цвет текста и гибкие события (кнопка проверяет ввод / выбор верной
кнопки), гибкое расположение.

Корень расхождения: редактор (DOM `ElementVisual`) и Pixi-плеер (урок) рисовали по РАЗНЫМ
правилам — цвет текста в редакторе брался из `style.fill`, в Pixi из `style.tint`; картинка в
Pixi растягивалась (`sprite.width=w`), в редакторе `object-contain`; поле ввода в редакторе
выглядело инпутом, в Pixi — серым прямоугольником.

Единые правила отрисовки (shared, `scene-format.ts`): `elementFillColor`, `elementTextColor`,
`elementObjectFit`, `elementBorderRadius`, `isTextElement` — используют И редактор, И Pixi, поэтому
расхождение убрано архитектурно.

- **Цвет текста**: новое поле `style.textColor` (отдельно от `fill`=фон). Инспектор: секция
  «Оформление» — цвет текста/фона/рамки (свотч + любой CSS-цвет), размер и насыщенность шрифта,
  выравнивание.
- **Картинки**: `style.objectFit` (cover/contain/fill) одинаково в редакторе и уроке; Pixi
  вписывает спрайт с маской по рамке при cover. Дефолт: фон/передний план — cover, иллюстрации —
  contain. Починена загрузка в редакторе (dev: префикс origin API).
- **Кнопка/карточка/диалог** используют общий `fill`; пустой `background`-элемент берёт цвет
  вьюпорта.

Гибкие события:

- **Поля ввода редактируемые в уроке**: HTML-инпуты как оверлей поверх Pixi-канваса
  (`syncInputs`/`positionInputs` + ResizeObserver масштабирует по канвасу; учитель видит, но не
  печатает). Значение пишется в `runtime.variables[id]` через `setSceneInputValue` без полного
  перерисовывания (фокус сохраняется).
- **Проверка введённого ответа**: условия `input-correct`/`input-incorrect` сравнивают значение
  поля с `content.correctAnswer` и `content.acceptedValues` (trim + нижний регистр). Инспектор
  поля: правильный ответ + синонимы. Инспектор кнопки: «проверять поле ввода» (генерит правила
  «клик+input-correct→очки/похвала» и «клик+input-incorrect→подсказка»).
- **Вариант ответа (выбор верной кнопки)**: у кнопки «правильный/неправильный» (ставит
  `content.correctAnswer` true/false + interactive) — Pixi при клике эмитит `answer-correct`/
  `answer-incorrect`; кнопка «реакция на верный/неверный ответ» добавляет сценовые правила.
- RulesEditor: подписи новых условий.

Проверки A6.7: shared 110 passed (17 suites), в т.ч. новый тест проверки ввода в
`academy-scene-runtime` (пусто→неверно, «Apple»→верно с нормализацией, синоним→верно); билды
shared/api/web — зелёные. Деплой api+web (API валидирует сцену на публикации — новые поля/условия
должны приниматься сервером); health 200, home 200. Живой смоук предпросмотр↔урок — за владельцем.

## Этап A8.3 ✅ — Уроки в теме, управление занятием, гейт ученика

Три запроса владельца.

**1. Уроки прикрепляются к теме учебной программы.** У `LessonTemplate` уже был `topicId`.
В редакторе темы (`/admin/curriculum`) добавлена секция «Уроки темы»: список прикреплённых
опубликованных уроков, выпадающий список для прикрепления свободных опубликованных уроков
(`updateTemplate topicId`), открепление, ссылка в конструктор. При подготовке занятия
`GET /published-templates?lessonId=` резолвит тему урока и показывает прикреплённые к ней уроки
первыми с бейджем «тема урока» (модалка `LessonPrepare` группирует и подписывает темой).

**2. Управление занятием у преподавателя.** Новый `POST /academy/lessons/:id/reschedule`
(преподаватель/родитель): освобождает старый слот, создаёт новый занятый слот того же
преподавателя, двигает `lesson.startsAt/slotId`, системное сообщение; только до начала и до
завершения/отмены (`RESCHEDULABLE`). В `/teacher` у каждого урока — «Перенести» (datetime-local)
и «Отменить»; в комнате урока у преподавателя — «Завершить урок» (статус `COMPLETED` ->
начисление доступно -> переход в кабинет к отчёту). Прежние статус-кнопки/отчёт/мотивация
сохранены.

**3. Ученик не входит, пока урок не подготовлен.** `GET /by-lesson/:lessonId` теперь отдаёт
`viewerRole` и `lessonStatus`. Комната: если экземпляра нет — преподавателю показывается
«Подготовьте урок» + ссылка в кабинет, ученику — экран ожидания со спиннером; запрос поллится
(5с), поэтому ученик входит АВТОМАТИЧЕСКИ, как только преподаватель выбрал шаблон, без
обновления страницы.

Проверки A8.3: билды api/web — зелёные. Живой смоук цепочки (тема->урок->подготовка->вход) — за
владельцем.

## Этап A8.4 ✅ — Устойчивая видеосвязь: единый presence из LiveKit, TURN-релей, показ демонстрации экрана

Симптомы владельца: связь то работает/то нет, кнопки микрофона/камеры залипают, «лаги» интерфейса,
рассинхрон presence (у каждой стороны свой счётчик подключённых), демонстрация экрана не показывается.

Корни и фиксы:

- **Рассинхрон presence.** Было два источника правды: наш WebSocket-статус (`{t:'status'}`
  mic/speaking/focused/inChat) и LiveKit. Они расходились → стороны показывали разное. Убраны ВСЕ
  WS-статусы; presence (кто в комнате, микрофон, речь) теперь берётся ТОЛЬКО из `video.participants`
  (LiveKit) — единый источник для обеих сторон. Роль участника определяется по префиксу identity
  (`teacher-`/`student-`). Меньше WS-трафика и ре-рендеров.
- **«То работает/то нет» → TURN.** Включён встроенный TURN-релей LiveKit (UDP 3478,
  `domain: turn.allvision-pulse.ru`; A-запись уже указывает на ВМ). Когда клиент не может достучаться
  напрямую до диапазона 50000-50200 (строгий NAT/файрвол), медиа идёт через relay; сервер сам раздаёт
  ICE-серверы клиентам — на фронте правок не нужно. TLS-TURN не включаем (443 занят nginx, нет
  сертификата на turn-домен); UDP 3478 + ICE/TCP 7881 закрывают подавляющее большинство сетей.
  **Операционно: в облачном Security Group нужно открыть входящий UDP 3478** (relay-диапазон
  30000-40000 внутренний, loopback SFU↔TURN, наружу открывать не нужно). Проверено на проде:
  `Starting TURN server ... portUDP: 3478`, порт слушается.
- **Демонстрация экрана.** Не было вывода. Добавлен `ScreenShareView`: при наличии screen-track у
  любого участника экран показывается КРУПНО поверх сцены (object-contain, чёрный фон) с подписью,
  чей это экран. Кнопка демонстрации в панели была — теперь есть и показ.
- **Лаги/поллинг.** Опрос готовности урока (`getInstanceByLesson`) отключается, как только экземпляр
  появился (`instanceReadyRef`), — раньше поллил каждые 5с весь урок и дёргал ре-рендеры.

Проверки A8.4: билд web — зелёный; deploy — livekit пересоздан (TURN на 3478 слушает), web healthy,
home/livekit 200. Живой смоук двух ролей (стабильность, демонстрация экрана, presence-синхрон) —
за владельцем; предварительно открыть UDP 3478 в облачном SG.

## Этап A8.6 ✅ — Урок без встроенного видео/чата, ссылка на Яндекс Телемост

По решению владельца встроенная видеосвязь (LiveKit) и голосовой/текстовый чат убраны из урока
как нестабильные; общение — во внешнем Яндекс Телемосте. Интерактивный инструмент урока (сцены +
рисование учителя) остаётся, синхрон по WebSocket не тронут.

- `LessonRoom` переписан начисто: только инструмент урока (сцена во всю ширину) + рисование +
  панель управления учителя (навигация сцен, разблокировка, награда, перо, завершить урок).
  WebSocket-синхрон сохранён полностью (state/nav/unlock/draw/reward/scene-event). Видео/чат/
  presence/пред-вход/LiveKit-хук из комнаты удалены (файлы use-lesson-video/VideoTile/LessonPreJoin
  остались в репо, но не импортируются — на случай возврата видео).
- `Lesson.meetingUrl` (миграция `20260726160000_lesson_meeting_url`) — ссылка на Телемост.
- `POST /api/academy/lessons/:id/meeting-link` (только преподаватель урока) ставит/меняет ссылку,
  системное сообщение родителю; `by-lesson` отдаёт `meetingUrl`.
- Ссылку можно задать при подготовке (`LessonPrepare` → поле «Видеозвонок») и прямо в шапке урока
  (инлайн-редактор). Ученик видит кнопку «Открыть видеозвонок» (target=_blank), пока ссылки нет —
  подпись «появится, когда преподаватель добавит».
- Ученик по-прежнему входит только после подготовки урока (гейт A8.3).

## Этап A9 (часть) ✅ — Последовательность тем урока и прогресс по программе

При подготовке урока преподаватель выбирает тему; по умолчанию подставляется следующая по программе.

- `academy-lesson-topic-service.ts`: `resolveLessonEnrollment` (активная запись ребёнка, при
  нескольких — по предмету преподавателя), `lessonTopicOptions` (темы курса модуль→тема со
  статусами + рекомендованная следующая), `defaultLessonTopicId`, `completeLessonTopic`.
- `GET /lesson/:lessonId/topic-options` — темы для подготовки. `POST /` (создание экземпляра)
  принимает `topicId`; при отсутствии — рекомендованная следующая; тема фиксируется на
  `lesson.topicId`, статус урока → READY.
- `PrepareModal`: выпадающий список тем (дефолт — следующая, с подписями «пройдена/идёт/следующая»),
  можно перескочить вперёд (тема зачтётся пройденной) или вернуться к пройденной (перепрохождение).
  Шаблоны выбранной темы показываются первыми.
- По завершении урока (`status=COMPLETED`) тема помечается `TopicProgress=COMPLETED`
  (`completeLessonTopic`); XP (`awardLessonCompletion`) начисляется ТОЛЬКО если тема пройдена
  впервые — при перепрохождении `newlyCompleted=false`, очки повторно не начисляются.

Проверки A8.6/A9-часть: билды api/web — зелёные; деплой api+web, миграция meetingUrl применена
(колонка есть в БД), health/home 200, роуты meeting-link и topic-options живы (401 без auth).

Остаётся (следующий заход): кабинет преподавателя «Мои ученики» (список, дата последнего занятия,
заметка, переход в профиль, направления/модули/темы/история); прогресс и история уроков в профиле
ученика/родителя.

## Этап A9 (часть 2) ✅ — Кабинет «Мои ученики», история уроков, заметки, прогресс в профиле

Преподаватель видит своих учеников; ученик/родитель видят прогресс и историю.

- `academy-teacher-students-service.ts`: `buildTeacherStudents` (список ведомых детей: дата
  последнего занятия, число проведённых, наличие заметки), `buildTeacherStudentDetail` (прогресс
  по программе + история + заметка), `buildChildLessonHistory` (дата/тема/преподаватель/статус/
  есть ли отчёт), `saveTeacherStudentNote` (upsert/delete), `teacherTaughtChild` (гейт доступа).
- `TeacherStudentNote` (миграция `20260726180000_teacher_student_note`): рабочая заметка
  преподавателя по ученику, unique(teacherId, childId).
- Роуты: `GET /api/academy/teacher/students`, `GET /teacher/students/:childId` (только к детям,
  которых вёл), `PUT /teacher/students/:childId/note`; `GET /api/family/children/:id/lessons`
  (история для родителя).
- Web: раздел «Мои ученики» в `/teacher` (`TeacherStudents`) — список + модалка профиля ученика
  (заметка, прогресс по программе с темами и статусами, освоенные навыки, полная история занятий).
  В `/family` у ребёнка добавлен блок «История занятий».

Проверки: билды api/web — зелёные; деплой, миграция `TeacherStudentNote` применена (таблица есть),
health/home 200, роут teacher/students жив (401 без auth). Живой сквозной прогон — за владельцем.

Закрыто из запроса владельца: авто-подстановка следующей темы, ручной скип/возврат темы,
перепрохождение без повторных очков, гейт входа ученика, прогресс в профиле, список учеников с
историей/заметками/переходом в профиль, направления/модули/темы, история для родителя. Отдельный
детский вход (свой экран истории для ребёнка) — по-прежнему будущий этап (A11), сейчас ученик виден
через родительский профиль.

## Этап A6.8 ✅ — Апгрейд конструктора: палитра с превью, фикс фона, загрузка картинок, звук-события, авторинг

Пять доработок конструктора уроков по запросу владельца.

1. **Палитра элементов** (`ElementPalette.tsx`) вместо выпадающего списка: категории (Текст и кнопки /
   Ответы и ввод / Картинки и фон / Персонажи / Игровые / Звук) с иллюстративным мини-превью каждого
   типа (кнопка выглядит кнопкой, поле ввода — инпутом, персонаж — силуэтом). Клик добавляет элемент
   в активный слой. Левая панель `SceneEditor`: палитра сверху + дерево слоёв с подсветкой активного
   слоя (`targetLayerId` = слой выбранного элемента / первый; клик по слою делает его активным).

2. **События со звуком**: билдеры `addCheckRules`/`addAnswerReactionRules` получили галочку «со звуком».
   `ensureTones` добавляет два `audio`-элемента с `content.sourceUrl:"tone:success"|"tone:wrong"` (Pixi
   играет встроенный тон, без загрузки файлов) и вставляет `play-sound` в реакции верно/неверно.

3. **ФИКС фона в уроке**: `setSceneBackground` создаёт элемент `type:"background"` с asset, но в
   Pixi-плеере `background` НЕ входил в `IMAGE_ELEMENT_TYPES` → рисовалась заливка, а не картинка
   (в конструкторе фон виден, в уроке нет — расхождение). Теперь `background` с `asset`/`content.sourceUrl`
   рендерится картинкой (`addImage`), пустой — заливкой `viewport.backgroundColor`. Чинит и обычные
   фоны, и AI-сцены (они тоже ставят фон через `setSceneBackground`).

4. **Загрузка своих картинок**: `POST /api/academy/materials/upload` (teacher/methodist, multer image,
   ≤15 МБ) → создаёт `MediaAsset` в личной библиотеке (`ownerUserId`), tags `['uploaded']`, возвращает
   `dragData`. В `AssetPickerDialog` кнопка «Загрузить свою» (проп `uploadKind`, дефолт
   `academy-background`) — картинка сразу в библиотеку и прикрепляется к элементу.

5. **Авторинг уроков (инструмент для Claude)**: `docs/LESSON-AUTHORING.md` — формат сцены, жёсткий
   бюджет на урок (**1 видео 10–15 сек + 10 генераций картинок**, генерации запускает владелец, я
   оставляю плейсхолдеры), паттерны событий (варианты ответа, проверка поля, звук-тоны). Скрипт
   `npm run academy:template -- --file scene.json --title "…" [--topic <id>] [--author <email>]`
   (`packages/database/src/create-lesson-template.ts`) создаёт черновик `LessonTemplate` из JSON;
   валидацию делает публикация в UI. Память: `memory/lesson-authoring.md`.

Проверки A6.8: билды database/api/web — зелёные; деплой api+web (миграций нет), health/home 200,
эндпоинт upload жив (401 без auth). Живой смоук (фон в уроке, палитра, загрузка, звук) — за владельцем.

## Этап A9.1 ✅ — Нейролаборатория в уроке (изолированный бюджет токенов) + курс «Видео нейросети»

Владелец: сцена урока может быть «лабораторией» — вместо интерактивной сцены показывается
нейролаборатория (AI-чат), у ребёнка изолированный бюджет токенов на урок.

Решения по деньгам (подтверждено владельцем): **изолированный лимит урока** (не кошелёк семьи),
**все модели** (картинки+видео), лимит ставит админ при добавлении лаборатории-сцены.

- `scene.lab { tokens, videoAllowed }` (shared, опционально): помечает сцену лабораторией.
- `Lesson.labTokensGranted/labTokensSpent` (миграция `20260726200000_lesson_lab_tokens`).
- `grantLessonLabTokens` (`academy-lesson-lab-service`): начисление ОДИН РАЗ при старте урока
  (вход преподавателя → `markLessonStarted`), идемпотентно (`labTokensGranted != null`). Перенос
  не начисляет повторно; урок `IN_PROGRESS` переносить нельзя (RESCHEDULABLE его исключает).
- `createFreeChatProject(userId, body, billing?)`: billing `lesson-lab` списывает из бюджета урока
  (не из кошелька семьи), проверяет остаток (402 `INSUFFICIENT_LAB_TOKENS`), refund в бюджет при
  сбое очереди; проект `mode: 'lesson-lab'` + `userInputs.labLessonId` для истории.
- Роуты: `GET /api/academy/lessons/:id/lab` (состояние), `POST /lab/generate` (участник, видео по
  `videoAllowed`), `GET /lab/history`.
- Конструктор: в `SceneInspector` чекбокс «Сцена-лаборатория» + токены + разрешение видео.
- `LessonLab` (web): остаток токенов, выбор модели (картинки+видео), запрос, сетка результатов с
  поллингом; в комнате при активной lab-сцене показывается вместо Pixi.

Курс **«Видео нейросети»** (дети создают ИИ-мультики с нуля): программа расписана на 5 модулей
(Введение / Создаём персонажа / Сюжет и сцены / Оживление (видео) / Сборка мультфильма) по 4 темы.
Первые **4 урока Модуля «Введение»** созданы как черновики LessonTemplate на проде
(«Что такое нейросети» с викториной+звуком; «Идея и герой» с полем ввода; «Промпт»; «Первая
картинка» со сценой-лабораторией на 20 токенов). Владелец публикует их в `/constructor`, привязывает
к темам в `/admin/curriculum`, вставляет генерации в плейсхолдеры (фоны/картинки помечены как
пустые image/background элементы).

Проверки A9.1: shared 111 passed; билды shared/database/api/web — зелёные; деплой, миграция
применена (2 колонки в БД), health/home 200, роут `/lab` жив (401 без auth); 4 черновика урока
созданы (LessonTemplate count = 4).

Плейсхолдеры под генерации в уроках (владелец вставляет через конструктор, «Выбрать материал» /
«Загрузить свою» / «Сгенерировать фон»): урок 1 — фон сцены 1 + картинка-пример сцены 2; урок 2 —
без обязательных; урок 3 — картинка-пример сцены 1; урок 4 — лаборатория (генерации делает ребёнок
в уроке из своего лимита). Бюджет соблюдён: ≤10 картинок, видео нет (кроме детских в лаборатории).

## Этап A10.1 ✅ — Профили преподавателей + генерация видео кат-сцен + редизайн записи/занятий

Ответ на 4-частный запрос владельца (части 1–2 уже в проде коммитом 77c4613; здесь части 3–4).

**Часть 4 — профили преподавателей и редизайн вкладки «Занятия».**

- `TeacherProfile` расширен `photoUrl`, `lessonsManual` (ручной счётчик проведённых уроков),
  `courseIds` (доступные курсы; пустой массив = все курсы) — миграция
  `20260726220000_teacher_profile_fields`.
- Новый `adminTeachersRouter` (`/api/admin/teachers/:userId`, requireAdmin): GET (профиль +
  все активные курсы + `lessonsCompleted` авто-подсчётом), PATCH (bio/lessonsManual/courseIds/
  isActive), POST `/photo` (multipart, `uploadAcademyImage` → storage → `photoUrl`). **Фото грузит
  только админ** — преподаватель не загружает (защита от неподобающего контента от сотрудника).
- `/admin/users/:id`: при роли TEACHER показывается секция `TeacherProfileSection` — фото (загрузка/
  замена), автобиография, ручной счётчик уроков (пусто = авто), чекбоксы курсов (все включены по
  умолчанию, первый клик разворачивает в явный список), тумблер «Активен». RTK slice
  `admin-teachers-api`.
- `AvailableTeacherDto` расширен `photoUrl`/`lessonsCount` (`lessonsManual ?? completed`)/`courses`
  (пустой courseIds = все активные курсы). Публичный `GET /api/academy/teachers/:teacherId/profile`
  (participant) отдаёт имя/био/фото/lessonsCount/subjects. `LessonDto` получил `teacherId`.
- `/lessons` переписан на две вкладки: **«Мои занятия»** (статистика идёт/предстоящие/проведено,
  живой урок, порядковый «Занятие №N» по времени среди уроков ребёнка, раскрывающийся профиль
  преподавателя в предстоящих) и **«Записаться»** (яркая кнопка «Записаться», выбор ребёнок →
  преподаватель с фото/числом уроков/био → **курс** (из `teacher.courses`) → календарь → время).
  Выбор курса пока UX-подсказка (тема урока проставляется преподавателем на подготовке); контракт
  бронирования не менялся. Фикс: `CANCELLED_STATUSES` приведён к реальным enum'ам
  (`CANCELLED_PARENT`/`CANCELLED_TEACHER`/`NO_SHOW`).

**Часть 3 — генерация видео кат-сцен в «Материалах».**

- Shared `materials.ts`: `ACADEMY_VIDEO_MODELS` (kling-3-std/pro — оживить картинку через
  image-to-video; seedance-2/veo-3.1 — по промпту через text-to-video), схема генерации получила
  `media: 'image'|'video'` (default image — прежнее поведение не тронуто), `videoModel`,
  `durationSec` (3–15). `estimateAcademyVideoCostUsd` + единый `estimateAcademyCostUsd`
  (видео/изображение). superRefine: image-to-video для общей библиотеки требует референс-картинку;
  видео несовместимо с прозрачным фоном.
- Worker `academy-generation.ts`: ветка `media==='video'` (`generateAcademyVideo`) — image-to-video
  оживляет первый референс (для детских кат-сцен это APPROVED-персонаж, `privateOutput`),
  text-to-video по промпту; результат mp4 сохраняется в MediaAsset (teacher) или ChildAsset (child),
  бюджет-гейт по `maxCostUsd`, `count` форсится в 1. Детская видео-генерация требует fal
  (privateOutput), как и image (PiAPI-ветка отклоняется).
- API generate/estimate переведены на `estimateAcademyCostUsd`.
- Web `materials-workspace.tsx`: тумблер «Изображение / Видео (кат-сцена)», при видео — выбор
  видео-модели + длительность + формат (image-only поля скрыты). Карточка библиотеки рендерит
  `<video>` (hover-play) для video-ассетов. Готовое видео перетаскивается/выбирается в сцену урока
  как кат-сцена через существующий конструктор.

Проверки A10.1: билды shared/database/worker/api/web — зелёные; shared `materials` — 9 passed.
Деплой — ручной по SSH (миграция `20260726220000` применяется стартом api).

Долги A10.1: реальный fal-смоук видео (kling-3 image-to-video оживление персонажа / seedance
text-to-video) — первой генерацией на проде; выбор курса при записи пока не резолвится в тему
энролмента (тема ставится преподавателем на подготовке); проигрывание видео-кат-сцены в самой сцене
опирается на существующий `video`-элемент PixiJS.
