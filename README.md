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

# 6. Запустить всё сразу (web + api + worker)
npm run dev
```

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
