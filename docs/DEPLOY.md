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

Workflow создаёт релиз в `/opt/allvision-studio/releases/{sha}`, линкует общий `.env`, собирает images, переключает `current`, ждёт `/healthz` и `/api/ready`, затем хранит предыдущий релиз в `previous`.

## Env

## Shared volume ownership

Prod app-контейнеры `api`, `worker` и `web` запускаются под пользователем `allvision` с UID/GID `1000`, чтобы совпадать с пользователем `andromeda` на ВМ. Shared volumes должны принадлежать UID 1000; иначе API не сможет писать загруженные пользователем файлы в `/app/uploads`.

Для миграции существующей ВМ после ранних P6.5-деплоев:

```bash
sudo chown -R 1000:1000 /opt/allvision-studio/shared/{uploads,postgres_data,public-trends}
sudo chmod -R 755 /opt/allvision-studio/shared/{uploads,public-trends}
```

`PROVIDER_MODE=mock` - безопасный прод-режим P6.5: все AI-блоки идут через `MockAIProvider`, PiAPI и publisher не вызываются.

`PROVIDER_MODE=piapi` - реальные PiAPI-вызовы для `image-to-video` и `face-swap-video`; mock-only блоки остаются на mock. Требует `PIAPI_API_KEY`.

`PROVIDER_MODE=stub` - только для `NODE_ENV=test`.

`STORAGE_PUBLISHER=local` - для PiAPI публикует локальные upload-файлы как `https://allvision-pulse.ru/static/...` через наш nginx.

`STORAGE_PUBLISHER=r2` - использует Cloudflare R2 и требует `R2_*`.

`STORAGE_PUBLISHER=noop` - возвращает входной путь/URL как есть, полезно только для ручных mock-проверок.

Валидные prod-комбинации сейчас: `mock + local`, `mock + noop`, `piapi + local`, `piapi + r2`.

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
docker compose -f infra/prod/docker-compose.prod.yml --env-file infra/prod/.env up -d
```

## Rollback

Автоматический rollback выполняется workflow при неуспешном healthcheck. Ручной rollback:

```bash
/opt/allvision-studio/scripts/rollback.sh
```

## Логи

```bash
cd /opt/allvision-studio/current
docker compose -f infra/prod/docker-compose.prod.yml --env-file infra/prod/.env logs -f
```

Точечно:

```bash
docker logs -f allvision-studio-api
docker logs -f allvision-studio-worker
docker logs -f allvision-studio-web
```

## Технические долги

SSL сейчас на платном сертификате Рег.ру; миграция на Let's Encrypt запланирована в P7. Нет автоматических бекапов PostgreSQL, полноценного monitoring/alerting и multi-VM отказоустойчивости. Прод работает как single-VM инсталляция.
