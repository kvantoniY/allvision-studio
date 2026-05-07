import type { PublicService, PublicTokenPackage } from '@allvision/shared';

export const serviceLinks = [
  { href: '/services/photo-restore', label: 'Улучшение старых фото' },
  { href: '/services/photo-animate', label: 'Оживление фото' },
  { href: '/services/trends', label: 'Трендовые видео' },
  { href: '/services/cartoon-custom', label: 'Мультфильм на заказ' },
  { href: '/services/realistic-custom', label: 'Реалистичное видео' },
  { href: '/services/fairy-tale', label: 'Сказка для ребёнка' },
];

export const legalNotice = '⚠️ Внимание: это базовый шаблон для MVP. Перед реальным запуском — обязательно проверить с юристом. Версия от 24.04.2026.';

export const trendTags = ['dance', 'viral', 'meme', 'fun', 'music', 'performance', 'action', 'marvel-style', 'wedding', 'celebration', 'futuristic', 'sci-fi', 'elegant', 'cute'];

export const examples = [
  {
    title: 'Свадебное фото ожило',
    before: 'https://picsum.photos/seed/gift-wedding-before/800/600',
    after: 'https://picsum.photos/seed/gift-wedding-after/800/600',
    service: 'Ностальгия',
  },
  {
    title: 'Дедушка улыбается из архива',
    before: 'https://picsum.photos/seed/gift-grandpa-before/800/600',
    after: 'https://picsum.photos/seed/gift-grandpa-after/800/600',
    service: 'Оживить старое фото',
  },
  {
    title: 'Подруга в трендовом ролике',
    before: 'https://picsum.photos/seed/gift-trend-before/800/600',
    after: 'https://picsum.photos/seed/gift-trend-after/800/600',
    service: 'Тренды и мемы',
  },
  {
    title: 'Ребёнок в своём мультике',
    before: 'https://picsum.photos/seed/gift-cartoon-before/800/600',
    after: 'https://picsum.photos/seed/gift-cartoon-after/800/600',
    service: 'Дети-герои',
  },
  {
    title: 'Юбилейная видео-открытка',
    before: 'https://picsum.photos/seed/gift-anniversary-before/800/600',
    after: 'https://picsum.photos/seed/gift-anniversary-after/800/600',
    service: 'Особые поводы',
  },
  {
    title: 'Корпоративное поздравление',
    before: 'https://picsum.photos/seed/gift-corporate-before/800/600',
    after: 'https://picsum.photos/seed/gift-corporate-after/800/600',
    service: 'Особые поводы',
  },
  {
    title: 'Семейный архив для мамы',
    before: 'https://picsum.photos/seed/gift-archive-before/800/600',
    after: 'https://picsum.photos/seed/gift-archive-after/800/600',
    service: 'Ностальгия',
  },
  {
    title: 'Киносцена для семейного чата',
    before: 'https://picsum.photos/seed/gift-cinema-before/800/600',
    after: 'https://picsum.photos/seed/gift-cinema-after/800/600',
    service: 'Тренды и мемы',
  },
];

export const testimonials = [
  {
    name: 'Анна',
    city: 'Москва',
    initials: 'А',
    service: 'Оживить старое фото',
    text: 'Сделала подарок маме на день рождения: оживила свадебное фото бабушки. Мама пересматривала ролик весь вечер и сразу отправила его всем родственникам.',
  },
  {
    name: 'Дмитрий',
    city: 'Санкт-Петербург',
    initials: 'Д',
    service: 'Ребёнок-герой мультика',
    text: 'Сын увидел себя главным героем и сначала замолчал, а потом попросил включить ещё три раза. Для детского праздника это был лучший сюрприз.',
  },
  {
    name: 'Екатерина',
    city: 'Новосибирск',
    initials: 'Е',
    service: 'Я в трендовом видео',
    text: 'Отправила подруге её лицо в мемной сцене вместо обычной открытки. Она смеялась так, что переслала ролик в наш общий чат до полуночи.',
  },
  {
    name: 'Александр',
    city: 'Краснодар',
    initials: 'А',
    service: 'Юбилейная видео-открытка',
    text: 'На юбилее включили видео на экране, и гости реально аплодировали. Получилось личнее, чем стандартная презентация с фотографиями.',
  },
];

export const landingFaqs = [
  {
    question: 'Что такое коины?',
    answer:
      'Коины — внутренняя единица оплаты готовых подарков. В MVP 1 коин примерно равен 1 ₽: цена видна на странице услуги до запуска.',
  },
  {
    question: 'Чем Standard отличается от Pro?',
    answer:
      'Standard — качественный результат для личного подарка. Pro использует более дорогой сценарий обработки и нужен, когда хочется максимальный wow-эффект.',
  },
  {
    question: 'Как долго ждать результат?',
    answer:
      'Готовые автоматические подарки обычно занимают 2–5 минут. Можно оставить страницу открытой или вернуться в проект позже из кабинета.',
  },
  {
    question: 'Что делать, если результат не понравился?',
    answer:
      'Регенерация появится отдельным flow после MVP. Если произошёл технический сбой или файл не был обработан, проект отмечается ошибкой, а коины возвращаются.',
  },
  {
    question: 'Безопасны ли мои фото?',
    answer:
      'Фото используются для создания вашего результата и доступны только в вашем аккаунте. Для реального запуска будут добавлены финальные правила хранения и удаления файлов.',
  },
  {
    question: 'Можно ли отправить результат получателю?',
    answer:
      'Да. После генерации результат можно скачать и отправить любым удобным способом. Отдельная публичная ссылка с настройками приватности появится позже.',
  },
  {
    question: 'Можно ли сделать подарок на заказ?',
    answer:
      'Да, заказные форматы остаются в продуктовой модели. В MVP на главной показываем готовые решения, а полноценный data-driven flow заказов оживёт на следующем этапе.',
  },
];

export const pricingFaqs = [
  {
    question: 'Сгорают ли коины?',
    answer:
      'Для MVP коины не сгорают, пока аккаунт активен. Если правила изменятся, мы заранее предупредим пользователей и обновим документы.',
  },
  {
    question: 'Можно ли вернуть деньги за пакет?',
    answer:
      'Если коины не использовались, возврат возможен по обращению в поддержку. Если часть пакета уже потрачена, мы рассматриваем ситуацию индивидуально и возвращаем неиспользованную часть, когда это технически и юридически возможно.',
  },
  {
    question: 'Как платить?',
    answer:
      'На текущем этапе платежи работают через mock-провайдер. В боевом запуске будет подключена ЮKassa с оплатой банковской картой и привычным подтверждением платежа.',
  },
  {
    question: 'Безопасно ли оплачивать?',
    answer:
      'После подключения боевого платежного провайдера данные карты будут вводиться на стороне сертифицированного платежного сервиса. Allvision Studio не будет хранить номера карт и CVV.',
  },
  {
    question: 'Можно ли оплатить заказное видео коинами?',
    answer:
      'Автоматические услуги оплачиваются коинами. Ручные и гибридные заказы могут включать отдельную оплату в рублях, потому что их цена зависит от длительности и сложности.',
  },
];

export function getServicePriceLabel(service: PublicService) {
  if (service.slug === 'cartoon-custom') return 'от 3000 ₽/мин';
  if (service.slug === 'realistic-custom') return 'от 6000 ₽/мин';
  if (service.slug === 'fairy-tale') return 'сценарий 5 коинов, видео от 4990 ₽';
  return `${service.priceTokens} коинов ≈ ${service.priceTokens} ₽`;
}

export function getServiceBadgeLabel(service: PublicService) {
  if (service.processingType === 'AUTO') return 'Автогенерация';
  if (service.processingType === 'HYBRID') return 'AI + автор';
  return 'На заказ';
}

export function getServiceStatusLabel(service: PublicService) {
  if (service.processingType === 'AUTO') return '⚡ Доступно сейчас';
  if (service.processingType === 'HYBRID') return '✨ AI + автор';
  return '📝 По заявке';
}

export function getServiceActionLabel(service: PublicService) {
  if (service.processingType === 'MANUAL') return 'Оставить заявку (требуется вход)';
  return 'Создать (требуется вход)';
}

export function getPackageTotal(pkg: PublicTokenPackage) {
  return pkg.tokens + pkg.bonus;
}

export function getPackageUsage(tokens: number) {
  if (tokens <= 100) return 'стартовый запас для тестов и будущих мини-подарков';
  if (tokens <= 500) return '1–2 готовых подарка Standard в зависимости от выбранной услуги';
  if (tokens <= 1000) return '2–4 подарка Standard или один Pro-сценарий с запасом';
  return 'серия семейных подарков, открыток и трендовых роликов';
}
