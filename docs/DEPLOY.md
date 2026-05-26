# Allvision Studio production deploy

## Архитектура prod

DNS Рег.ру для `allvision-pulse.ru` и `www.allvision-pulse.ru` указывает на ВМ `158.160.209.107`. Хостовый nginx на ВМ терминирует SSL на `:443` сертификатом Рег.ру и проксирует на `http://127.0.0.1:80`. На `127.0.0.1:80` слушает docker nginx из Studio, который раздаёт `/static/trends/*` и `/static/*`, а остальное проксирует в `web:3000` и `api:4000`. Worker подключён к PostgreSQL и Redis, выполняет BullMQ jobs и пишет результаты в `/opt/allvision-studio/shared/uploads`.

Схема: `Reg.ru DNS -> VM -> host nginx :443 -> docker nginx 127.0.0.1:80 -> web/api/worker + postgres + redis`.

## Первый деплой

1. Создать GitHub Actions secrets:
   `SSH_HOST=158.160.209.107`, `SSH_USER=andromeda`, `SSH_KEY`, `SSH_KNOWN_HOSTS`.
2. На ВМ остановить старый Pulse, чтобы освободить `127.0.0.1:80`.
3. Создать `/opt/allvision-studio/shared/.env` из `infra/prod/.env.example` и заменить все `CHANGE_ME`.
4. Проверить, что уже есть `/opt/allvision-studio/shared/public-trends/trend-1.mp4`, `trend-2.mp4`, `trend-3.mp4`.
5. Запустить workflow `Deploy to production` через `workflow_dispatch` или push в `main`.

Workflow создаёт релиз в `/opt/allvision-studio/releases/{sha}`, синхронизирует общий `/opt/allvision-studio/shared/.env` с актуальным `infra/prod/.env.example`, линкует `.env`, собирает images, переключает `current`, пересоздаёт runtime-контейнеры `api`, `worker`, `web`, `nginx`, ждёт `/healthz` и `/api/ready`, затем хранит предыдущий релиз в `previous`.

## Env

`/opt/allvision-studio/shared/.env` является постоянным prod-файлом и не хранится в git. На каждом GitHub deploy запускается `scripts/sync-prod-env.sh`:

- новые ключи из `infra/prod/.env.example` добавляются в shared `.env`;
- существующие secrets и ручные значения не перетираются;
- deploy-managed operational keys обновляются до актуальных дефолтов из репозитория:
  `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_REGISTER_RATE_LIMIT`, `AUTH_LOGIN_RATE_LIMIT`,
  `PASSWORD_RESET_RATE_LIMIT`, `EMAIL_VERIFICATION_RATE_LIMIT`;
- перед изменением создаётся backup рядом с файлом: `.env.bak.YYYYMMDDHHMMSS`.

После изменения env workflow пересоздаёт runtime-контейнеры через `--force-recreate`, поэтому отдельно выполнять `docker compose restart` не нужно.

## Shared volume ownership

Prod app-контейнеры `api`, `worker` и `web` запускаются под пользователем `allvision` с UID/GID `1000`, чтобы совпадать с пользователем `andromeda` на ВМ. Shared volumes должны принадлежать UID 1000; иначе API не сможет писать загруженные пользователем файлы в `/app/uploads`.

Для миграции существующей ВМ после ранних P6.5-деплоев:

```bash
sudo chown -R 1000:1000 /opt/allvision-studio/shared/{uploads,postgres_data,public-trends}
sudo chmod -R 755 /opt/allvision-studio/shared/{uploads,public-trends}
```

`PROVIDER_MODE=mock` - режим локальной/ручной проверки через `MockAIProvider`; PiAPI и publisher не вызываются.

`PROVIDER_MODE=piapi` - реальные PiAPI-вызовы для `image-to-video` и `face-swap-video`; mock-only блоки остаются на mock. Требует `PIAPI_API_KEY`.

`PROVIDER_MODE=stub` - только для `NODE_ENV=test`.

`STORAGE_PUBLISHER=local` - для PiAPI публикует локальные upload-файлы как `https://allvision-pulse.ru/static/...` через наш nginx.

`STORAGE_PUBLISHER=r2` - использует Cloudflare R2 и требует `R2_*`.

`STORAGE_PUBLISHER=noop` - возвращает входной путь/URL как есть, полезно только для ручных mock-проверок.

Валидные prod-комбинации сейчас: `mock + local`, `mock + noop`, `piapi + local`, `piapi + r2`.

Production worker image больше не скачивает demo placeholder video/image во время build. В image попадают только файлы из репозитория, включая JSON-шаблоны сказок. Для локального `MockAIProvider` медиа-заглушки по-прежнему можно подготовить вручную командой `npm run demo:download`.

## Включение PiAPI

На ВМ:

```bash
sudoedit /opt/allvision-studio/shared/.env
```

Поменять:

```env
PROVIDER_MODE=piapi
STORAGE_PUBLISHER=local
PIAPI_API_KEY=...
```

Затем перезапустить стек:

```bash
cd /opt/allvision-studio/current
docker compose -f infra/prod/docker-compose.prod.yml \
  --env-file infra/prod/.env \
  --env-file infra/prod/.deploy.env \
  up -d --force-recreate --no-deps api worker web nginx
```

## Rollback

Автоматический rollback выполняется workflow при неуспешном healthcheck. Ручной rollback:

```bash
/opt/allvision-studio/scripts/rollback.sh
```

## Логи

```bash
cd /opt/allvision-studio/current
docker compose -f infra/prod/docker-compose.prod.yml \
  --env-file infra/prod/.env \
  --env-file infra/prod/.deploy.env \
  logs -f
```

Точечно:

```bash
docker logs -f allvision-studio-api
docker logs -f allvision-studio-worker
docker logs -f allvision-studio-web
```

## Технические долги

SSL сейчас на платном сертификате Рег.ру; миграция на Let's Encrypt запланирована в P7. Нет автоматических бекапов PostgreSQL, полноценного monitoring/alerting и multi-VM отказоустойчивости. Прод работает как single-VM инсталляция.
## Observability for AI assistant

P7.1 adds a read-only admin role for AI-assisted production diagnostics.

1. Set a strong password in `/opt/allvision-studio/shared/.env`:

```env
READONLY_ADMIN_EMAIL=claude-readonly@allvision-pulse.ru
READONLY_ADMIN_PASSWORD=replace-with-a-long-random-password
READONLY_ADMIN_ACCESS_TTL_MIN=1440
```

2. Restart the prod compose stack so the idempotent seed creates/updates the readonly user.

3. Get a Bearer token:

```bash
curl -s https://allvision-pulse.ru/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"claude-readonly@allvision-pulse.ru","password":"replace-with-a-long-random-password"}'
```

For `READONLY_ADMIN`, the response includes `accessToken`. Use it as:

```bash
curl -H "Authorization: Bearer $READONLY_TOKEN" \
  https://allvision-pulse.ru/api/admin-readonly/diagnostics
```

Available read-only endpoints:

- `GET /api/admin-readonly/diagnostics`
- `GET /api/admin-readonly/project/:id/full`
- `GET /api/admin-readonly/piapi/task/:taskId`
- `GET /api/admin-readonly/services`
- `GET /api/admin-readonly/media-assets?kind=trend-video`
- `GET /api/admin-readonly/block-catalog`
- `GET /api/admin-readonly/logs/worker?lines=200` returns 501 until `WORKER_STDOUT_LOG_PATH` or docker logs access is configured.

`READONLY_ADMIN` can only use read-only diagnostics. Mutating authenticated requests are rejected, and responses avoid user emails/password hashes/token secrets.

## P7.2 admin operations

Recompute service prices after deploy:

```bash
docker exec allvision-studio-api npm run prices:recompute
docker exec allvision-studio-api npm run prices:recompute -- --apply --margin 0.8
```

The command is dry-run without `--apply`. It reads `Service.pipelineConfig`, sums current `BLOCK_CATALOG` model costs, applies `PRICING_MARGIN_DEFAULT` (default `0.8`), converts with `PRICING_USD_TO_RUB` (default `80`), rounds up to 10 coins, and logs `old -> new` diffs.

Diagnostics page:

- `/admin/diagnostics` shows build version, API uptime, BullMQ queue counts, recent projects, recent errors, MediaAsset file existence, masked env values, and PiAPI balance.
- `POST /api/admin/diagnostics/refresh-balance` forces a PiAPI balance refresh.
- `POST /api/admin/diagnostics/reload-services-catalog` invalidates/reports catalog state; the current catalog is static in-process.

New env variables:

```env
PRICING_MARGIN_DEFAULT=0.8
PRICING_USD_TO_RUB=80
```

## Yandex SmartCaptcha

SmartCaptcha включается автоматически после заполнения ключей в `/opt/allvision-studio/shared/.env`.
До заполнения ключей виджет скрыт, а серверная проверка пропускается, чтобы deploy не ломал сайт.

1. В Yandex Cloud создайте SmartCaptcha для домена `allvision-pulse.ru`.
2. Внесите ключи на ВМ:

```env
NEXT_PUBLIC_YANDEX_SMARTCAPTCHA_SITE_KEY=sitekey-from-yandex
YANDEX_SMARTCAPTCHA_SECRET_KEY=server-key-from-yandex
CAPTCHA_ENABLED=true
NEXT_PUBLIC_CAPTCHA_ENABLED=true
YANDEX_SMARTCAPTCHA_VERIFY_URL=https://smartcaptcha.cloud.yandex.ru/validate
```

3. Запустите GitHub workflow `Deploy to production` или сделайте push в `main`.

Капча стоит на регистрации, входе, восстановлении и сбросе пароля, отправке письма подтверждения email, публичной контактной форме, создании тикета поддержки и ответах пользователя в тикете. Админские операции не требуют капчу.
