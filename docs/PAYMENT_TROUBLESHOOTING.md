# Payment troubleshooting — Robokassa

Когда деньги списались, но платёж висит в PENDING.

## Быстрый план действий

1. Откройте `/admin/payments` (раздел «Платежи» в админке).
2. Посмотрите карточку «Состояние платёжной системы» сверху — там показано,
   какой провайдер активен, включён ли poller, корректен ли merchant login,
   когда был последний успешный платёж и сколько висит PENDING.
3. Найдите свой платёж в списке (фильтр по статусу PENDING или поиск по InvId/email),
   откройте детали.
4. Нажмите **«Проверить через Робокассу»** — это сходит в OpStateExt и применит ответ.
5. Если Робокасса упорно молчит, но в её ЛК статус «выполнен», нажмите
   **«Подтвердить вручную и зачислить токены»**. Это безопасно: тот же
   transactional путь, что и обычный webhook (advisory lock + idempotent
   WHERE clause), токены зачисляются ровно один раз.

## Если UI ещё не обновился (контейнеры не пересобраны)

Прямо на ВМ через docker exec:

```bash
# Зайти на ВМ
ssh deploy@158.160.209.107

# Найти контейнер API (имя может отличаться)
docker ps | grep api

# Посмотреть все PENDING платежи
docker exec -it allvision-studio-api-1 \
  node /app/apps/api/dist/scripts/payment-recover.js list

# Посмотреть детали конкретного платежа
docker exec -it allvision-studio-api-1 \
  node /app/apps/api/dist/scripts/payment-recover.js show <invId-или-payment-id>

# Проверить через Robokassa OpStateExt (что реально вернёт API Робокассы)
docker exec -it allvision-studio-api-1 \
  node /app/apps/api/dist/scripts/payment-recover.js probe <invId>

# Применить ответ Робокассы к платежу
docker exec -it allvision-studio-api-1 \
  node /app/apps/api/dist/scripts/payment-recover.js recheck <invId-или-payment-id>

# Подтвердить вручную (когда деньги точно пришли) — начислит токены
docker exec -it allvision-studio-api-1 \
  node /app/apps/api/dist/scripts/payment-recover.js confirm <invId-или-payment-id>

# Пометить FAILED (когда деньги НЕ пришли)
docker exec -it allvision-studio-api-1 \
  node /app/apps/api/dist/scripts/payment-recover.js fail <invId-или-payment-id>
```

Чтобы узнать точное имя контейнера api: `docker compose -f /opt/allvision-studio/current/infra/prod/docker-compose.prod.yml ps`.

## Если на проде ещё старый код

GitHub Actions деплоится при push в `main` автоматически. Если workflow упал
или не запустился:

1. Зайдите в репозиторий GitHub → Actions → найдите последний run «Deploy to production».
2. Если run упал — посмотрите логи, типичные причины: нет SSH секретов, ошибка
   `prisma generate`, упавший healthcheck.
3. Чтобы перезапустить деплой вручную: GitHub → Actions → Deploy to production
   → Run workflow.

Прямой перезапуск контейнеров на ВМ без передеплоя (на текущем релизе):

```bash
ssh deploy@158.160.209.107
cd /opt/allvision-studio/current
docker compose -f infra/prod/docker-compose.prod.yml \
  --env-file infra/prod/.env --env-file infra/prod/.deploy.env \
  restart api worker
```

Полный пересбор контейнеров на текущем релизе (если код на ВМ актуальный, но
образ устарел):

```bash
ssh deploy@158.160.209.107
cd /opt/allvision-studio/current
docker compose -f infra/prod/docker-compose.prod.yml \
  --env-file infra/prod/.env --env-file infra/prod/.deploy.env \
  build api worker web

docker compose -f infra/prod/docker-compose.prod.yml \
  --env-file infra/prod/.env --env-file infra/prod/.deploy.env \
  up -d
```

## Проверить health прямо из терминала

```bash
# Health системы платежей (PAYMENT_PROVIDER, poller, число PENDING, и т.д.)
curl -fsS https://allvision-pulse.ru/api/health
curl -fsS https://allvision-pulse.ru/api/ready

# Из админки эта же информация на /admin/payments сверху
```

## Чек-лист Robokassa-конфигурации

В личном кабинете Robokassa (Технические настройки) должно быть:

- **Result URL** = `https://allvision-pulse.ru/api/payments/robokassa/result`, метод POST.
- **Success URL** = `https://allvision-pulse.ru/api/payments/robokassa/success`, метод GET.
- **Fail URL** = `https://allvision-pulse.ru/api/payments/robokassa/fail`, метод GET.
- **Алгоритм хеширования Result URL** = тот же, что в `ROBOKASSA_HASH_ALGORITHM`
  (по умолчанию MD5).
- **Подпись Result URL** считается с **Пароль#2** (это `ROBOKASSA_PASSWORD2`).
- **Подпись Success URL** считается с **Пароль#1** (это `ROBOKASSA_PASSWORD1`).

В `/opt/allvision-studio/shared/.env` на ВМ:

```
PAYMENT_PROVIDER=robokassa
ROBOKASSA_MERCHANT_LOGIN=...
ROBOKASSA_PASSWORD1=...
ROBOKASSA_PASSWORD2=...
ROBOKASSA_HASH_ALGORITHM=md5
ROBOKASSA_TEST_MODE=0
PUBLIC_API_URL=https://allvision-pulse.ru
PUBLIC_WEB_URL=https://allvision-pulse.ru
```

## Логи

Все ключевые операции теперь логируются с префиксом `[payments]` и `[robokassa]`:

```bash
ssh deploy@158.160.209.107
docker compose -f /opt/allvision-studio/current/infra/prod/docker-compose.prod.yml logs --tail=300 api | grep -E "payments|robokassa"
```

Что искать:

- `[robokassa] verifyWebhook payload keys=...` — webhook реально пришёл.
- `[robokassa] webhook signature mismatch ... received=XXX expected=YYY` — несовпадение подписи (проверьте Пароль#2, алгоритм).
- `[robokassa] OpStateExt invId=... state.code=N` — что Робокасса возвращает на наш запрос статуса.
- `[payments] reconcile applying event ... providerStatus=...` — poller сработал.
- `[payments] applyPaymentEvent: credited tokens ... tokens=...` — токены зачислены.

## Самая частая причина «pending после оплаты»

1. **Result URL не сконфигурирован в ЛК Робокассы** — webhook не приходит, статус
   восстанавливается только через polling OpStateExt (обычно за минуты).
2. **Пароль#2 в админке Robokassa отличается от `ROBOKASSA_PASSWORD2`** —
   webhook приходит, но подпись не совпадает → 401, платёж остаётся pending.
   Найдёте в логах `webhook signature mismatch`.
3. **Алгоритм хеширования** в Robokassa отличается от `ROBOKASSA_HASH_ALGORITHM`
   (обычно MD5 у нас, а в Робокассе кто-то выставил SHA-256 или наоборот).
4. **Контейнеры не пересобраны** после фикса в коде — старый процесс крутится
   со старой логикой. Решение выше («Прямой перезапуск контейнеров»).
