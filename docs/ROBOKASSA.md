# Подключение Робокассы

## URL для кабинета Робокассы

Использовать после готовности DNS и HTTPS на боевом домене:

- ResultURL: `https://allvision-pulse.ru/api/payments/robokassa/result`
- Метод ResultURL: `POST`
- SuccessURL: `https://allvision-pulse.ru/api/payments/robokassa/success`
- Метод SuccessURL: `GET`
- FailURL: `https://allvision-pulse.ru/api/payments/robokassa/fail`
- Метод FailURL: `GET`

API отвечает на ResultURL строкой `OK{InvId}` после проверки подписи. Только после этого токены начисляются на баланс или заказ переводится в оплаченный статус.

## Переменные окружения

```env
PAYMENT_PROVIDER="robokassa"
PUBLIC_API_URL="https://allvision-pulse.ru"
PUBLIC_WEB_URL="https://allvision-pulse.ru"
NEXT_PUBLIC_API_URL="https://allvision-pulse.ru"

ROBOKASSA_MERCHANT_LOGIN=""
ROBOKASSA_PASSWORD1=""
ROBOKASSA_PASSWORD2=""
ROBOKASSA_HASH_ALGORITHM="md5"
ROBOKASSA_TEST_MODE="0"
ROBOKASSA_RECEIPT_ENABLED="true"
ROBOKASSA_RECEIPT_PAYMENT_METHOD="full_prepayment"
ROBOKASSA_RECEIPT_PAYMENT_OBJECT="service"
ROBOKASSA_RECEIPT_TAX="none"
```

`ROBOKASSA_HASH_ALGORITHM` должен совпадать с алгоритмом, выбранным в настройках магазина Робокассы.

## Фискализация и самозанятый

Для самозанятого нужно включить в кабинете Робокассы автоматические чеки для самозанятых и связать сервис с приложением «Мой налог». Провайдер платежей отправляет данные позиции: название услуги, сумму, количество, признак способа расчёта, признак предмета расчёта и `tax: none`.

Если поддержка Робокассы порекомендует другие признаки для покупки токенов, поменять:

- `ROBOKASSA_RECEIPT_PAYMENT_METHOD`
- `ROBOKASSA_RECEIPT_PAYMENT_OBJECT`

## Публичные страницы для модерации

Перед модерацией должны открываться:

- `https://allvision-pulse.ru/offer`
- `https://allvision-pulse.ru/terms`
- `https://allvision-pulse.ru/privacy`
- `https://allvision-pulse.ru/pd-consent`
- `https://allvision-pulse.ru/contacts`
- `https://allvision-pulse.ru/pricing`

В подвале сайта и на странице контактов указаны реквизиты:

- Громов Иван Олегович
- Самозанятый, НПД
- ИНН 380508498201
- Московская область
- `+7 924 990-33-57`
- `allvision_ai@internet.ru`
