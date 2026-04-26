# Allvision Studio — проектный контекст

## О проекте
Веб-сервис для AI-генерации медиа. 6 услуг:
1. Улучшение старых фото (AUTO)
2. Улучшение + анимация (AUTO)
3. Тренды с фото юзера (AUTO)
4. Мультики на заказ (MANUAL)
5. Реалистичные видео на заказ (MANUAL)
6. Персональная видео-сказка для ребёнка (HYBRID: AI сценарий + MANUAL видео)

Монетизация: токены (1 токен = 1 ₽), покупка пакетами через ЮKassa.

## Текущая фаза разработки
ФАЗА 1 — локальная разработка, всё бесплатно. AI и платежи — моки.
Этап 1.3a (auth) реализован; следующий этап 1.3b — лендинг и страницы услуг.

## Стек
- Frontend: Next.js 14 App Router + TS + TailwindCSS + shadcn/ui + Redux Toolkit
- Backend: Express + TS + Prisma + Postgres + BullMQ + Redis
- Архитектура: монорепо (npm workspaces)
- Провайдеры через интерфейсы: AIProvider, PaymentProvider, StorageProvider

## Структура
/apps/web — Next.js (порт 3000)
/apps/api — Express (порт 4000)
/apps/worker — BullMQ consumer
/packages/database — Prisma schema
/packages/shared — типы, zod-схемы, интерфейсы провайдеров
/docker — docker-compose с Postgres и Redis

## Правила разработки
- TypeScript strict: true везде
- Все API-ответы типизированы, валидация через zod
- Секреты только в .env, никогда в коде
- Комментарии на русском, код на английском
- UI-компоненты только из shadcn/ui, не изобретаем велосипед
- Асинхронные задачи только через BullMQ
- Все внешние сервисы за интерфейсом провайдера с mock-реализацией

## Что уже готово
(обновляется после каждого этапа)

### Этап 1.1 — Фундамент ✅
- Монорепо на npm workspaces: `apps/*` + `packages/*`.
- `docker/docker-compose.yml`: Postgres 16 + Redis 7. **Postgres проброшен на хост-порт 5433** (5432 занят нативным Windows-постгресом у разработчика); внутри контейнера порт стандартный 5432. `.env` и `.env.example` используют 5433.
- `packages/database` — Prisma 5.22, полная схема (User/Service/Trend/Project/Order/FairyTaleScriptRecord/Payment/TokenTransaction/TokenPackage/Setting), singleton-клиент, заглушка `seed.ts`. Первая миграция `20260424_init` применена.
- `packages/shared` — интерфейсы провайдеров (`AIProvider`, `PaymentProvider`, `StorageProvider`), реэкспорт enum/типов из Prisma, пустые zod-схемы (наполним на 1.3+).
- `apps/api` — Express + TS strict, helmet/cors/compression, winston-логгер, `GET /api/health` (200 OK), заглушки `requireAuth/optionalAuth`, nodemon для dev.
- `apps/worker` — BullMQ consumer с очередями `photo-restore`, `photo-animate`, `trend` (процессоры — console.log-заглушки).
- `apps/web` — Next.js 14 App Router + TS strict + Tailwind + shadcn/ui (slate, CSS-переменные), Header/Footer, hero на `/`, заглушки `/login`, `/register`, пустой Redux store.
- Root `package.json` — скрипты `dev`, `dev:web|api|worker`, `db:migrate`, `db:seed`, `db:studio`, `build` (shared→database→api→worker→web).
- Smoke-тест пройден: `http://localhost:4000/api/health` → 200 `{status:"ok"}`, `http://localhost:3000` отдаёт hero «Allvision Studio — оживи воспоминания».

### Этап 1.3a — Авторизация ✅
- `packages/shared/src/schemas/auth.ts` — zod-схемы и типы для регистрации, логина, восстановления и смены пароля.
- `packages/database` — добавлены поля `passwordResetToken` и `passwordResetExpiresAt` в `User`; миграция `20260424115752_add_password_reset_fields` применена, `prisma migrate status` показывает актуальную схему.
- `apps/api` — полноценные auth-роуты `/api/auth/register`, `/login`, `/logout`, `/refresh`, `/me`, `/forgot-password`, `/reset-password`; JWT HS256, access/refresh httpOnly cookies, `cookie-parser`, CORS с `credentials: true`, единый error handler для Zod/HttpError/500.
- `apps/api/src/services/auth-service.ts` — регистрация с bcrypt cost 12, welcome-бонусом и `TokenTransaction`, логин, refresh, logout no-op для MVP, request/reset password через одноразовый токен с хешем в БД.
- `apps/api/src/middleware/auth.ts` — `requireAuth`, `requireAdmin`, `optionalAuth`; `rate-limit.ts` — лимиты на auth и восстановление пароля.
- `apps/web` — Redux Toolkit + RTK Query auth API, `ReduxProvider`, `useAuth`, формы Register/Login/Forgot/Reset Password, toast-уведомления, обработка API-ошибок, dashboard guard и Next middleware для `/dashboard/**` и `/admin/**`.
- Auth-страницы `/login`, `/register`, `/forgot-password`, `/reset-password` используют отдельный центрированный layout без обычных Header/Footer; общий Header показывает avatar/dropdown, кабинет, выход и баланс токенов.
- `packages/database/src/seed.ts` создаёт `admin@allvision.studio / admin123` с ролью ADMIN и балансом 10000, а также `user@allvision.studio / user123` с балансом 500; пароли хешируются bcrypt.
- Тесты `apps/api/src/__tests__/auth.test.ts`: register + cookies + welcome tokens, duplicate email, login success/fail, protected `/me`.
- Проверено локально: `npm run build -w @allvision/shared`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`, `npm test`.
- Важно для Windows: `prisma generate` и полный root `npm run build` нужно запускать при остановленном API/dev-сервере, иначе запущенный Prisma Client может держать `query_engine-windows.dll.node` и дать `EPERM` на rename.

### Этап 1.3b — Лендинг ✅
- Prisma/seed: в `ProcessingType` добавлен `HYBRID` (`packages/database/prisma/schema.prisma`) и ручная миграция `packages/database/prisma/migrations/20260424162000_add_hybrid_processing_type/migration.sql`. `packages/database/src/seed.ts` теперь создаёт 6 услуг, 8 трендов, 4 пакета токенов, публичные настройки поддержки/цен и темы сказок; `fairy-tale` сидируется как `HYBRID`.
- Новые shared-типы и схемы: `packages/shared/src/types/public.ts` с типизированными публичными ответами, `packages/shared/src/schemas/public.ts` с `contactSchema`.
- Новые API-эндпоинты без auth middleware в `apps/api/src/routes/public.ts`: `GET /api/public/services`, `GET /api/public/services/:slug`, `GET /api/public/trends`, `GET /api/public/trends/:id`, `GET /api/public/token-packages`, `GET /api/public/settings/public`, `POST /api/public/contact`. Роутер подключён в `apps/api/src/routes/index.ts`.
- Env loading: `apps/api/src/config/env.ts` и `apps/worker/src/config/env.ts` ищут `.env` вверх по дереву директорий, чтобы API/worker видели корневой `DATABASE_URL`/`REDIS_URL` при запуске из npm workspace.
- Новый RTK Query slice `apps/web/src/store/api/public-api.ts`; подключён в `apps/web/src/store/index.ts`.
- Установлены npm-пакеты для web: `embla-carousel-react`, `framer-motion`; для database добавлен `dotenv`, чтобы `seed.ts` подхватывал корневой `.env`; для api/worker добавлен `tsx` и dev-скрипты заменены с `nodemon` на `tsx watch --clear-screen=false`, чтобы избежать Windows `spawn EPERM` в `pstree.remy` на Node 24; shadcn/ui добавлены `accordion`, `badge`, `separator`, `sheet`, `tabs`, `skeleton`, `carousel`, `tooltip`, дополнительно `textarea` для контактов.
- Лендинг собран в `apps/web/src/app/page.tsx` из компонентов `apps/web/src/components/landing/*`: `HeroSection`, `ServicesGrid`, `HowItWorksSection`, `ExamplesGallery`, `TestimonialsSection`, `PricingSection`, `FAQSection`, `CTASection`, `Reveal`.
- Публичные страницы созданы: `/services`, `/services/[slug]`, `/trends`, `/trends/[id]`, `/pricing`, `/about`, `/contacts`, `/privacy`, `/terms`, `/offer`, `/pd-consent`; соответствующие client-контейнеры лежат в `apps/web/src/components/pages/*`, юридический renderer — `apps/web/src/components/legal/LegalDocument.tsx`.
- Footer расширен до 4 колонок в `apps/web/src/components/layout/Footer.tsx`; Header получил мобильное меню через `Sheet`.
- SEO и инфраструктура: `apps/web/src/app/layout.tsx` содержит metadata template, Open Graph, robots и `html class="dark"`; добавлены `apps/web/src/app/sitemap.ts`, `apps/web/public/robots.txt`, `apps/web/src/app/icon.svg`, `apps/web/src/app/not-found.tsx`, `apps/web/src/app/error.tsx`.
- Cookie banner: `apps/web/src/components/CookieBanner.tsx`, хранит выбор в `localStorage`, имеет режим "Принять все", "Только необходимые" и модалку настройки.
- Нестандартные решения: `HYBRID` добавлен сейчас, чтобы не писать будущие `if (service.slug === 'fairy-tale')`; root-скрипты `db:migrate` и `db:seed` переведены на прямой запуск из корня, иначе Prisma workspace-скрипт не видел корневой `.env`; sitemap динамически пытается подтянуть тренды из API и безопасно падает в fallback без трендов, если API/БД не подняты; временные демо-изображения идут с `placehold.co`, домен добавлен в `apps/web/next.config.mjs`.
- Проверки, которые прошли: `npm run db:migrate -- --name add_hybrid_processing_type`, `npm run db:seed`, `npm test -w @allvision/api`, `npm run generate -w @allvision/database`, `npx prisma generate --schema packages/database/prisma/schema.prisma`, `npm run build -w @allvision/shared`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`, `npm run build`; `PORT=4100 npm run dev -w @allvision/api` + `GET /api/public/services` вернул 6 услуг.
- Dev smoke после замены nodemon: короткий запуск `npm run dev` поднял `web` на `http://localhost:3000`, `api` на `http://localhost:4000`, worker подключился к Redis и показал `ready` для очередей `photo-restore`, `photo-animate`, `trend`; тестовый процесс затем остановлен.
- Проверки, которые не удалось завершить в этой сессии: Lighthouse и ручной devtools-прогон 375/768/1440 не запускались. Ранее Docker daemon был недоступен, но после старта Docker миграция, seed и API-тесты прошли.
- Git-коммиты не создавались: текущая папка `C:\Allvision-Studio` не является git-репозиторием (`git status` возвращает `not a git repository`).

### Этап 1.3b-fix — Визуальная полировка ✅
- Замена `placehold.co` на `picsum.photos` в seed и frontend-константах; picsum стабильнее, seed-параметры дают одинаковые картинки при повторных загрузках.
- Зарегистрированы домены `picsum.photos` и `fastly.picsum.photos` в `apps/web/next.config.mjs`.
- `packages/database/src/seed.ts`: обложки услуг, галереи услуг и вертикальные превью трендов переведены на `https://picsum.photos/seed/...`; после правок выполнен `npm run db:seed`.
- Карточки услуг: фиксированная высота через `flex flex-col`, `h-full`, `auto-rows-fr`, `mt-auto`; описания обрезаются через `line-clamp-3`; мини-галерея из карточек убрана, галерея осталась только на детальной странице.
- Убраны технические детали из UI: на странице услуги больше нет `PHOTO_RESTORE`/категорий enum и блока `MVP-страница`.
- Маппинг `processingType`: `AUTO` → «Автогенерация», `MANUAL` → «На заказ», `HYBRID` → «AI + автор»; статус запуска: «⚡ Доступно сейчас», «📝 По заявке», «✨ AI + автор».
- Введена трёхуровневая слоистость: page `slate-950`, card `slate-900`, nested/badges/outline `slate-800`; карточки получают hover-подъём, подсветку бордера и мягкое violet-свечение.
- Цена токенов вынесена в акцентный блок с `Coins`, `text-amber-400`, крупным значением и вторичной подписью `≈ ₽`/условием заказа.
- Header: явный badge баланса с иконкой монетки ведёт на `/pricing`; avatar получил tooltip «Нажмите для меню»; dropdown показывает баланс и кнопку «Пополнить».
- Hero занимает `min-h-[calc(100vh-80px)]`, использует крупное picsum-превью `hero-allvision`, gradient text на «ИИ» и blur-blobs violet/fuchsia.
- Подключён Inter через `next/font/google` с кириллицей и весами 400-900; h1 усилены `font-black`, `tracking-tight`, `leading-none`.
- Логика кнопок на детальной странице услуги: незалогиненному показывается только кнопка входа/регистрации; залогиненному с достаточным балансом — «Создать за X токенов»; при недостатке — disabled «Недостаточно токенов» + «Пополнить баланс»; ручные услуги остаются disabled до этапа 1.7.
- Тренды больше не используют фейковый video-source для плейсхолдера: карточки и детальная страница показывают стабильные вертикальные picsum-изображения с play-overlay.
- Проверки: `npm run db:seed`, `npm run build -w @allvision/web`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `Select-String 'placehold\\.co|MVP-страница'` по web/seed.
- Важно для проверки: если запущен `npm run dev`, root `npm run build` на Windows может упасть на `EPERM` при `prisma generate`, потому что активный API держит `query_engine-windows.dll.node`; остановить dev-сервер и повторить build.
- Ручная проверка после запуска: `npm run dev`, открыть `/`, `/services`, `/services/photo-restore`, `/trends`, `/pricing`; проверить загрузку картинок, hover-эффекты и адаптивность 375px/768px/1440px.

### Этап 1.4 — Личный кабинет ✅
- Prisma: в `User` добавлено поле `deletedAt DateTime?`; миграция `packages/database/prisma/migrations/20260425163444_add_user_soft_delete`. В `apps/api/src/services/auth-service.ts` `login` теперь возвращает 401 `ACCOUNT_DELETED`, если `deletedAt` не null.
- Schemas (`packages/shared/src/schemas/account.ts`): `updateProfileSchema`, `changeAccountPasswordSchema` (отдельно от `changePasswordSchema` из auth, чтобы не пересекаться по типам), `deleteAccountSchema` с literal `"УДАЛИТЬ"`. Соответствующие типы — в `packages/shared/src/types/account.ts` (`AccountUser`, `DashboardResponse`, `Paginated<T>`, `TransactionsResponse`, `PaymentsResponse`, `UpdateProfileResponse`).
- API endpoints под `/api/account/*` (требуют `requireAuth`):
  - `GET /api/account/dashboard` — агрегаты (`stats.totalProjects/completedProjects/activeOrders/totalSpent`), последние 4 проекта, активные заказы (статусы `NEW/NEGOTIATING/PRICE_SET/PAID/IN_PROGRESS/REVIEW`), последние 5 транзакций.
  - `GET /api/account/transactions?page=&limit=&type=topup|spending|all` — пагинированный лог `TokenTransaction`.
  - `GET /api/account/payments?page=&limit=` — пагинированные платежи юзера.
  - `PATCH /api/account/profile` — обновление `name/avatar/messenger/messengerType`.
  - `POST /api/account/profile/password` — смена пароля; при успехе **ротирует cookies** (новые `accessToken`/`refreshToken`).
  - `DELETE /api/account` — soft-delete: ставит `deletedAt = now()`, заменяет email на `deleted_<id>@allvision.local` (чтобы освободить email под перерегистрацию), очищает auth-cookies. Полная чистка через 30 дней — на будущую джобу.
- Реализация в `apps/api/src/services/account-service.ts` + роутер `apps/api/src/routes/account.ts`, подключён в `apps/api/src/routes/index.ts`.
- Тесты `apps/api/src/__tests__/account.test.ts`: 401 без авторизации, корректная dashboard-структура, обновление профиля, валидация, неверный/верный oldPassword (с проверкой выдачи новых cookies), soft-delete + проверка флага в БД. Тесты используют один общий `request.agent`, чтобы не упереться в `authLimiter` (5 логинов/15 мин). `npm test -w @allvision/api` → 13/13.
- Frontend RTK Query: `apps/web/src/store/api/account-api.ts` (`accountApi`, теги `User/Dashboard/Transactions/Payments`), хуки `useGetDashboardQuery`, `useGetTransactionsQuery`, `useGetPaymentsQuery`, `useUpdateProfileMutation`, `useChangePasswordMutation`, `useDeleteAccountMutation`. Подключён в `apps/web/src/store/index.ts`.
- Layout кабинета: `apps/web/src/app/dashboard/layout.tsx` оборачивает `AuthGuard` + flex-структуру с `DashboardSidebar` (desktop) и контент-областью на `slate-950`. Sidebar — `apps/web/src/components/dashboard/DashboardSidebar.tsx` (общий контент через `DashboardSidebarContent`); мобильная версия — `apps/web/src/components/dashboard/DashboardSidebarMobile.tsx` через `Sheet`. Sidebar содержит: блок профиля, акцентный блок баланса (link на `/pricing`), 6 пунктов меню с активной violet-подсветкой, кнопку «Купить токены» внизу.
- Header (`apps/web/src/components/layout/Header.tsx`): на путях `/dashboard/**` слева добавлена кнопка-гамбургер, открывающая мобильный sidebar (`DashboardSidebarMobile`); пункт «Кабинет» в dropdown был добавлен ранее, оставлен.
- Страницы кабинета:
  - `/dashboard` — приветствие, 4 stat-карточки, блок «Что хотите создать?» (3 quick-start карточки на услуги photo-restore/photo-animate/trends), сетка «Последние проекты» (2/3) + «Последние операции» (1/3), активные заказы (показываются если есть). При полном empty-state добавлен gradient-CTA блок «Начните прямо сейчас».
  - `/dashboard/projects` — chip-фильтры по статусу, поиск, сетка `ProjectCard`. На 1.4 массив пуст — empty state.
  - `/dashboard/orders` — `Tabs` (Все/Активные/Завершённые/Отменённые), `OrderCard`. На 1.4 пусто — empty state.
  - `/dashboard/fairy-tales` — empty state с CTA на `/services/fairy-tale`.
  - `/dashboard/billing` — карточка баланса сверху, `Tabs` «История транзакций» / «История платежей»; в транзакциях chip-фильтр all/topup/spending, таблица с пагинацией. У свежезарегистрированного юзера видно как минимум одну запись `welcome_bonus`. Empty state в платежах ведёт на `/pricing`.
  - `/dashboard/profile` — 4 секции: Личные данные (аватар-плейсхолдер «скоро», name, email read-only, дата регистрации), Контактные данные (нативный `<select>` для `messengerType` — чтобы не добавлять новый shadcn-компонент, контакт строкой), Безопасность (раскрывающаяся форма смены пароля, после успеха toast «Пароль изменён, произведён повторный вход»), Удаление аккаунта (alert-блок + раскрывающаяся форма с confirmation = `УДАЛИТЬ` + текущий пароль, кнопка «Подтвердить удаление» disabled пока не введено; после удаления — `clearUser` + `authApi.util.resetApiState()` + редирект на `/`).
- Переиспользуемые компоненты в `apps/web/src/components/dashboard/`:
  - `EmptyState.tsx` (props: `icon/title/description/actions/size sm|md|lg`).
  - `StatCard.tsx` (icon, label, value, hint, optional cta, accent `amber|violet|emerald|sky|default`).
  - `ProjectCard.tsx`, `OrderCard.tsx` — карточки списков (используют `next/image`, бейдж статуса).
  - `TransactionRow.tsx`, `PaymentRow.tsx` — строки таблиц биллинга.
  - `DashboardSidebar.tsx` + `DashboardSidebarContent` (общий рендер для desktop и Sheet) + `DashboardSidebarMobile.tsx`.
  - `sidebar-nav.tsx` (массив `SIDEBAR_ITEMS` + `isActive`), `labels.ts` (русские лейблы и цвета для `ProjectStatus/OrderStatus/OrderType` + `transactionDescription`, `formatDate`, `formatDateTime`).
- Инвалидация Redux при изменениях профиля: `accountApi` дёргает теги `User/Dashboard`, дополнительно из mutation вручную вызывается `dispatch(authApi.util.invalidateTags(['Me']))`, чтобы Header и `useAuth` подхватили новые `name/messenger/tokenBalance`.
- Нестандартные решения:
  - Soft-delete освобождает email через `deleted_<id>@allvision.local`, а не оставляет оригинальный — это даёт юзеру возможность зарегистрироваться заново тем же email; флаг `deletedAt` сохраняется на самой записи для будущей джобы полной чистки.
  - Тесты делают один `register` и переиспользуют `request.agent` — иначе многократный логин в одном файле упирается в `authLimiter` (5 за 15 минут).
  - В worker (`apps/worker/src/index.ts`) поправлена пред-существующая ошибка типизации: `Parameters<typeof Worker>` → `ConstructorParameters<typeof Worker>`, иначе ломался корневой `npm run build`.
  - `messengerType` редактируется через нативный `<select>` (а не shadcn `Select`), чтобы не вводить новую UI-зависимость на этапе 1.4.
- Проверки, которые прошли: `npx prisma migrate dev --name add_user_soft_delete --schema packages/database/prisma/schema.prisma`, `npm run build -w @allvision/shared`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`, `npm run build` (root), `npm test -w @allvision/api` (13 passed).
- Ручная проверка по чек-листу (рекомендуется после `npm run dev`): зайти как `user@allvision.studio` (баланс 500), открыть `/dashboard` → видеть приветствие, 4 stat-карточки, empty state «Готовы создать первое чудо?», 1 транзакцию `welcome_bonus`; проверить sidebar (active highlight, mobile-гамбургер из Header); открыть `/dashboard/billing` → tab «История транзакций» с 1 строкой, tab «История платежей» с empty state; в `/dashboard/profile` обновить имя — toast и обновление в Header; смена пароля → toast и login сохраняется; удалить аккаунт → редирект на `/`, повторная попытка login со старым email → 401.

### Этап 1.5 — Mock-платежи ✅
- API `/api/payments/*`:
  - `POST /api/payments/topup` создаёт `Payment` для активного `TokenPackage`, хранит сумму в копейках (`priceRub * 100`), `tokensAdded = tokens + bonus`, `purpose=TOPUP`, provider из `PAYMENT_PROVIDER`, metadata пакета и `confirmationUrl`.
  - `POST /api/payments/order/:orderId` подготовлен под услуги 4-6: проверяет owner, `Order.status === PRICE_SET`, наличие `priceRub`, создаёт `Payment` с `purpose=ORDER` и привязывает его через `Order.paymentId`.
  - `POST /api/payments/webhook` без auth: для mock принимает `{ paymentId, event, signature? }`, вызывает provider verification, ищет `Payment.providerPaymentId`, обрабатывает `succeeded/failed/canceled`.
  - `GET /api/payments/:id` и `GET /api/payments/:id/status` возвращают платёж/статус; статус требует owner. `GET /api/payments/:id` разрешён публично только для `provider=mock`, чтобы `/mock-payment/[id]` могла показать детали внешней страницы без отдельного публичного эндпоинта.
- Backend-файлы этапа: `apps/api/src/providers/mock-payment-provider.ts`, `apps/api/src/services/payment-provider.ts`, `apps/api/src/services/payment-service.ts`, `apps/api/src/routes/payments.ts`, подключение router в `apps/api/src/routes/index.ts`; в `apps/api/src/app.ts` добавлен capture `rawBody` для webhook verification.
- Webhook логика idempotent: если платёж уже `SUCCEEDED`, повторный `succeeded` возвращает 200 и не меняет баланс. Успешный TOPUP выполняется в Prisma transaction: `Payment.status=SUCCEEDED`, `paidAt`, `User.tokenBalance += tokensAdded`, `TokenTransaction(reason='topup', refId=payment.id, balanceAfter=новый баланс)`. Для `ORDER` выставляется `Order.status=PAID`, токены не начисляются. `failed` → `FAILED`, `canceled/cancelled` → `CANCELLED` без изменения баланса.
- Frontend:
  - Новая страница `apps/web/src/app/mock-payment/[id]/page.tsx`: public mock checkout в стиле платёжной системы, сумма/продавец/назначение/ID, disabled методы Карта/СБП/Кошелёк, фейковые поля карты, большая кнопка оплаты и dev-сценарии успех/отказ/таймаут.
  - `/pricing`: `PricingCards` теперь вызывает `useTopupMutation`, для гостя ведёт на `/login?redirect=/pricing`, для user создаёт payment и редиректит на `confirmationUrl`; добавлен аккордеон промокода-заглушки в `PricingPageContent`.
  - `/dashboard/billing`: читает `?payment=success|failed|cancelled`, показывает toast, убирает query через `router.replace`, включает polling платежей каждые 5 секунд при наличии `PENDING`, показывает `Завершить оплату` для `PENDING` и `Повторить покупку` для `FAILED`.
  - `PaymentRow` теперь показывает рубли из копеек (`amountRub / 100`) и строит mock confirmation href по `providerPaymentId`.
- RTK Query: создан `apps/web/src/store/api/payments-api.ts` (`topup`, `payOrder`, `getPayment`, `getPaymentStatus`, tag `Payment`) и подключён в `apps/web/src/store/index.ts`.
- Auto-invalidation: `payments-api.ts` содержит helper `invalidatePaymentSideEffects`, который инвалидирует `accountApi` tags `User/Dashboard/Payments/Transactions` и `authApi` tags `Me/User`. `authApi` расширен тегом `User`, а `useAuth` больше не пропускает `/me` при уже заполненном user, чтобы Header подхватывал новый `tokenBalance` после invalidation.
- Нестандартные решения:
  - `MockPaymentProvider.createPayment` использует локальный `Payment.id` как `providerPaymentId`, поэтому confirmation URL имеет вид `/mock-payment/{payment.id}`; это упрощает ручной smoke и idempotency на этапе 1.5. При переходе на YooKassa UI не меняется, меняется только provider.
  - Mock page отправляет webhook напрямую из браузера, потому что это dev-only симулятор внешнего провайдера. При реальной YooKassa webhook будет приходить server-to-server и использовать тот же `/api/payments/webhook`.
  - `GET /api/payments/:id` сделан optional-auth/public для mock provider, иначе публичная страница внешнего провайдера не смогла бы загрузить детали. Если пользователь авторизован и платёж чужой, API всё равно возвращает 403.
  - Root/web `next build` на Windows завершился с exit code 0, но после вывода маршрутов Next напечатал `Static worker exited with code: 3221225477`; это выглядит как известный пост-build воркер Windows/Node, не как TypeScript/build failure.
- Тесты: добавлен `apps/api/src/__tests__/payments.test.ts` с проверками `topup` (401, success, missing package, inactive package), `webhook` (404, succeeded TOPUP, idempotency, canceled, failed), `status` (owner status, 403 для чужого).
- Проверки, которые прошли: `npm test -w @allvision/api` (24 passed), `npm run build -w @allvision/shared`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`, `npm run build` (root).
- Ручной smoke для следующего запуска `npm run dev`: login `user@allvision.studio / user123`, `/pricing` → купить `Базовый` → `/mock-payment/[id]` → `✅ Симулировать успех` → `/dashboard/billing?payment=success` → toast и баланс 1050; затем проверить отказ (`FAILED` + `Повторить покупку`) и таймаут (`PENDING` + `Завершить оплату`).
