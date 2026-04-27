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

### Этап 1.6a — Инфраструктура AI-генераций ✅
- ВАЖНО: этот этап включает реализации, которые изначально планировались в Этапе 1.2 (MockAIProvider, LocalFileStorage, фабрики), но фактически были пропущены — в `apps/api/src/providers/` лежал только `mock-payment-provider.ts`, AI/Storage реализаций не было. Сейчас это восполнено как Часть 0 этапа 1.6a.
- `apps/api/src/providers/local-file-storage.ts` — реализация `StorageProvider`. Методы: `upload({key, body, contentType})` поддерживает `Buffer | Readable` (через `pipeline`), создаёт подпапки рекурсивно, защищён от path traversal (`INVALID_KEY`); `getSignedUrl` возвращает публичный URL (для локалки подписи не нужны); `delete` идемпотентен (ENOENT глотается); бонусом `has()` для тестов. URL формируется как `${publicBaseUrl}/${key}`, где `publicBaseUrl = ${PUBLIC_API_URL}/static`.
- `apps/api/src/app.ts`: подключён `express.static('/static', UPLOADS_DIR)` с `crossOriginResourcePolicy: 'cross-origin'` в helmet (иначе картинки не отдаются на фронт). В dev `cacheControl: 0`, в prod `1d`.
- `apps/worker/src/providers/mock-ai-provider.ts` — реализация `AIProvider`. Внутри Map<jobId, MockJobState>: `startedAt`, `durationMs` (рандом 5–15 сек, в тестах переопределяется через `minDurationMs`/`maxDurationMs`), `resultDemoPath`, `resultType`, кэш `cachedResultUrl/Key`. `restorePhoto`/`animateImage`/`generateTrend` создают job, выбирают случайный файл из соответствующей папки `demo-assets/` (фильтр по mime: `.jpg/.png/.webp` для image, `.mp4/.webm/.mov` для video). При пустой папке — `Error: DEMO_ASSETS_EMPTY: ... Запустите: npm run demo:download`. `getJobStatus`: возвращает `processing` с `progress = round(elapsed/durationMs*100)` (clamp до 99), при completion **читает демо-файл и загружает в storage один раз**, кэширует URL — повторные `getJobStatus` URL не пересоздают. `generateFairyTaleScript` синхронный: случайный `template-*.json` + плейсхолдеры `{{childName}}/{{childAge}}/{{moralLesson}}/{{additionalDetails}}` (пустой `additionalDetails` → пустая строка), `tokensCost: 5`.
- Фабрики:
  - `apps/api/src/providers/index.ts` — `getStorageProvider()` (singleton, `STORAGE_PROVIDER=local|yandex-s3`, последний throw'ит «не реализован»), `getPaymentProvider()` (singleton mock); `_resetProvidersForTests()` — для тестов. `apps/api/src/services/payment-provider.ts` теперь делегирует в фабрику (для совместимости импортов).
  - `apps/worker/src/providers/index.ts` — `getStorageProvider()` (содержит копию `LocalFileStorage` под именем `WorkerLocalFileStorage`, потому что нельзя импортировать из `apps/api` — это apps/* пакет, не shared; обе реализации пишут в **одну и ту же** `UPLOADS_DIR`, и `/static`-роут API раздаёт всё), `getAIProvider()` (singleton mock).
- `.env.example` дополнен: `UPLOADS_DIR="./uploads"`, `DEMO_ASSETS_ROOT="./apps/api/demo-assets"`. `STORAGE_PROVIDER`, `AI_PROVIDER`, `PAYMENT_PROVIDER`, `PUBLIC_API_URL` уже были.
- `.gitignore` (корневой) уже содержал `uploads/` и `apps/api/uploads/` — не трогаем.
- Демо-ассеты: создана структура `apps/api/demo-assets/{photo-restore,photo-animate,trends,fairy-tales}/` с `.gitkeep` в каждой подпапке. `apps/api/demo-assets/.gitignore`: `*` + whitelist `.gitignore`, `*/`, `**/.gitkeep`, `**/template-*.json` — то есть в репо едут только структура и JSON-шаблоны сказок, медиа (jpg/mp4) — локально.
- 3 JSON-шаблона сказок коммитятся в репо: `template-friendship.json` (дружба), `template-courage.json` (смелость, страх темноты), `template-sharing.json` (умение делиться). У каждого — 7 сцен с `description/dialogue/visualCues`, плейсхолдеры `{{childName}}`, `{{childAge}}`, `{{moralLesson}}`, `{{additionalDetails}}`.
- `apps/api/scripts/download-demo-assets.ts` (запуск: `npm run demo:download`):
  - photo-restore: 10 jpg с `https://picsum.photos/seed/restore-{N}/1200/1200`, через `https.get` с follow-redirects (picsum редиректит на `fastly.picsum.photos`).
  - photo-animate (6) и trends (8): если `ffmpeg` найден (`spawnSync('ffmpeg', ['-version'])`) — генерирует mp4 5 сек через `ffmpeg -loop 1 -i pic.jpg -t 5 -vf "scale...crop...zoompan..." libx264 +faststart` (квадрат 1080×1080 для animate, вертикаль 1080×1920 для trends, эффект «ken burns» — медленный зум). Если ffmpeg нет — выводит warning со списком файлов и ссылками на pexels/mixkit/pixabay.
  - Идемпотентный: существующие файлы skip'аются.
- File upload (Multer):
  - Установлены `multer`, `@types/multer`, `sharp` в `@allvision/api`. `bullmq`, `ioredis` тоже добавлены в api (worker имел уже).
  - `apps/api/src/middleware/upload.ts` — `multer.memoryStorage()`, `limits.fileSize: 25 MB`, `fileFilter` пропускает только `image/jpeg|png|webp` (для всего остального throw `INVALID_MIME: <mime>`). Экспортируются `uploadSinglePhoto = .single('image')` и `uploadMultiplePhotos = .array('images', 5)`. Видео-аплоад от юзера в MVP не делаем — добавим если понадобится.
  - `apps/api/src/middleware/error-handler.ts` дополнен: `MulterError.LIMIT_FILE_SIZE → 413 FILE_TOO_LARGE`, `LIMIT_UNEXPECTED_FILE → 400 INVALID_FIELD`, `LIMIT_FILE_COUNT → 400 TOO_MANY_FILES`, прочее `400 INVALID_FILE`. Ошибки с `INVALID_MIME` префиксом → `400 UNSUPPORTED_FORMAT`.
  - `apps/api/src/services/file-service.ts` — `validateAndProcessImage(buffer)` через sharp проверяет metadata, mime определяется из format (`jpeg/png/webp`), при `max(width,height) > 4000` ресайзит с `fit: 'inside'`. `uploadUserImage(userId, buffer, contentType)` строит ключ `user-uploads/{userId}/{YYYY-MM}/{uuid}.{ext}`. `uploadResult(buffer, contentType, projectId)` — `results/{projectId}/{uuid}.{ext}`. `deleteFile(key)` через storage.
  - Тестовый эндпоинт `POST /api/test/upload` (требует auth, поле `image`) — отмечен `// TODO(1.6b): убрать` в `apps/api/src/routes/test.ts`. Используется только для smoke-теста на 1.6a, удаляется при появлении `/api/projects` в 1.6b.
- BullMQ:
  - `packages/shared/src/types/queue.ts` — `QUEUE_NAMES` constant (`PHOTO_RESTORE/PHOTO_ANIMATE/TREND/FAIRY_TALE_SCRIPT`), `QueueName` тип, интерфейсы `ProjectJobData` и `FairyTaleJobData`. Реэкспортирован из `@allvision/shared`.
  - `apps/api/src/queues/index.ts` — singleton `IORedis` connection (`maxRetriesPerRequest: null`), `Map<QueueName, Queue>`, `getQueue(name)` (lazy), default options `removeOnComplete: 100`, `removeOnFail: 50`, `attempts: 2`, `backoff: exponential 5000ms`. Хелперы `addProjectJob` и `addFairyTaleScriptJob`. `closeQueues()` — для shutdown/тестов.
  - `apps/worker/src/index.ts` — теперь регистрирует **4** воркера (включая `fairy-tale-script`) с `concurrency: 2`. Логирует `Worker ready: <name> (concurrency: 2)`, `job started/completed/failed`. Graceful shutdown по SIGINT/SIGTERM/SIGHUP закрывает все воркеры и Redis за 5 сек.
  - `apps/worker/src/processors/base.ts` — `updateProjectProgress`, `markProjectCompleted` (transaction-friendly, обнуляет result-поля если их нет), `markProjectFailed(projectId, message, {refundTokens=true})` — в Prisma transaction обновляет статус и при `refundTokens` инкрементит баланс + создаёт `TokenTransaction(reason='refund', refId=projectId)`. Используется будет в 1.6b.
  - Processor'ы (`photo-restore.ts`, `photo-animate.ts`, `trend.ts`, `fairy-tale-script.ts`) на 1.6a — заглушки: только `console.log('[<queue>] job received: ...')` и `return { ok, stub: true }`. Реальная логика появится в 1.6b/1.6c.
- Тесты:
  - `apps/api/src/__tests__/local-file-storage.test.ts` — upload buffer, nested dirs, has(), delete idempotency, path traversal protection.
  - `apps/api/src/__tests__/file-service.test.ts` — валидный PNG, ресайз >4000px, отказ на не-картинку, uploadUserImage реально пишет файл и возвращает корректный URL.
  - `apps/api/src/__tests__/mock-ai-provider.test.ts` — DEMO_ASSETS_EMPTY, restorePhoto+getJobStatus → completed с реальным URL и файлом в storage, repeat не пересоздаёт файл (caching), generateFairyTaleScript заменяет плейсхолдеры, пустой `additionalDetails` → пустая строка, JOB_NOT_FOUND. Кросс-импорт MockAIProvider из `apps/worker/src/...` — поэтому в `apps/api/tsconfig.json` появился `exclude: ["src/__tests__/**/*", "dist"]`, иначе `tsc` ругался на `rootDir`. ts-jest тесты по-прежнему видит.
  - `apps/api/src/__tests__/queue.test.ts` — smoke: `getQueue` возвращает singleton, `addProjectJob` кладёт job в Redis. Проверка наличия Redis через `lazyConnect+ping`; если Redis недоступен — тест печатает warning и не падает.
- Нестандартные решения:
  - LocalFileStorage существует **в двух местах**: в `apps/api/src/providers/` (для API/тестов/file-service) и в `apps/worker/src/providers/index.ts` под именем `WorkerLocalFileStorage` (для MockAIProvider). Дублирование намеренное: нельзя импортировать из `@allvision/api` (это apps/*, не shared), а выносить в `packages/shared` Buffer/Readable/fs-зависимости — лишнее. Файлы пишутся в одну и ту же `UPLOADS_DIR`, поэтому `/static`-роут API отдаёт результаты, загруженные воркером.
  - `helmet` пришлось ослабить через `crossOriginResourcePolicy: { policy: 'cross-origin' }` — без этого `/static`-картинки не загружались на фронт с другого порта.
  - Кросс-импорт MockAIProvider в API-тесты вместо отдельного jest-сетапа в worker — проще; цена в одну строку `exclude` в `tsconfig.json`.
  - В `MockAIProvider.getJobStatus` `progress` clamp'ится до 99 пока `elapsed < durationMs`, чтобы UI не «дёргался» на 100% до момента, когда файл реально загружен.
  - `addProjectJob` принимает только три «AUTO»-очереди (для услуг 1-3), для FAIRY_TALE_SCRIPT — отдельный `addFairyTaleScriptJob` со своим типом данных.
  - В seed-скрипте картинки уже на picsum.photos — это **другая** механика (статические URL в строковых полях БД); MockAIProvider использует свои демо-файлы из `demo-assets/`.
- Команды и smoke-тест:
  - Скачать демо: `npm run demo:download` — должен скачать 10 фото; видео генерирует если есть ffmpeg, иначе просит положить руками.
  - Тесты: `npm test -w @allvision/api` (41 passed: 6 auth + 7 account + 11 payments + 5 LocalFileStorage + 4 file-service + 6 MockAIProvider + 2 queue).
  - Билды: `npm run build -w @allvision/shared`, `-w @allvision/api`, `-w @allvision/worker`, `-w @allvision/web`, `npm run build` (root).
  - Ручной smoke (после `npm run demo:download` и `npm run dev`): залогиниться (user@allvision.studio / user123), затем `curl -X POST http://localhost:4000/api/test/upload -H "Cookie: accessToken=..." -F "image=@some.jpg"` → получить `{url, key, dimensions}`, открыть `url` в браузере → видеть свою картинку. На диске появится `uploads/user-uploads/<userId>/<YYYY-MM>/<uuid>.jpg`. В логах worker: `Worker ready: photo-restore (concurrency: 2)` ×4 для каждой очереди.
- ⚠️ Тестовый эндпоинт `POST /api/test/upload` после ручной проверки **должен быть удалён** в этапе 1.6b при появлении реального `/api/projects`. Это явный TODO в `apps/api/src/routes/test.ts` и `apps/api/src/routes/index.ts`.

### Этап 1.6b — Услуга №1 «Улучшение фото» end-to-end ✅
- Backend/API:
  - Созданы `packages/shared/src/schemas/projects.ts` и экспорт в `packages/shared/src/schemas/index.ts`: `createProjectSchema` и `listProjectsQuerySchema` (`page`, `limit`, `status`, `serviceSlug`).
  - `apps/api/src/middleware/rate-limit.ts`: добавлен `projectCreateLimiter` — 10 запросов / 60 секунд / на `req.user.id`, fallback на IP только если user по какой-то причине отсутствует.
  - Создан `apps/api/src/routes/projects.ts`, подключён в `apps/api/src/routes/index.ts` как `/api/projects`.
  - Удалён временный smoke endpoint `POST /api/test/upload`: файл `apps/api/src/routes/test.ts` удалён, регистрация `/test` снята. Проверка `rg "test/upload" apps` возвращает пусто.
  - `packages/shared/src/types/queue.ts`: `ProjectJobData` расширен optional `inputImageUrl`, чтобы новый `/api/projects` мог передавать прямой URL входного фото; старые поля `serviceId/inputImages/aiConfig` сохранены для совместимости существующих тестов очереди и будущих услуг 2-3.
- API-контракт `/api/projects`:
  - `POST /api/projects`: middleware order `requireAuth → projectCreateLimiter → uploadSinglePhoto`; принимает multipart `image` + `serviceSlug`.
  - На этапе 1.6b реализован только `serviceSlug='photo-restore'`. `photo-animate` и `trends` возвращают `400 SERVICE_NOT_SUPPORTED_YET`; любой другой slug — `404 SERVICE_NOT_FOUND`.
  - Файл валидируется через `validateAndProcessImage(req.file.buffer)`. Затем файл загружается через `uploadUserImage(userId, buffer, contentType)` до транзакции; если транзакция падает, API вызывает `deleteFile(key)` в catch, логирует ошибку удаления и пробрасывает исходную ошибку.
  - Prisma transaction: атомарное списание `User.tokenBalance` через `tx.user.update({ where: { id, tokenBalance: { gte: tokensCost } } })`; при `P2025` возвращается `402 INSUFFICIENT_TOKENS`. Затем создаётся `Project(status=PENDING, progress=0, inputImages=[url], tokensCost=20, title='Улучшение фото — DD.MM.YYYY HH:mm')` и `TokenTransaction(reason='spending', amount=-20, refId=project.id, balanceAfter=новый баланс)`.
  - После транзакции ставится BullMQ job: `addProjectJob(QUEUE_NAMES.PHOTO_RESTORE, { projectId, userId, inputImageUrl, serviceId, inputImages, aiConfig })`.
  - Если `addProjectJob` падает (Redis down): проект помечается `FAILED` с `errorMessage='Queue unavailable'`, отдельной транзакцией делается refund (`User.tokenBalance += tokensCost`, `TokenTransaction(reason='refund', amount=+tokensCost, refId=project.id)`), загруженный файл удаляется, API возвращает `503 QUEUE_UNAVAILABLE`. Если refund-транзакция сама падает — ошибка логируется, но клиент всё равно получает 503.
  - `GET /api/projects/:id`: owner check через `findFirst({ id, userId })`, чужой/отсутствующий проект возвращает `404 PROJECT_NOT_FOUND`; отдаётся Project без `aiProviderLogs`, с `service: { slug, title, name, category }` (`name` алиасит существующее поле `Service.title`, потому что в Prisma нет поля `name`).
  - `GET /api/projects/:id/status`: лёгкий polling endpoint без include и тяжёлых полей: `{ id, status, progress, resultImage, resultVideo, resultThumbnail, errorMessage, completedAt }`.
  - `GET /api/projects`: owner list, сортировка `createdAt desc`, server-side фильтры `status/serviceSlug`, пагинация `{ items, total, page, limit }`, без `aiProviderLogs/aiProviderJobId`.
- Worker:
  - `apps/worker/src/processors/photo-restore.ts` полностью переписан: больше нет `return { ok: true, stub: true }`.
  - Алгоритм: проверяет существование проекта и `status === PENDING`; переводит в `PROCESSING`; вызывает `getAIProvider().restorePhoto({ imageUrl, config: {} })`; сохраняет `aiProviderJobId`; затем polling `getJobStatus(handle)` каждые 1500 мс, максимум 60 итераций (90 секунд safety timeout).
  - `processing` → `updateProjectProgress(projectId, status.progress)` + `await sleep(1500)`.
  - `failed` → один вызов `markProjectFailed(projectId, message, { refundTokens: true })`.
  - `completed` → требует `resultUrl`, принимает `resultType=image|video`; для video логирует warning и сохраняет в `resultVideo`, image — в `resultImage`; завершает через `markProjectCompleted`.
  - Timeout → `markProjectFailed(projectId, 'AI processing timeout', { refundTokens: true })`.
  - Exception до перехода в `PROCESSING` пробрасывается — BullMQ может ретраить, потому что токены ещё не надо возвращать процессором. Exception после перехода в `PROCESSING` не rethrow'ится: processor делает refund + `FAILED` без BullMQ retry, чтобы повторный retry не начислил refund второй раз.
  - Добавлен маленький локальный `apps/worker/src/utils/logger.ts`, потому что в worker не было общего logger и тянуть `winston`/api logger в worker не нужно.
- Frontend/RTK Query:
  - Создан `apps/web/src/store/api/projects-api.ts`: `createProject`, `getProject`, `getProjectStatus`, `listProjects`; tag types `Project`, `ProjectStatus`; после `createProject` инвалидируются списки проектов.
  - Side effects после `createProject`: helper `invalidateProjectSideEffects` инвалидирует `accountApi` tags `User/Dashboard/Transactions` и `authApi` tags `Me/User`, чтобы баланс, dashboard и история транзакций обновлялись после списания.
  - Slice подключён в `apps/web/src/store/index.ts` (reducer + middleware).
- Frontend/UI:
  - Создан `apps/web/src/components/services/PhotoRestoreUploader.tsx` и встроен в существующую `/services/photo-restore` через `ServiceDetail`, не переписывая hero/описание/галерею.
  - Uploader: гость видит «Войти и улучшить» → `/login?redirect=/services/photo-restore`; user с балансом < 20 видит блок нехватки токенов и кнопку `/pricing`; user с балансом ≥ 20 видит native drag-and-drop/click upload (один JPEG/PNG/WebP до 25 MB), preview, «Заменить», «Улучшить за 20 токенов». После success — `router.push('/dashboard/projects/{id}')`; ошибки мапятся на человекочитаемые toast-сообщения.
  - Созданы `apps/web/src/app/dashboard/projects/[id]/page.tsx` и `ProjectPageContent.tsx`: server wrapper проверяет `PROJECT_NOT_FOUND` через `notFound()`, client content делает `getProject` для метаданных и `getProjectStatus` с polling 3000 мс до `COMPLETED/FAILED`.
  - Создан `apps/web/src/components/ui/progress.tsx` — локальный shadcn-like Progress без новой зависимости.
  - `apps/web/src/app/dashboard/projects/page.tsx`: список теперь читает `useListProjectsQuery({ page: 1, limit: 20, status })`; chip-фильтры статуса идут server-side, поиск по title остаётся client-side.
  - `apps/web/src/app/dashboard/page.tsx`: секция «Последние проекты» теперь читает `useListProjectsQuery({ page: 1, limit: 3 })`; empty state остаётся при `total === 0`.
  - `apps/web/next.config.mjs`: добавлены `localhost:4000/static/**` и `127.0.0.1:4000/static/**` для отображения загруженных user/result images через `next/image`.
- Тесты:
  - Добавлен `apps/api/src/__tests__/projects.test.ts`: 9 проверок — 401 без auth, 400 без файла, 400 неверный MIME, 404 unknown slug, 400 `photo-animate`, 402 `INSUFFICIENT_TOKENS`, 201 happy path со списанием и `TokenTransaction(reason='spending')`, 404 для чужого проекта, пагинация 25 проектов (`page=2&limit=10`).
  - Очередь в tests мокается через `jest.spyOn(queuesModule, 'addProjectJob')`; реальный Redis не нужен для happy path.
- Нестандартные решения и долги:
  - `TokenTransaction.reason` для списания выбран как `spending`, потому что существующий `/dashboard/billing` уже фильтрует chip `spending`.
  - Медиа в `apps/api/demo-assets/*` не коммитятся по `.gitignore`; для локального e2e после свежего checkout нужно `npm run demo:download`. В этой сессии команда скачала 10 jpg для `photo-restore`; video assets для 1.6c не генерировались, потому что `ffmpeg` не найден.
  - `apps/api/src/utils/paths.ts` и `apps/worker/src/utils/paths.ts` резолвят относительные `UPLOADS_DIR`/`DEMO_ASSETS_ROOT` от корня workspace, а не от `apps/api` или `apps/worker`. Это важно при `npm run dev -w ...`: иначе worker ищет `./apps/api/demo-assets` как `apps/worker/apps/api/demo-assets` и падает с `DEMO_ASSETS_EMPTY`.
  - В `packages/database/package.json` добавлен `build = prisma generate`, потому что self-check требует `npm run build -w @allvision/database`, а такого script раньше не было.
  - Root `package.json` build переведён с нестабильно падавшего на Windows shorthand `npm run generate -w @allvision/database` на прямой `npx prisma generate --schema packages/database/prisma/schema.prisma`. Эквивалентный `npm --workspace @allvision/database run generate` проходил, но root build должен быть воспроизводим одной командой.
  - Услуги 2 (`photo-animate`) и 3 (`trends`) остаются заглушками до 1.6c. NSFW, email-уведомления, share-кнопка и реальный AI-provider не делались.
- Проверки:
  - Pre-flight эквивалентно выполнен через PowerShell/`rg`, потому что `grep` и `/bin/bash` отсутствуют в окружении. Подтверждены: `photo-restore` в seed, `model Project`, `MockAIProvider.restorePhoto/getJobStatus`, helpers `markProjectCompleted/markProjectFailed/updateProjectProgress`, очереди, upload helpers, заглушка `photo-restore` до правки. `Service.priceTokens === 20`; `Service.isActive` берётся из Prisma default `true` и при test upsert явно выставляется `true`.
  - Прошли: `npm run build -w @allvision/shared`, `npm run build -w @allvision/database`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`, `npm run build` (root). `next build` оставляет warning на `<img>` в result view, потому что в контракте результата явно нужен `<img>`; build exit code 0.
  - `npm test -w @allvision/api` сейчас не прошёл из-за внешнего окружения: Postgres на `localhost:5433` недоступен, Docker Desktop service `com.docker.service` остановлен и `Start-Service` не имеет прав (`Cannot open com.docker.service`). Итоговый счётчик Jest при этом видит 50 тестов total (было 41, стало +9); 17 успели пройти, 33 DB-зависимых упали на `Can't reach database server at localhost:5433`.

### Этап 1.6c-1 — Услуги №2 «Оживление фото» и №3 «Тренды» end-to-end ✅
- Pre-flight перед изменениями:
  - Через PowerShell/`rg` подтверждены seed-записи `photo-animate` и `trends`, цены `80` и `150`, наличие `prisma.trend`/`Trend` seed-данных.
  - Видеодемо лежит на месте: `apps/api/demo-assets/photo-animate/animate-1..4.mp4` и `apps/api/demo-assets/trends/trend-1..4.mp4`.
  - Заглушки `photo-animate.ts`/`trend.ts` были на месте до правки, публичные `GET /api/public/trends` и `GET /api/public/trends/:id` существуют как routes `/trends` в `publicRouter` под mount `/api/public`.
- Shared/API контракт:
  - `packages/shared/src/types/queue.ts`: `ProjectJobData.inputImageUrl` удалён. Единый контракт теперь `inputImages: string[]`; для трендов добавлено optional `trendId?: string`.
  - `packages/shared/src/schemas/projects.ts`: `createProjectSchema` расширена `trendId`; для `serviceSlug='trends'` отсутствие `trendId` даёт `400 TREND_REQUIRED`.
  - `apps/api/src/routes/projects.ts`: `POST /api/projects` теперь поддерживает `photo-restore`, `photo-animate`, `trends`; `SERVICE_NOT_SUPPORTED_YET` снят для услуг 2/3, прочие slug по-прежнему `404 SERVICE_NOT_FOUND`.
  - Для `photo-animate`: один upload `image` (jpeg/png/webp до 25 MB через существующий middleware), цена берётся из `Service.priceTokens=80`, title `Анимация фото — DD.MM.YYYY HH:mm`, job в `QUEUE_NAMES.PHOTO_ANIMATE`.
  - Для `trends`: multipart `image + serviceSlug=trends + trendId`; `Trend` ищется по id, `!trend || !trend.isActive` → `404 TREND_NOT_FOUND`, `trend.serviceId !== service.id` → `400 TREND_SERVICE_MISMATCH`; `Project.trendId` записывается, title `Тренд: <trend.title> — DD.MM.YYYY HH:mm`, job в `QUEUE_NAMES.TREND` с `trendId`.
  - Списание токенов для тренда использует цену услуги `Service.priceTokens=150`, не `Trend.priceTokens`. `trend.usedCount` в API не инкрементится.
  - `GET /api/projects/:id` больше не отдаёт алиас `service.name`; контракт `service: { slug, title, category }`, фронт читает `service.title`.
- Worker:
  - `apps/worker/src/processors/photo-restore.ts`: переведён на `job.data.inputImages[0]`; при пустом входе `markProjectFailed(projectId, 'No input image provided', { refundTokens: true })` без throw.
  - `apps/worker/src/processors/photo-animate.ts`: реальный processor вместо заглушки. Проверяет проект/user/status, переводит в `PROCESSING`, вызывает `aiProvider.animateImage({ imageUrl, config: {} })`, сохраняет `aiProviderJobId`, poll `getJobStatus` каждые 1500 мс максимум 60 итераций, успешный результат сохраняет в `resultVideo`, `resultThumbnail=null`.
  - `apps/worker/src/processors/trend.ts`: реальный processor. После проверки проекта загружает `Trend` по `job.data.trendId`; если нет — fail+refund. Вызывает `aiProvider.generateTrend({ imageUrl, trendPrompt: trend.prompt, model: trend.aiModel, config: trend.aiConfig })`, результат сохраняет в `resultVideo`.
  - После успешного `markProjectCompleted` для тренда отдельной операцией инкрементится `trend.usedCount`; ошибка инкремента логируется warning и не откатывает завершённый проект.
  - Оба processor'а сохраняют поведение 1.6b: exception до перехода в `PROCESSING` rethrow для BullMQ retry; exception после `PROCESSING` делает fail+refund и не rethrow'ится, чтобы не получить двойной refund.
- Frontend:
  - `apps/web/src/components/services/ProjectUploader.tsx`: общий uploader для `photo-restore` и `photo-animate` с native drag-and-drop, preview, client-side MIME/25 MB validation, auth/balance states и человекочитаемыми toast-ошибками.
  - `PhotoRestoreUploader.tsx` стал тонкой обёрткой над `ProjectUploader`; добавлен `PhotoAnimateUploader.tsx` и встроен в существующую страницу `/services/photo-animate` через `ServiceDetail`, без переписывания hero/описания/галереи.
  - `apps/web/src/components/services/TrendUploader.tsx`: отдельная форма для `/trends/[id]`, потому что нужно передавать `trendId`. Гость → `/login?redirect=/trends/{id}`, balance < 150 → `/pricing`, success → `/dashboard/projects/{project.id}`.
  - `apps/web/src/components/pages/TrendDetail.tsx`: вместо заглушки «создание позже» добавлен блок `TrendUploader`; каталог `/trends` остаётся read-only.
  - `apps/web/src/app/dashboard/projects/[id]/ProjectPageContent.tsx`: результат-image оставлен через `<img>` с точечным `// eslint-disable-next-line @next/next/no-img-element`; retry-link теперь ведёт на `/services/photo-restore`, `/services/photo-animate` или `/trends/{trendId}` в зависимости от проекта.
  - `apps/web/src/components/dashboard/ProjectCard.tsx`: video-проекты показывают `resultVideo` через `<video muted preload="metadata">`; если результата нет — placeholder, pending/processing/failed не показывают исходное фото как результат.
- Тесты:
  - `apps/api/src/__tests__/projects.test.ts` расширен и переведён на прямые auth cookies через `signAccessToken`, чтобы не упираться в auth rate limit.
  - Добавлены проверки: happy path `photo-animate` (`QUEUE_NAMES.PHOTO_ANIMATE`, списание 80), `photo-animate` insufficient balance 79→402, `TREND_REQUIRED`, `TREND_NOT_FOUND`, `TREND_SERVICE_MISMATCH`, happy path `trends` (`QUEUE_NAMES.TREND`, списание 150, `Project.trendId`, `trendId` в job data).
  - Queue по-прежнему мокается через `jest.spyOn(queuesModule, 'addProjectJob')`; Redis для этих tests не нужен.
- Нестандартные решения и заметки:
  - Для self-check пришлось остановить локальный `npm run dev` из `C:\Allvision-Studio`, потому что активные API/worker процессы держали `node_modules/.prisma/client/query_engine-windows.dll.node` и `npm run build -w @allvision/database` падал на `EPERM` rename.
  - `next build` на Windows печатает пост-build сообщение `Static worker exited with code: 3221225477`, но команда завершается exit code 0; `<img>` warning подавлен точечно.
  - Админский CRUD трендов, thumbnail для video, NSFW/email/share и реальный AI-provider не делались.
- Проверки:
  - Прошли: `npm run build -w @allvision/shared`, `npm run build -w @allvision/database`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`, `npm run build`.
  - `npm test -w @allvision/api` → 8 suites passed, **55 tests passed** (до 1.6c-1 было 50).

### Миграция перед 1.6c-2 — Trend.priceTokens optional ✅
- Ошибочная миграция `20260427115349_trend_price_tokens_optional_and_project_trend_set_null` была компенсирована: она временно сделала nullable `Service.priceTokens`, что неверно для базовой цены услуги.
- Корректная compensating-миграция `20260427120157_fix_trend_price_tokens_optional` возвращает `Service.priceTokens` в `NOT NULL` и делает `Trend.priceTokens` nullable (`Int?`).
- Семантика `Trend.priceTokens = null`: брать цену из связанной услуги `Service.priceTokens`. Списание в `/api/projects` будет переведено на `trend.priceTokens ?? service.priceTokens` в этапе 1.6c-2.
- `Project.trendId` явно зафиксирован в `schema.prisma` как `onDelete: SetNull`; на уровне FK это уже было задано в init-миграции `20260424114350_init`, поэтому новая FK-миграция не понадобилась.
- Публичный API трендов адаптирован к nullable-цене: `GET /api/public/trends` и `GET /api/public/trends/:id` отдают resolved `priceTokens`, подставляя цену услуги, если цена тренда `null`.
- Проверки: `npm run build -w @allvision/shared`, `npm run build -w @allvision/database`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`, `npm run build`, `npm test -w @allvision/api` → 8 suites passed, **55 tests passed**.
