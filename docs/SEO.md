# SEO — настройка и продвижение allvision-pulse.ru

## Что уже сделано в коде (фазы 1–3)

**Технический фундамент:**
- Единый домен `https://allvision-pulse.ru` через `apps/web/src/lib/seo.ts` (`SITE_URL`). Раньше в коде был зашит чужой `allvision.studio` — это ломало canonical/OG/sitemap.
- `robots.txt` (`apps/web/src/app/robots.ts`): открыта витрина, закрыты `/dashboard /admin /ai /studio /profile /api /mock-payment` и auth-страницы, указан sitemap.
- `sitemap.xml` (`apps/web/src/app/sitemap.ts`): тянет **реальные услуги из БД** (`/api/services`), тренды и сценарии, а не статический список.
- Canonical на всех публичных страницах (`pageMetadata`).
- Страницы услуг `services/[slug]`: настоящие title/description/OG/canonical из данных услуги (раньше был сырой slug «Услуга single-photo-2017»).

**Контент/мета:** ключевые title/description под интент рунета на главной, услугах, ценах, трендах, сценариях, о проекте, контактах.

**Структурированные данные (JSON-LD):** Organization + WebSite(SearchAction) + FAQPage на главной; Service+Offer и BreadcrumbList на страницах услуг.

## Что нужно сделать руками (вебмастеры и аналитика)

### 1. Яндекс.Вебмастер (приоритет №1 для рунета)
1. Зайти на https://webmaster.yandex.ru → «Добавить сайт» → `https://allvision-pulse.ru`.
2. **Подтвердить права. Рекомендуемый способ — DNS TXT (без пересборки сайта):**
   - Яндекс покажет запись вида `yandex-verification: xxxxxxxx`.
   - В панели Рег.ру (DNS домена) добавить TXT-запись для `@` со значением, которое даёт Яндекс.
   - Альтернатива без DNS: HTML-файл — положить выданный `yandex_xxxx.html` в `apps/web/public/`, закоммитить, дождаться деплоя; файл откроется на `/yandex_xxxx.html`.
   - Альтернатива через мета-тег: задать `NEXT_PUBLIC_YANDEX_VERIFICATION` (см. ниже) и пересобрать web.
3. После подтверждения: «Индексирование → Файлы Sitemap» → добавить `https://allvision-pulse.ru/sitemap.xml`.
4. «Настройка региона» → указать регион (для гео-ранжирования).
5. Подключить Яндекс.Бизнес (карточка организации) — усиливает доверие и гео.

### 2. Google Search Console
1. https://search.google.com/search-console → добавить ресурс.
2. Тип «Домен» (DNS TXT, рекомендуется) или «Ресурс с префиксом URL» (`https://allvision-pulse.ru`).
3. Подтвердить (DNS TXT в Рег.ру, или мета-тег `NEXT_PUBLIC_GOOGLE_VERIFICATION`, или HTML-файл в `apps/web/public/`).
4. «Файлы Sitemap» → добавить `https://allvision-pulse.ru/sitemap.xml`.

### 3. Аналитика
- **Яндекс.Метрика** (обязательно для РФ): создать счётчик, включить Вебвизор. Счётчик подключим в коде, когда дашь номер.
- **Google Analytics 4** (опционально): создать ресурс, дать measurement ID.

## Мета-тег верификации через env (если выберешь этот способ)

`NEXT_PUBLIC_*` инлайнятся при **сборке** web, поэтому это build-арг, а не рантайм-переменная.
1. В `/opt/allvision-studio/shared/.env` (или secrets деплоя) задать:
   ```
   NEXT_PUBLIC_YANDEX_VERIFICATION=<код из Яндекс.Вебмастера>
   NEXT_PUBLIC_GOOGLE_VERIFICATION=<код из Google Search Console>
   ```
2. Пересобрать и задеплоить web (обычный деплой через CI пересоберёт образ с этими build-args).
3. В `<head>` появятся `<meta name="yandex-verification">` и `<meta name="google-site-verification">`.

> Проще и быстрее — DNS TXT в Рег.ру: не требует пересборки и работает для обоих поисковиков.

## Дальше (фазы 4–5, по желанию)
- Заменить picsum-плейсхолдеры превью услуг на реальные брендовые ассеты (качество сниппетов + Core Web Vitals).
- Контент под long-tail: отдельные посадочные/блог под запросы («оживить фото бабушки», «я в фильме как сделать» и т.п.).
- Отслеживание позиций в Вебмастере/Search Console, работа с поведенческими (Метрика).

## Подключение Яндекс.Метрики и GA через env (код уже готов)

В коде есть `Analytics` (`apps/web/src/components/analytics/Analytics.tsx`), подключённый в layout. Счётчики появляются автоматически, когда заданы build-args при сборке web:
- `NEXT_PUBLIC_YANDEX_METRICA_ID` — номер счётчика Яндекс.Метрики (Вебвизор включён).
- `NEXT_PUBLIC_GA_ID` — Measurement ID Google Analytics 4 (`G-XXXX`), опционально.

Достаточно прислать номер счётчика — он прописывается в `shared/.env` / secrets деплоя, web пересобирается обычным деплоем.
