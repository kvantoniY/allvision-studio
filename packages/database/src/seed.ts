import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma, ProcessingType, ServiceCategory } from './index';

const BCRYPT_COST = 12;

const publicSettingKeys = [
  'fairy_tale_themes',
  'support_telegram',
  'support_email',
  'company_name',
  'fairy_tale_tier_basic_price',
  'fairy_tale_tier_extended_price',
  'cartoon_base_rate_per_minute',
  'realistic_base_rate_per_minute',
];

function image(seed: string, width = 800, height = 600) {
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

function verticalImage(seed: string) {
  return image(seed, 600, 1067);
}

function staticAsset(key: string) {
  const baseUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:4000';
  return `${baseUrl.replace(/\/+$/, '')}/static/${key.replace(/^\/+/, '')}`;
}

const services = [
  {
    slug: 'photo-restore',
    title: 'Улучшение старых фото',
    shortDesc:
      'Возвращаем четкость, цвет и детали снимкам из семейного архива. Подходит для старых бумажных фото, сканов и цифровых кадров низкого качества.',
    description: [
      'Старые фотографии редко стареют аккуратно: бумага желтеет, появляются заломы, шум, потеря резкости и выцветшие лица. Allvision Studio аккуратно улучшает такие снимки с помощью AI: восстанавливает детали, снижает шум, выравнивает свет и помогает вернуть изображению живой, бережный вид.',
      'Услуга особенно полезна для семейных архивов, памятных дат, подарков родителям и подготовки фотоальбомов. Вы загружаете изображение, система анализирует его качество и подбирает мягкую обработку без ощущения пластика или неестественной ретуши.',
      'Мы не обещаем невозможного, если исходник сильно поврежден, но почти всегда можно сделать фото заметно чище и приятнее для просмотра. Результат доступен для скачивания после обработки, а исходник используется только для создания вашего файла.',
      'Для MVP обработка работает через mock-провайдер, но интерфейс и бизнес-логика уже подготовлены под реальный AI-пайплайн следующего этапа.',
    ].join('\n\n'),
    category: ServiceCategory.PHOTO_RESTORE,
    priceTokens: 20,
    costUsd: 0.05,
    coverImage: image('allvision-photo-restore'),
    galleryImages: [
      image('restore-1'),
      image('restore-2'),
      image('restore-3'),
      image('restore-4'),
    ],
    processingType: ProcessingType.AUTO,
    aiProvider: 'mock',
    aiModel: 'mock-photo-restore',
    aiConfig: {},
    sortOrder: 10,
  },
  {
    slug: 'photo-animate',
    title: 'Оживление фото',
    shortDesc:
      'Превращаем портрет в короткое живое видео: мягкая улыбка, взгляд, движение головы и эффект присутствия.',
    description: [
      'Оживление фото помогает увидеть знакомый портрет иначе: не как статичный снимок, а как короткий эмоциональный момент. AI добавляет деликатное движение, сохраняет основные черты лица и создает видео, которым хочется поделиться с семьей.',
      'Услуга подходит для портретов родственников, памятных снимков, аватаров, поздравлений и теплых семейных роликов. Лучше всего работают фотографии, где лицо видно прямо или немного в профиль, без сильных перекрытий и размытия.',
      'Мы выбираем осторожную анимацию, чтобы результат не выглядел карикатурно. В MVP используется mock-генерация, а публичная страница уже описывает финальный пользовательский сценарий: загрузка фото, списание токенов, скачивание видео.',
      'Если вы хотите более сложную сцену с сюжетом, персонажами и монтажом, лучше выбрать мультфильм или реалистичное видео на заказ.',
    ].join('\n\n'),
    category: ServiceCategory.PHOTO_ANIMATE,
    priceTokens: 80,
    costUsd: 0.16,
    coverImage: image('allvision-photo-animate'),
    galleryImages: [
      image('animate-1'),
      image('animate-2'),
      image('animate-3'),
      image('animate-4'),
    ],
    processingType: ProcessingType.AUTO,
    aiProvider: 'mock',
    aiModel: 'mock-photo-animate',
    aiConfig: {},
    sortOrder: 20,
  },
  {
    slug: 'trends',
    title: 'Трендовые видео с вашим фото',
    shortDesc:
      'Загрузите фото и окажитесь в популярном вертикальном ролике: танец, мем, геройская сцена или праздничный формат.',
    description: [
      'Трендовые видео созданы для быстрых, ярких и понятных результатов. Вы выбираете формат из каталога, загружаете свое фото, а AI собирает короткий вертикальный ролик в стиле популярных соцсетей.',
      'Это хороший вариант для сторис, поздравлений, шуток в семейном чате, личного бренда и легкого развлекательного контента. В каталоге есть танцы, мемы, свадебные форматы, футуристичные сцены и аккуратные милые ролики.',
      'Каждый тренд имеет фиксированную стоимость в токенах, описание сцены и теги для быстрого поиска. После запуска настоящего AI-провайдера тренды можно будет обновлять регулярно, не меняя основной интерфейс.',
      'Мы просим использовать сервис этично: не выдавать сгенерированные ролики за реальные события, не создавать вводящий в заблуждение контент и не использовать чужие фото без согласия.',
    ].join('\n\n'),
    category: ServiceCategory.TREND,
    priceTokens: 150,
    costUsd: 0.3,
    coverImage: image('allvision-trends'),
    galleryImages: [
      image('trends-1'),
      image('trends-2'),
      image('trends-3'),
      image('trends-4'),
      image('trends-5'),
    ],
    processingType: ProcessingType.AUTO,
    aiProvider: 'mock',
    aiModel: 'mock-trend',
    aiConfig: {},
    sortOrder: 30,
  },
  {
    slug: 'cartoon-custom',
    title: 'Мультфильм на заказ',
    shortDesc:
      'Создаем персональный мультфильм по вашей идее: персонажи, сюжет, стиль, музыка и финальный ролик под событие.',
    description: [
      'Мультфильм на заказ нужен, когда шаблонного тренда уже недостаточно. Вы описываете идею, героев, настроение и повод, а команда Allvision Studio помогает превратить это в короткий персональный ролик.',
      'Такой формат хорошо подходит для детских праздников, подарков, семейных историй, поздравлений, рекламы небольшого бизнеса и необычных презентаций. Мы можем работать с фотографиями, описанием персонажей, референсами стиля и пожеланиями по сценам.',
      'Процесс ручной: после заявки администратор уточняет детали, оценивает длительность и сложность, согласует стоимость и сроки. Базовая ставка начинается от 3000 ₽ за минуту, а итоговая цена зависит от количества сцен, персонажей и правок.',
      'На текущем этапе форма заявки еще не активна, но страница заранее описывает услугу и помогает пользователю выбрать правильный формат.',
    ].join('\n\n'),
    category: ServiceCategory.CARTOON_CUSTOM,
    priceTokens: 3000,
    costUsd: 0,
    coverImage: image('allvision-cartoon'),
    galleryImages: [
      image('cartoon-1'),
      image('cartoon-2'),
      image('cartoon-3'),
      image('cartoon-4'),
    ],
    processingType: ProcessingType.MANUAL,
    aiProvider: null,
    aiModel: null,
    aiConfig: {},
    sortOrder: 40,
  },
  {
    slug: 'realistic-custom',
    title: 'Реалистичное видео на заказ',
    shortDesc:
      'Персональные ролики в реалистичном стиле для рекламы, поздравлений, презентаций и творческих проектов.',
    description: [
      'Реалистичное видео на заказ помогает получить ролик, который выглядит дороже и серьезнее шаблонной генерации. Мы собираем сцену под задачу: продукт, человек, событие, история бренда или эмоциональное поздравление.',
      'Формат подходит для предпринимателей, экспертов, локального бизнеса, мероприятий и личных проектов, где важны визуальная убедительность и аккуратная подача. Можно использовать текстовый сценарий, фотографии, референсы, брендовые цвета и пожелания по кадрам.',
      'Работа идет через согласование: вы описываете задачу, администратор уточняет детали, рассчитывает стоимость и сроки, после оплаты начинается производство. Базовая ставка начинается от 6000 ₽ за минуту и зависит от сложности сцен, монтажа и количества итераций.',
      'Мы не делаем обманные дипфейки, политическую рекламу без маркировки, имитацию реальных заявлений людей и другой контент, который может вводить зрителей в заблуждение.',
    ].join('\n\n'),
    category: ServiceCategory.REALISTIC_CUSTOM,
    priceTokens: 6000,
    costUsd: 0,
    coverImage: image('allvision-realistic'),
    galleryImages: [
      image('realistic-1'),
      image('realistic-2'),
      image('realistic-3'),
      image('realistic-4'),
    ],
    processingType: ProcessingType.MANUAL,
    aiProvider: null,
    aiModel: null,
    aiConfig: {},
    sortOrder: 50,
  },
  {
    slug: 'fairy-tale',
    title: 'Сказка для вашего ребёнка',
    shortDesc:
      'Персональная сказка с именем ребенка, выбранной темой и мягким воспитательным смыслом. Сценарий генерируется AI, видео создается вручную.',
    description: [
      'Персональная сказка делает ребенка главным героем истории. Вы указываете имя, возраст, тему и несколько деталей, а AI помогает подготовить теплый сценарий с понятной моралью и добрым финалом.',
      'После сценария можно заказать видеоверсию: персонажи, иллюстрации, озвучка и монтаж собираются вручную, чтобы история выглядела не как безликий шаблон, а как подарок именно вашему ребенку. Поэтому услуга имеет гибридный формат: быстрый AI-сценарий и дальнейшая ручная работа.',
      'Сценарий стоит 5 токенов, а видеосказка начинается от 4990 ₽. Расширенный формат с большим количеством сцен, более длинной историей и дополнительными деталями оценивается отдельно.',
      'На старте мы предлагаем несколько проверенных тем: дружба, смелость, помощь родителям, страх темноты и умение делиться. Позже каталог тем можно будет расширять через настройки.',
    ].join('\n\n'),
    category: ServiceCategory.FAIRY_TALE,
    priceTokens: 5,
    costUsd: 0.02,
    coverImage: image('allvision-fairytale'),
    galleryImages: [
      image('fairytale-1'),
      image('fairytale-2'),
      image('fairytale-3'),
      image('fairytale-4'),
      image('fairytale-5'),
    ],
    processingType: ProcessingType.HYBRID,
    aiProvider: 'mock',
    aiModel: 'mock-fairy-tale-script',
    aiConfig: {},
    sortOrder: 60,
  },
];

const trendSeed = [
  {
    title: 'Виральный танец "Jump Shot"',
    description: 'Динамичный вертикальный ролик, где герой делает резкий jump cut и попадает в энергичный танцевальный момент.',
    tags: ['dance', 'viral'],
    prompt: 'Герой из загруженного фото исполняет быстрый виральный танец в яркой студии, камера повторяет движения, формат 9:16.',
  },
  {
    title: 'Трендовый мем "Я королева/король"',
    description: 'Ироничный мем-ролик с уверенной походкой, сияющим светом и финальным царственным жестом.',
    tags: ['meme', 'fun'],
    prompt: 'Герой уверенно входит в кадр как королева или король вечеринки, вокруг световые вспышки и комичный пафос.',
  },
  {
    title: 'Крик рок-звезды',
    description: 'Сцена выступления на большой сцене: прожекторы, микрофон, энергия концерта и эффект рок-звезды.',
    tags: ['music', 'performance'],
    prompt: 'Герой стоит на рок-сцене с микрофоном, делает эмоциональный вокальный жест, вокруг прожекторы и дым.',
  },
  {
    title: 'Прыжок супергероя',
    description: 'Кинематографичный прыжок в супергеройском стиле с эффектным приземлением и драматичным светом.',
    tags: ['action', 'marvel-style'],
    prompt: 'Герой совершает супергеройский прыжок над городом и приземляется в эффектной позе, кинематографичный свет.',
  },
  {
    title: 'Танец невесты/жениха',
    description: 'Праздничный свадебный ролик с танцем, мягким светом и атмосферой торжества.',
    tags: ['wedding', 'celebration'],
    prompt: 'Герой в свадебном образе танцует в праздничном зале, мягкие огни, радостная атмосфера, вертикальный формат.',
  },
  {
    title: '"Почувствуй себя в 2050"',
    description: 'Футуристичная сцена с неоновым городом, голограммами и образом из будущего.',
    tags: ['futuristic', 'sci-fi'],
    prompt: 'Герой стоит в неоновом городе 2050 года, вокруг голограммы, отражения, футуристичная одежда и плавное движение камеры.',
  },
  {
    title: 'Классический вальс',
    description: 'Элегантный ролик с плавным вальсом, вечерним залом и спокойной кинематографичной подачей.',
    tags: ['elegant', 'dance'],
    prompt: 'Герой исполняет классический вальс в красивом зале, теплый свет, плавная камера, утонченная атмосфера.',
  },
  {
    title: 'Воздушный поцелуй',
    description: 'Милый короткий ролик для сторис: улыбка, воздушный поцелуй и легкая вирусная подача.',
    tags: ['cute', 'viral'],
    prompt: 'Герой улыбается в камеру и отправляет воздушный поцелуй, мягкий фон, легкий вирусный стиль, формат 9:16.',
  },
];

const scenarioTemplates = [
  {
    slug: 'papa-superhero',
    title: 'Папа-супергерой',
    shortDesc: 'Короткий геройский эпизод, где главный герой спасает день в знакомой сцене.',
    description: 'Персонаж появляется в семейной локации, получает супергеройский плащ и делает эффектный добрый поступок. Подходит для детского поздравления, семейного чата или сюрприза папе.',
    category: 'kids',
    promptTemplate: '{{character_main}} становится добрым супергероем в сцене {{scene}}. Кинематографичный кадр, теплый семейный юмор, героический жест, без опасности.',
    characterRoles: [
      { role: 'main', required: true, label: 'Главный герой' },
      { role: 'secondary', required: false, label: 'Второй герой' },
    ],
    needsScene: true,
    recommendedDuration: 10,
    defaultStyle: 'cinematic',
    priceTokens: 150,
    tags: ['семья', 'дети', 'супергерой'],
    isFeatured: true,
  },
  {
    slug: 'wedding-dance',
    title: 'Свадебный танец',
    shortDesc: 'Нежный танец двух героев в праздничной сцене.',
    description: 'Два персонажа танцуют в свадебной атмосфере: мягкий свет, плавная камера, ощущение торжества и тепла. Хорошо подходит для годовщины или поздравления молодоженам.',
    category: 'wedding',
    promptTemplate: '{{character_main}} и {{character_secondary}} танцуют свадебный танец в сцене {{scene}}. Мягкий свет, романтичная камера, реалистичный стиль.',
    characterRoles: [
      { role: 'main', required: true, label: 'Первый герой' },
      { role: 'main', required: true, label: 'Второй герой' },
    ],
    needsScene: true,
    recommendedDuration: 10,
    defaultStyle: 'realistic',
    priceTokens: 150,
    tags: ['свадьба', 'танец', 'романтика'],
    isFeatured: true,
  },
  {
    slug: 'new-year-greeting',
    title: 'С Новым годом!',
    shortDesc: 'Праздничное новогоднее поздравление с одним героем.',
    description: 'Главный герой оказывается среди огней, конфетти и праздничных деталей, улыбается и передает теплое новогоднее настроение.',
    category: 'newyear',
    promptTemplate: '{{character_main}} поздравляет с Новым годом в сказочной праздничной атмосфере. Елочные огни, конфетти, теплый свет, радостная эмоция.',
    characterRoles: [
      { role: 'main', required: true, label: 'Главный герой' },
    ],
    needsScene: false,
    recommendedDuration: 5,
    defaultStyle: 'cinematic',
    priceTokens: 100,
    tags: ['новый год', 'поздравление'],
    isFeatured: true,
  },
  {
    slug: 'birthday-hero',
    title: 'День рождения именинника',
    shortDesc: 'Яркое поздравление с именинником в центре внимания.',
    description: 'Герой появляется в праздничной сцене с тортом, свечами и мягким движением камеры. Формат подходит для сторис и семейного поздравления.',
    category: 'birthday',
    promptTemplate: '{{character_main}} празднует день рождения в сцене {{scene}}. Торт, свечи, шарики, радость, крупный кинематографичный план.',
    characterRoles: [
      { role: 'main', required: true, label: 'Именинник' },
      { role: 'secondary', required: false, label: 'Гость' },
    ],
    needsScene: true,
    recommendedDuration: 10,
    defaultStyle: 'cinematic',
    priceTokens: 150,
    tags: ['день рождения', 'праздник'],
    isFeatured: true,
  },
  {
    slug: 'pet-comic-hero',
    title: 'Питомец-герой комикса',
    shortDesc: 'Питомец превращается в героя яркой комикс-сцены.',
    description: 'Кошка, собака или другой питомец получает выразительный комикс-образ: динамичные линии, смешной геройский момент и узнаваемый характер.',
    category: 'pets',
    promptTemplate: '{{character_main}} как герой комикса в сцене {{scene}}. Яркая графика, динамичные линии, веселый героический момент.',
    characterRoles: [
      { role: 'main', required: true, label: 'Питомец' },
    ],
    needsScene: true,
    recommendedDuration: 5,
    defaultStyle: 'cartoon',
    priceTokens: 100,
    tags: ['питомцы', 'комикс'],
    isFeatured: false,
  },
  {
    slug: 'grandma-visit',
    title: 'В гостях у бабушки',
    shortDesc: 'Теплый семейный эпизод с двумя героями.',
    description: 'Два героя встречаются в уютной домашней сцене: чай, мягкий свет, семейная близость и спокойное движение камеры.',
    category: 'family',
    promptTemplate: '{{character_main}} и {{character_secondary}} встречаются в сцене {{scene}}. Уютный семейный момент, чай, улыбки, мягкий свет.',
    characterRoles: [
      { role: 'main', required: true, label: 'Первый герой' },
      { role: 'secondary', required: true, label: 'Второй герой' },
    ],
    needsScene: true,
    recommendedDuration: 10,
    defaultStyle: 'realistic',
    priceTokens: 150,
    tags: ['семья', 'уют'],
    isFeatured: false,
  },
  {
    slug: 'old-photo-memory',
    title: 'Воспоминание на старом фото',
    shortDesc: 'Винтажный памятный эпизод в стиле ожившего фото.',
    description: 'Герой появляется в теплой винтажной атмосфере: пленочное зерно, бережный свет, ощущение семейного архива и памяти.',
    category: 'memorial',
    promptTemplate: '{{character_main}} в бережном воспоминании на старом фото. Винтажный свет, пленочное зерно, спокойная камера, уважительное настроение.',
    characterRoles: [
      { role: 'main', required: true, label: 'Главный герой' },
    ],
    needsScene: false,
    recommendedDuration: 15,
    defaultStyle: 'vintage',
    priceTokens: 200,
    tags: ['память', 'архив', 'винтаж'],
    isFeatured: false,
  },
  {
    slug: 'knight-cosplay',
    title: 'Косплей: рыцарь',
    shortDesc: 'Веселая фантазийная сцена с героем-рыцарем.',
    description: 'Главный герой получает рыцарский образ и оказывается в игровой сцене приключения. Подходит для детей, семейных шуток и ярких сторис.',
    category: 'kids',
    promptTemplate: '{{character_main}} становится добрым рыцарем в сцене {{scene}}. Сказочный замок, плащ, мягкий свет, приключенческое настроение.',
    characterRoles: [
      { role: 'main', required: true, label: 'Рыцарь' },
    ],
    needsScene: true,
    recommendedDuration: 10,
    defaultStyle: 'cartoon',
    priceTokens: 150,
    tags: ['дети', 'косплей', 'фэнтези'],
    isFeatured: false,
  },
  {
    slug: 'family-disco',
    title: 'Танец на дискотеке',
    shortDesc: 'Веселый семейный танец с двумя героями.',
    description: 'Герои танцуют в яркой сцене с огнями и легкой ретро-атмосферой. Формат хорошо работает для семейных поздравлений и веселых сообщений.',
    category: 'family',
    promptTemplate: '{{character_main}} и {{character_secondary}} танцуют в сцене {{scene}}. Цветные огни, музыка, улыбки, легкий ретро-вайб.',
    characterRoles: [
      { role: 'main', required: true, label: 'Первый танцор' },
      { role: 'secondary', required: false, label: 'Второй танцор' },
    ],
    needsScene: true,
    recommendedDuration: 10,
    defaultStyle: 'cinematic',
    priceTokens: 150,
    tags: ['семья', 'танец', 'веселье'],
    isFeatured: false,
  },
];

async function main() {
  await prisma.trend.deleteMany({});
  await prisma.service.deleteMany({ where: { slug: { in: services.map((service) => service.slug) } } });
  await prisma.tokenPackage.deleteMany({});
  await prisma.setting.deleteMany({ where: { key: { in: publicSettingKeys } } });

  // Очистка: удаляем транзакции и пользователей, которых сидируем.
  await prisma.tokenTransaction.deleteMany({});
  const adminHash = await bcrypt.hash('admin123', BCRYPT_COST);
  const userHash = await bcrypt.hash('user123', BCRYPT_COST);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@allvision.studio' },
    update: {
      passwordHash: adminHash,
      name: 'Admin',
      role: 'ADMIN',
      tokenBalance: 10000,
      deletedAt: null,
    },
    create: {
      email: 'admin@allvision.studio',
      passwordHash: adminHash,
      name: 'Admin',
      role: 'ADMIN',
      tokenBalance: 10000,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'user@allvision.studio' },
    update: {
      passwordHash: userHash,
      name: 'Test User',
      role: 'USER',
      tokenBalance: 500,
      deletedAt: null,
    },
    create: {
      email: 'user@allvision.studio',
      passwordHash: userHash,
      name: 'Test User',
      role: 'USER',
      tokenBalance: 500,
    },
  });

  const createdServices = new Map<string, string>();
  for (const service of services) {
    const created = await prisma.service.create({ data: service });
    createdServices.set(created.slug, created.id);
  }

  const trendsServiceId = createdServices.get('trends');
  if (!trendsServiceId) throw new Error('Trends service was not created');

  await prisma.trend.createMany({
    data: trendSeed.map((trend, index) => ({
      ...trend,
      previewVideo: verticalImage(`trend-${index + 1}`),
      referenceImg: verticalImage(`trend-${trend.tags[0]}`),
      prompt: trend.prompt,
      aiProvider: 'mock',
      aiModel: 'mock-trend',
      aiConfig: {},
      priceTokens: 150,
      sortOrder: (index + 1) * 10,
      serviceId: trendsServiceId,
    })),
  });

  for (const [index, template] of scenarioTemplates.entries()) {
    await prisma.scenarioTemplate.upsert({
      where: { slug: template.slug },
      update: {
        ...template,
        previewVideo: staticAsset(`template-assets/previews/seed-${index + 1}.mp4`),
        previewImage: staticAsset(`template-assets/images/seed-${index + 1}.jpg`),
        aiProvider: 'mock',
        aiModel: 'mock-episode-v1',
        aiConfig: {},
        popularityScore: 0,
        isActive: true,
        sortOrder: (index + 1) * 10,
      },
      create: {
        ...template,
        previewVideo: staticAsset(`template-assets/previews/seed-${index + 1}.mp4`),
        previewImage: staticAsset(`template-assets/images/seed-${index + 1}.jpg`),
        aiProvider: 'mock',
        aiModel: 'mock-episode-v1',
        aiConfig: {},
        popularityScore: 0,
        isActive: true,
        sortOrder: (index + 1) * 10,
      },
    });
  }

  await prisma.tokenPackage.createMany({
    data: [
      { title: 'Старт', tokens: 100, priceRub: 99, bonus: 0, sortOrder: 10 },
      { title: 'Базовый', tokens: 500, priceRub: 499, bonus: 50, sortOrder: 20 },
      { title: 'Популярный', tokens: 1000, priceRub: 999, bonus: 150, isPopular: true, sortOrder: 30 },
      { title: 'Максимум', tokens: 3000, priceRub: 2999, bonus: 600, sortOrder: 40 },
    ],
  });

  await prisma.setting.createMany({
    data: [
      {
        key: 'fairy_tale_themes',
        value: JSON.stringify([
          'Дружба и доброта',
          'Смелость и уверенность',
          'Помощь родителям',
          'Не бояться темноты',
          'Делиться с другими',
        ]),
      },
      { key: 'support_telegram', value: '@allvision_support' },
      { key: 'support_email', value: 'hello@allvision.studio' },
      { key: 'company_name', value: 'Allvision Studio' },
      { key: 'fairy_tale_tier_basic_price', value: '4990' },
      { key: 'fairy_tale_tier_extended_price', value: '7990' },
      { key: 'cartoon_base_rate_per_minute', value: '3000' },
      { key: 'realistic_base_rate_per_minute', value: '6000' },
    ],
  });

  console.log('[seed] created accounts:');
  console.log(`  admin: ${admin.email} / admin123  (balance ${admin.tokenBalance})`);
  console.log(`  user:  ${user.email}  / user123   (balance ${user.tokenBalance})`);
  console.log(`[seed] created public catalog: ${services.length} services, ${trendSeed.length} trends, ${scenarioTemplates.length} scenario templates, 4 token packages`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
