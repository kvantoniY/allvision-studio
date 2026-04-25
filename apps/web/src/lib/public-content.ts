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
    title: 'Семейный портрет',
    before: 'https://picsum.photos/seed/example-restore-before/800/600',
    after: 'https://picsum.photos/seed/example-restore-after/800/600',
    service: 'Реставрация фото',
  },
  {
    title: 'Живой портрет',
    before: 'https://picsum.photos/seed/example-animate-before/800/600',
    after: 'https://picsum.photos/seed/example-animate-after/800/600',
    service: 'Оживление фото',
  },
  {
    title: 'Танцевальный тренд',
    before: 'https://picsum.photos/seed/example-trend-before/800/600',
    after: 'https://picsum.photos/seed/example-trend-after/800/600',
    service: 'Трендовое видео',
  },
  {
    title: 'Мульт-приключение',
    before: 'https://picsum.photos/seed/example-cartoon-before/800/600',
    after: 'https://picsum.photos/seed/example-cartoon-after/800/600',
    service: 'Мультфильм на заказ',
  },
  {
    title: 'Реклама продукта',
    before: 'https://picsum.photos/seed/example-realistic-before/800/600',
    after: 'https://picsum.photos/seed/example-realistic-after/800/600',
    service: 'Реалистичное видео',
  },
  {
    title: 'Сказка про смелость',
    before: 'https://picsum.photos/seed/example-fairytale-before/800/600',
    after: 'https://picsum.photos/seed/example-fairytale-after/800/600',
    service: 'Сказка для ребёнка',
  },
  {
    title: 'Фото к памятной дате',
    before: 'https://picsum.photos/seed/example-archive-before/800/600',
    after: 'https://picsum.photos/seed/example-archive-after/800/600',
    service: 'Реставрация фото',
  },
  {
    title: 'Футуристичный образ',
    before: 'https://picsum.photos/seed/example-future-before/800/600',
    after: 'https://picsum.photos/seed/example-future-after/800/600',
    service: 'Трендовое видео',
  },
];

export const testimonials = [
  {
    name: 'Анна',
    city: 'Москва',
    initials: 'А',
    service: 'Оживление фото',
    text: 'Нашла в коробке фото бабушки 1967 года. Ожидала просто улучшение качества, а получила ощущение что бабушка снова рядом. Мама не могла сдержать слёз.',
  },
  {
    name: 'Дмитрий',
    city: 'Санкт-Петербург',
    initials: 'Д',
    service: 'Сказка для ребёнка',
    text: 'Делал сказку для сына на 5-летие. Ввёл имя, выбрал тему про смелость. Сценарий получился лучше чем в магазинных сказках. Матвей теперь каждый вечер её пересматривает.',
  },
  {
    name: 'Екатерина',
    city: 'Новосибирск',
    initials: 'Е',
    service: 'Трендовое видео',
    text: 'Попробовала тренд с танцем ради интереса. Подруги спрашивают как я так быстро научилась танцевать. Забавно им признаваться.',
  },
  {
    name: 'Александр',
    city: 'Краснодар',
    initials: 'А',
    service: 'Улучшение старых фото',
    text: 'Реставрировал 14 фото деда-ветерана к 9 мая. Качество превзошло ожидания. Использую для семейного альбома.',
  },
  {
    name: 'Мария',
    city: 'Екатеринбург',
    initials: 'М',
    service: 'Мультфильм на заказ',
    text: 'Заказала мультик про приключения моего кота для 6-летнего племянника. Реакция была бесценна. Стоило своих денег.',
  },
  {
    name: 'Павел',
    city: 'Казань',
    initials: 'П',
    service: 'Реалистичное видео',
    text: 'Пробовал делать рекламу сам на фрилансе за 50к. Здесь за 8к получил видео лучшего качества и быстрее. Теперь постоянный клиент.',
  },
];

export const landingFaqs = [
  {
    question: 'Как долго делается одна обработка?',
    answer:
      'Автоматические услуги обычно занимают несколько минут после загрузки фото и списания токенов. Ручные заказы требуют согласования: срок зависит от длительности, количества сцен и правок, но мы всегда называем ориентир до оплаты.',
  },
  {
    question: 'Что если мне не понравится результат?',
    answer:
      'Для автоматических генераций мы честно показываем, что результат зависит от качества исходного фото. Если произошёл технический сбой или файл явно не был обработан, поддержка проверит задачу и вернёт токены. Для заказных роликов условия правок согласуются до старта работы.',
  },
  {
    question: 'Безопасны ли мои фото? Кто их видит?',
    answer:
      'Ваши фото хранятся в защищённом хранилище с шифрованием. Они используются только для создания вашего результата и автоматически удаляются через 30 дней. Мы не передаём их третьим лицам и не используем для обучения моделей.',
  },
  {
    question: 'Можно ли использовать результаты в коммерческих целях?',
    answer:
      'Да, если вы загрузили законные материалы и не нарушаете права третьих лиц. Для рекламы, брендов и публичных публикаций важно не выдавать AI-контент за реальные события, если это может вводить людей в заблуждение.',
  },
  {
    question: 'Что такое токены и как они работают?',
    answer:
      'Токены — внутренняя единица оплаты автоматических действий. В MVP 1 токен примерно равен 1 ₽: улучшение фото стоит 20 токенов, оживление фото — 80 токенов, тренд — 150 токенов. Пакеты токенов покупаются заранее и списываются только при запуске обработки.',
  },
  {
    question: 'Чем мультфильм на заказ отличается от трендового видео?',
    answer:
      'Трендовое видео — быстрый шаблонный формат: вы выбираете готовую сцену и загружаете фото. Мультфильм на заказ создаётся под вашу идею: сценарий, персонажи, стиль и монтаж обсуждаются отдельно, поэтому результат получается более персональным.',
  },
  {
    question: 'Как связаться с поддержкой?',
    answer:
      'Напишите в Telegram @allvision_support или на hello@allvision.studio. Мы отвечаем ежедневно с 9:00 до 22:00 по Москве и стараемся закрывать простые вопросы в течение суток.',
  },
  {
    question: 'Делаете ли вы возвраты?',
    answer:
      'Если услуга не была оказана из-за технической ошибки, мы возвращаем токены или деньги по согласованию. Если результат уже создан корректно по исходным данным, возврат зависит от ситуации и условий конкретной услуги.',
  },
];

export const pricingFaqs = [
  {
    question: 'Сгорают ли токены?',
    answer:
      'Для MVP токены не сгорают, пока аккаунт активен. Если правила изменятся, мы заранее предупредим пользователей и обновим документы.',
  },
  {
    question: 'Можно ли вернуть деньги за пакет?',
    answer:
      'Если токены не использовались, возврат возможен по обращению в поддержку. Если часть пакета уже потрачена, мы рассматриваем ситуацию индивидуально и возвращаем неиспользованную часть, когда это технически и юридически возможно.',
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
    question: 'Можно ли оплатить заказное видео токенами?',
    answer:
      'Автоматические услуги оплачиваются токенами. Ручные и гибридные заказы могут включать отдельную оплату в рублях, потому что их цена зависит от длительности и сложности.',
  },
];

export function getServicePriceLabel(service: PublicService) {
  if (service.slug === 'cartoon-custom') return 'от 3000 ₽/мин';
  if (service.slug === 'realistic-custom') return 'от 6000 ₽/мин';
  if (service.slug === 'fairy-tale') return 'сценарий 5 токенов, видео от 4990 ₽';
  return `${service.priceTokens} токенов ≈ ${service.priceTokens} ₽`;
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
  if (tokens <= 100) return '5 улучшений фото ИЛИ 1 анимация + запас';
  if (tokens <= 500) return '25 улучшений ИЛИ 6 анимаций ИЛИ 3 тренда';
  if (tokens <= 1000) return '50 улучшений ИЛИ 12 анимаций ИЛИ 6 трендов';
  return '150 улучшений ИЛИ 37 анимаций ИЛИ 20 трендов';
}
