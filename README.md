# Allvision Studio

Веб-сервис для AI-генерации медиа. Монорепо: Next.js (web) + Express (api) + BullMQ (worker) + Prisma/Postgres + Redis.

## Требования
- Node.js 20+
- Docker + Docker Compose
- npm 10+

## Быстрый старт

```bash
# 1. Скопировать переменные окружения
cp .env.example .env

# 2. Поднять Postgres + Redis
docker-compose -f docker/docker-compose.yml up -d

# 3. Установить зависимости
npm install

# 4. Применить миграции БД
npm run db:migrate

# 5. Наполнить БД демо-данными
npm run db:seed

# 6. Скачать/сгенерировать демо-ассеты для MockAIProvider (опционально)
npm run demo:download

# 7. Запустить всё сразу (web + api + worker)
npm run dev
```

## Демо-ассеты

После клонирования репо для разработки нужны демо-файлы для MockAIProvider —
картинки и видео-плейсхолдеры, которые провайдер выдаёт как «результат AI».

```bash
npm run demo:download
```

Что делает скрипт:

1. Скачивает 10 jpg с picsum.photos в `apps/api/demo-assets/photo-restore/`.
2. Если установлен `ffmpeg` — генерирует 6 mp4 (1080x1080) для photo-animate
   и 8 mp4 (1080x1920) для trends с эффектом «ken burns» из picsum-картинок.
3. Если `ffmpeg` не установлен — выводит warning и просит положить mp4 вручную:
   - `apps/api/demo-assets/photo-animate/animate-1.mp4 ... animate-6.mp4`
   - `apps/api/demo-assets/trends/trend-1.mp4 ... trend-8.mp4`
   - Бесплатные источники: pexels.com, mixkit.co, pixabay.com (5–10 сек роликов).

JSON-шаблоны сценариев сказок (`fairy-tales/template-*.json`) лежат в репо
и сюда не нужно ничего скачивать. Сами медиа (jpg/mp4) — локальные, в репо
не коммитятся (см. `apps/api/demo-assets/.gitignore`).

Без демо-ассетов MockAIProvider будет кидать `DEMO_ASSETS_EMPTY` при
попытке генерации.

Откроется:
- Фронт — http://localhost:3000
- API health — http://localhost:4000/api/health
- Prisma Studio — `npm run db:studio`

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Запуск web + api + worker параллельно |
| `npm run dev:web` | Только Next.js |
| `npm run dev:api` | Только Express API |
| `npm run dev:worker` | Только BullMQ worker |
| `npm run build` | Билд всех пакетов в нужном порядке |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:seed` | Сидирование БД |
| `npm run db:studio` | Prisma Studio |

## Структура

```
apps/
  web/       Next.js 14 App Router — фронт
  api/       Express — REST API
  worker/    BullMQ consumer
packages/
  database/  Prisma schema + клиент
  shared/    Общие типы, zod-схемы, интерфейсы провайдеров
docker/
  docker-compose.yml  Postgres 16 + Redis 7
```

## Фаза разработки

Сейчас **Фаза 1** — локальная, всё бесплатно. AI и платежи работают через mock-провайдеры.
