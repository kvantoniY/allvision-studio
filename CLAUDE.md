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
