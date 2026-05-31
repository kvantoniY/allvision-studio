import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma, ProcessingType } from './index';

// Category codes used by the seed. The category metadata (title, sortOrder, ...) lives in ServiceCategoryDef
// and is seeded by SQL migration 20260527150000_service_categories_table. Code stays as a plain string here.
const ServiceCategory = {
  PHOTO_RESTORE: 'PHOTO_RESTORE',
  PHOTO_ANIMATE: 'PHOTO_ANIMATE',
  TREND: 'TREND',
  CARTOON_CUSTOM: 'CARTOON_CUSTOM',
  REALISTIC_CUSTOM: 'REALISTIC_CUSTOM',
  FAIRY_TALE: 'FAIRY_TALE',
  NOSTALGIA: 'NOSTALGIA',
  TRENDS_MEMES: 'TRENDS_MEMES',
  KIDS_HEROES: 'KIDS_HEROES',
  SPECIAL_OCCASIONS: 'SPECIAL_OCCASIONS',
} as const;
import { migrateMediaAssets } from './migrate-media-assets';

const BCRYPT_COST = 12;
const SYSTEM_PASSWORD_PLACEHOLDER = 'CHANGE_ME_AT_FIRST_DEPLOY';

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

function trendVideo(index: 1 | 2 | 3) {
  return staticAsset(`trends/trend-${index}.mp4`);
}

const services = [
  {
    slug: 'photo-restore',
    title: 'Улучшение старых фото',
    shortDesc:
      'Возвращаем четкость, цвет и детали снимкам из семейного архива. Подходит для старых бумажных фото, сканов и цифровых кадров низкого качества.',
    description: [
      'Старые фотографии редко стареют аккуратно: бумага желтеет, появляются заломы, шум, потеря резкости и выцветшие лица. Allvision Studio аккуратно улучшает такие снимки с помощью AI: восстанавливает детали, снижает шум, выравнивает свет и помогает вернуть изображению живой, бережный вид.',
      'Услуга особенно полезна для семейных архивов, памятных дат, сюрпризов родителям и подготовки фотоальбомов. Вы загружаете изображение, система анализирует его качество и подбирает мягкую обработку без ощущения пластика или неестественной ретуши.',
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
      'Такой формат хорошо подходит для детских праздников, сюрпризов, семейных историй, поздравлений, рекламы небольшого бизнеса и необычных презентаций. Мы можем работать с фотографиями, описанием персонажей, референсами стиля и пожеланиями по сценам.',
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
      'После сценария можно заказать видеоверсию: персонажи, иллюстрации, озвучка и монтаж собираются вручную, чтобы история выглядела не как безликий шаблон, а как история именно для вашего ребенка. Поэтому услуга имеет гибридный формат: быстрый AI-сценарий и дальнейшая ручная работа.',
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

const giftFactoryServices = [
  {
    slug: 'revive-old-photo',
    title: 'Оживить старое фото',
    shortDesc: 'Восстановим качество, добавим движение и музыку',
    description:
      'Загрузите старое фото из семейного архива. Мы аккуратно восстановим детали, превратим снимок в короткое тёплое видео и при желании наложим вашу аудио-дорожку для атмосферы.',
    category: ServiceCategory.NOSTALGIA,
    // Себестоимость Pro: nano-banana@2K ($0.08) + kling-3-pro 5s @720p ($1.30) + ffmpeg compose ($0) = ~$1.38 ≈ 110 коинов
    priceTokens: 110,
    priceCoinsStandard: 110,
    priceCoinsPro: 110,
    costUsd: 1.38,
    coverImage: image('gift-revive-old-photo'),
    galleryImages: [image('gift-revive-gallery-1'), image('gift-revive-gallery-2')],
    previewImage: image('gift-revive-old-photo-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 1,
    userInputForm: [
      {
        id: 'photo',
        type: 'photo',
        label: 'Фотография',
        required: true,
        hint: 'JPG/PNG/WebP, до 10MB',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'duration',
        type: 'duration',
        label: 'Длительность видео',
        required: false,
        durationOptions: [5, 8, 10],
        defaultDuration: 5,
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['auto', '9:16', '16:9', '1:1'],
        defaultAspect: 'auto',
      },
      {
        id: 'music',
        type: 'audio',
        label: 'Своя музыка (необязательно)',
        required: false,
        hint: 'MP3, WAV или OGG до 25MB. Будет наложена с плавным появлением и затуханием.',
        maxSizeMb: 25,
        allowedFormats: ['mp3', 'wav', 'ogg', 'm4a'],
        allowUserUpload: true,
        allowLibrary: true,
        mediaKind: 'background-music',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: '{{user.photo}}',
        params: {
          model: { standard: 'nano-banana', pro: 'nano-banana' },
          prompt: 'PLACEHOLDER: восстановить старое фото, убрать царапины, выцветание и шум, восстановить цвета и детали лица. Сохранить идентичность людей и композицию. Фото должно выглядеть как качественный современный снимок того же момента.',
          output_format: 'jpg',
          aspect_ratio: 'auto',
          resolution: '2K',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'image-to-video',
        input: '{{step_1.output}}',
        params: {
          duration: '{{user.duration}}',
          aspect_ratio: '{{user.aspect}}',
          model: { standard: 'kling-3-pro', pro: 'kling-3-pro' },
          prompt: 'Subject moves naturally, slight head turn, gentle smile, slow cinematic camera push-in, soft warm light, photorealistic',
          resolution: '720p',
        },
      },
      {
        id: 'step_3',
        blockSlug: 'video-compose',
        input: '{{step_2.output}}',
        params: {
          watermark: false,
          title: 'Allvision',
          audio_source: '{{user.music}}',
          audio_volume: 0.5,
          audio_fade_in_sec: 2,
          audio_fade_out_sec: 2,
          audio_loop: true,
          keep_original_audio: false,
        },
      },
    ],
  },
  {
    slug: 'face-in-trend',
    title: 'Я в трендовом видео',
    shortDesc: 'Подставим ваше лицо в короткий трендовый ролик',
    description:
      'Выберите тренд и загрузите фото лица. Сервис соберёт вертикальное видео: face swap и финальная сборка с опциональной музыкой.',
    category: ServiceCategory.TRENDS_MEMES,
    // Себестоимость: Qubico face-swap ~$0.48 (5s * 24fps * $0.004) + compose = $0.48 ≈ 40 коинов
    priceTokens: 40,
    priceCoinsStandard: 40,
    priceCoinsPro: 40,
    costUsd: 0.48,
    coverImage: image('gift-face-in-trend'),
    galleryImages: [image('gift-face-trend-gallery-1'), image('gift-face-trend-gallery-2')],
    previewImage: image('gift-face-in-trend-preview'),
    previewVideo: trendVideo(1),
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 2,
    userInputForm: [
      {
        id: 'face',
        type: 'photo',
        label: 'Ваше фото лица',
        required: true,
        hint: 'Лучше всего работает портрет анфас',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'trendVideo',
        type: 'media-select',
        mediaKind: 'trend-video',
        label: 'Какой тренд',
        required: true,
      },
      {
        id: 'music',
        type: 'music-select',
        label: 'Музыка (необязательно)',
        required: false,
        mediaKind: 'background-music',
        allowLibrary: true,
        allowUserUpload: false,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'face-swap-video',
        input: '{{user.face}}',
        params: {
          target_video: '{{user.trendVideo}}',
          prompt: 'face swap into selected trend video',
          duration: 5,
          estimatedFrames: 120,
          model: { standard: 'qubico-video-toolkit', pro: 'qubico-video-toolkit' },
        },
      },
      {
        id: 'step_2',
        blockSlug: 'video-compose',
        input: '{{step_1.output}}',
        params: {
          watermark: false,
          title: 'Allvision trend',
          audio_source: '{{user.music}}',
          audio_volume: 0.6,
          audio_fade_in_sec: 0.5,
          audio_fade_out_sec: 0.5,
          audio_loop: true,
          keep_original_audio: true,
        },
      },
    ],
  },
  {
    slug: 'kid-cartoon-hero',
    title: 'Ребёнок-герой мультика',
    shortDesc: 'Превратим фото ребёнка в короткий мульт-сюжет',
    description:
      'Загрузите фото ребёнка, напишите имя и выберите оригинальный стилизованный мир. Pipeline создаёт короткое видео в добром мульт-настроении без использования чужих IP.',
    category: ServiceCategory.KIDS_HEROES,
    // Себестоимость: nano-banana@1K стилизация ($0.06) + veo-3.1 8s ($0.96) + compose = $1.02 ≈ 90 коинов
    priceTokens: 90,
    priceCoinsStandard: 90,
    priceCoinsPro: 90,
    costUsd: 1.02,
    coverImage: image('gift-kid-cartoon-hero'),
    galleryImages: [image('gift-kid-cartoon-gallery-1'), image('gift-kid-cartoon-gallery-2')],
    previewImage: image('gift-kid-cartoon-hero-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 3,
    userInputForm: [
      {
        id: 'child_photo',
        type: 'photo',
        label: 'Фото ребёнка',
        required: true,
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      { id: 'child_name', type: 'text', label: 'Имя ребёнка', required: true, hint: 'Будет в видео', maxLength: 60 },
      {
        id: 'world',
        type: 'select',
        label: 'Мир',
        required: true,
        options: [
          { value: 'color-truck', label: 'Цветной грузовичок в долине радуги' },
          { value: 'forest-girl', label: 'Лесная девочка и большой друг' },
        ],
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['9:16', '16:9', '1:1'],
        defaultAspect: '9:16',
      },
      {
        id: 'music',
        type: 'music-select',
        label: 'Музыка (необязательно)',
        required: false,
        mediaKind: 'background-music',
        allowLibrary: true,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: '{{user.child_photo}}',
        params: {
          model: { standard: 'nano-banana', pro: 'nano-banana' },
          prompt: 'Stylize this child photo as a friendly hand-drawn cartoon hero in the world of "{{user.world}}". Preserve recognizable face features. Soft pastel colors, family-friendly, no IP characters.',
          output_format: 'jpg',
          aspect_ratio: '{{user.aspect}}',
          resolution: '1K',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'image-to-video',
        input: '{{step_1.output}}',
        params: {
          duration: 8,
          aspect_ratio: '{{user.aspect}}',
          model: { standard: 'veo-3.1-i2v', pro: 'veo-3.1-i2v' },
          prompt: 'Cartoon child hero {{user.child_name}} in {{user.world}} scene, gentle motion, cinematic, warm family-friendly mood',
          resolution: '1080p',
        },
      },
      {
        id: 'step_3',
        blockSlug: 'video-compose',
        input: '{{step_2.output}}',
        params: {
          watermark: false,
          title: '{{user.child_name}}',
          audio_source: '{{user.music}}',
          audio_volume: 0.6,
          audio_fade_in_sec: 1,
          audio_fade_out_sec: 1,
          audio_loop: true,
          keep_original_audio: false,
        },
      },
    ],
  },
  {
    slug: 'anniversary-card',
    title: 'Юбилейная видео-открытка',
    shortDesc: 'Соберём тёплую видео-открытку из фотографии',
    description:
      'Подойдёт для дня рождения, юбилея или годовщины. Загрузите фотографию, выберите повод, а pipeline восстановит фото, добавит праздничное движение и музыку.',
    category: ServiceCategory.SPECIAL_OCCASIONS,
    // Себестоимость: nano-banana@1K ($0.06) + kling-3-pro 5s @720p ($1.30) + compose = $1.36 ≈ 110 коинов
    priceTokens: 110,
    priceCoinsStandard: 110,
    priceCoinsPro: 110,
    costUsd: 1.36,
    coverImage: image('gift-anniversary-card'),
    galleryImages: [image('gift-anniversary-gallery-1'), image('gift-anniversary-gallery-2')],
    previewImage: image('gift-anniversary-card-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 4,
    userInputForm: [
      {
        id: 'photos',
        type: 'photo',
        label: 'Фотография юбиляра',
        required: true,
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'occasion',
        type: 'select',
        label: 'Повод',
        required: true,
        options: [
          { value: 'birthday', label: 'День рождения' },
          { value: 'wedding-anniv', label: 'Годовщина свадьбы' },
          { value: 'jubilee', label: 'Юбилей' },
        ],
      },
      {
        id: 'music',
        type: 'audio',
        label: 'Музыка для открытки',
        required: false,
        hint: 'MP3, WAV или OGG до 25MB',
        maxSizeMb: 25,
        allowedFormats: ['mp3', 'wav', 'ogg', 'm4a'],
        allowUserUpload: true,
        allowLibrary: true,
        mediaKind: 'background-music',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: '{{user.photos}}',
        params: {
          model: { standard: 'nano-banana', pro: 'nano-banana' },
          prompt: 'Festive {{user.occasion}} celebration mood: subtle colorful confetti, soft warm light. Preserve identity and composition.',
          output_format: 'jpg',
          resolution: '1K',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'image-to-video',
        input: '{{step_1.output}}',
        params: {
          duration: 5,
          model: { standard: 'kling-3-pro', pro: 'kling-3-pro' },
          prompt: 'Festive {{user.occasion}} atmosphere, warm celebratory motion, gentle camera, joyful mood',
          resolution: '720p',
        },
      },
      {
        id: 'step_3',
        blockSlug: 'video-compose',
        input: '{{step_2.output}}',
        params: {
          watermark: false,
          title: 'Allvision celebration',
          audio_source: '{{user.music}}',
          audio_volume: 0.7,
          audio_fade_in_sec: 1,
          audio_fade_out_sec: 1,
          audio_loop: true,
          keep_original_audio: false,
        },
      },
    ],
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

export interface SeedOptions {
  destructive?: boolean;
  includeDevUser?: boolean;
  includeDevCatalog?: boolean;
}

type SystemUserRole = 'ADMIN' | 'READONLY_ADMIN';

type EnsureUserOptions = {
  emailEnv: string;
  emailDefault: string;
  passwordEnv: string;
  role: SystemUserRole;
  name: string;
  legacyEmailEnv?: string;
  legacyPasswordEnv?: string;
};

const tokenPackages = [
  {
    title: 'Старт',
    tokens: 100,
    priceRub: 99,
    bonus: 0,
    features: ['1 токен = 1 ₽ для автоматических услуг', 'Списание только после запуска обработки', 'Подходит для фото, анимаций и трендов'],
    sortOrder: 10,
  },
  {
    title: 'Базовый',
    tokens: 500,
    priceRub: 499,
    bonus: 50,
    features: ['1 токен = 1 ₽ для автоматических услуг', 'Списание только после запуска обработки', 'Подходит для фото, анимаций и трендов'],
    sortOrder: 20,
  },
  {
    title: 'Популярный',
    tokens: 1000,
    priceRub: 999,
    bonus: 150,
    badgeText: 'Выбирают чаще всего',
    features: ['1 токен = 1 ₽ для автоматических услуг', 'Списание только после запуска обработки', 'Подходит для фото, анимаций и трендов'],
    isPopular: true,
    sortOrder: 30,
  },
  {
    title: 'Максимум',
    tokens: 3000,
    priceRub: 2999,
    bonus: 600,
    features: ['1 токен = 1 ₽ для автоматических услуг', 'Списание только после запуска обработки', 'Подходит для фото, анимаций и трендов'],
    sortOrder: 40,
  },
];

const stylePresets = [
  {
    slug: 'avatar-realistic-portrait',
    kind: 'user-avatar',
    title: 'Реалистичный портрет',
    description: 'Чистый студийный портрет с естественным светом.',
    promptText:
      'Create a realistic studio portrait with natural skin texture, balanced facial proportions, and soft professional lighting. Keep the subject recognizable and avoid exaggerated retouching. Use a clean background and a refined editorial mood.',
    sortOrder: 10,
  },
  {
    slug: 'avatar-cartoon-character',
    kind: 'user-avatar',
    title: 'Мультяшный герой',
    description: 'Дружелюбный персонаж для семейных и детских сцен.',
    promptText:
      'Transform the subject into a warm cartoon character with expressive eyes, clear silhouette, and charming family-friendly styling. Preserve the main identity cues while simplifying details into polished animation art. Use bright but tasteful colors and soft depth.',
    sortOrder: 20,
  },
  {
    slug: 'avatar-anime',
    kind: 'user-avatar',
    title: 'Аниме',
    description: 'Стильный аниме-портрет с аккуратной детализацией.',
    promptText:
      'Create an anime-inspired character portrait with elegant linework, expressive eyes, and polished cel-shaded lighting. Keep the pose natural and the character appealing without overloading the frame. Preserve recognizable features through hairstyle, face shape, and key accessories.',
    sortOrder: 30,
  },
  {
    slug: 'avatar-watercolor',
    kind: 'user-avatar',
    title: 'Акварель',
    description: 'Мягкий художественный портрет с бумажной фактурой.',
    promptText:
      'Render the subject as a delicate watercolor portrait on textured paper, with translucent washes and gentle color transitions. Keep facial features clear and recognizable while letting edges stay slightly organic. The mood should feel handcrafted, calm, and luminous.',
    sortOrder: 40,
  },
  {
    slug: 'avatar-cyberpunk',
    kind: 'user-avatar',
    title: 'Киберпанк',
    description: 'Неоновый футуристичный образ для эффектных роликов.',
    promptText:
      'Create a cinematic cyberpunk portrait with neon rim lights, futuristic clothing accents, and a dramatic urban atmosphere. Keep the subject sharp and recognizable, with high contrast lighting and subtle tech details. Avoid clutter; the character should remain the clear focus.',
    sortOrder: 50,
  },
  {
    slug: 'avatar-vintage-film',
    kind: 'user-avatar',
    title: 'Винтажное кино',
    description: 'Портрет с плёночным зерном и ретро-настроением.',
    promptText:
      'Create a vintage film portrait with warm analog color grading, subtle grain, and classic photographic lighting. Preserve the person’s identity and use timeless wardrobe details that do not overpower the face. The final image should feel like a carefully restored archival still.',
    sortOrder: 60,
  },
  {
    slug: 'location-forest-nature',
    kind: 'user-location',
    title: 'Природа и лес',
    description: 'Живая природная сцена с глубиной и мягким светом.',
    promptText:
      'Create a rich natural environment with layered forest depth, organic details, and soft sunlight filtering through foliage. Make the location inviting and cinematic, with clear foreground, midground, and background. Leave visual space where a character could naturally appear.',
    sortOrder: 10,
  },
  {
    slug: 'location-city-street',
    kind: 'user-location',
    title: 'Городская улица',
    description: 'Современная улица для динамичных городских сцен.',
    promptText:
      'Create a cinematic urban street scene with realistic architecture, atmospheric lighting, and believable street details. Use strong perspective lines and a clean composition suitable for placing a person in the frame. The mood should feel modern, lively, and visually grounded.',
    sortOrder: 20,
  },
  {
    slug: 'location-cozy-interior',
    kind: 'user-location',
    title: 'Уютный интерьер',
    description: 'Тёплая домашняя или студийная обстановка.',
    promptText:
      'Create a cozy interior environment with warm practical lighting, tasteful decor, and a comfortable lived-in feeling. Keep the scene uncluttered enough for characters or products to stand out. Use realistic materials, soft shadows, and a welcoming color palette.',
    sortOrder: 30,
  },
  {
    slug: 'location-fantasy-world',
    kind: 'user-location',
    title: 'Фэнтези',
    description: 'Сказочная сцена для волшебных историй.',
    promptText:
      'Create a fantasy environment with magical atmosphere, imaginative architecture or nature elements, and cinematic depth. Keep the scene readable and not overly busy, with a strong focal area for a character. Use rich lighting, subtle mist, and enchanting details.',
    sortOrder: 40,
  },
  {
    slug: 'location-sci-fi-space',
    kind: 'user-location',
    title: 'Sci-fi / космос',
    description: 'Футуристичная сцена с технологичным настроением.',
    promptText:
      'Create a polished science-fiction environment with sleek technology, distant space or futuristic city elements, and dramatic cinematic lighting. Keep the composition clean and believable, with clear surfaces and scale cues. The scene should feel premium, spacious, and ready for a character.',
    sortOrder: 50,
  },
  {
    slug: 'location-studio-backdrop',
    kind: 'user-location',
    title: 'Студийный фон',
    description: 'Чистый фон для портретов, карточек и обложек.',
    promptText:
      'Create a refined studio backdrop with controlled lighting, subtle texture, and a professional photography setup. Keep the background simple enough to support portraits, products, or avatars without distraction. Use soft gradients of light from real lamps rather than decorative abstract effects.',
    sortOrder: 60,
  },
];

const publicSettings = [
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
];

export async function runSeed(options: SeedOptions = {}) {
  if (options.destructive) {
    await truncateForDevSeed();
  }

  console.log('[seed] step 1/4: system users');
  await ensureSystemUsers();

  console.log('[seed] step 2/4: catalog (services, trends, scenarios)');
  await ensureCatalog(options);

  console.log('[seed] step 3/5: token packages');
  await ensureTokenPackages();

  console.log('[seed] step 4/5: style presets');
  await ensureStylePresets();

  console.log('[seed] step 5/5: media assets migration');
  await ensureMediaAssetsMigration();

  let devUserEmail: string | undefined;
  if (options.includeDevUser) {
    devUserEmail = (await seedDevUser()).email;
    console.log(`[seed] dev user ready: ${devUserEmail} / user123`);
  }

  console.log('[seed] all seed steps complete');
}

export async function ensureSystemUsers() {
  await ensureUser({
    emailEnv: 'ADMIN_EMAIL',
    emailDefault: 'admin@allvision-pulse.ru',
    passwordEnv: 'ADMIN_PASSWORD',
    legacyEmailEnv: 'ADMIN_INITIAL_EMAIL',
    legacyPasswordEnv: 'ADMIN_INITIAL_PASSWORD',
    role: 'ADMIN',
    name: 'Admin',
  });
  await ensureUser({
    emailEnv: 'READONLY_ADMIN_EMAIL',
    emailDefault: 'claude-readonly@allvision-pulse.ru',
    passwordEnv: 'READONLY_ADMIN_PASSWORD',
    role: 'READONLY_ADMIN',
    name: 'AI Readonly Admin',
  });
}

async function ensureUser(options: EnsureUserOptions) {
  const email = readEnv(options.emailEnv, options.legacyEmailEnv) ?? options.emailDefault;
  const password = readEnv(options.passwordEnv, options.legacyPasswordEnv);
  if (!password || password === SYSTEM_PASSWORD_PLACEHOLDER) {
    console.warn(`[seed] system user skipped: ${email} (role: ${options.role}; password not set)`);
    return null;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== options.role || existing.deletedAt) {
      await prisma.user.update({
        where: { email },
        data: {
          role: options.role,
          deletedAt: null,
        },
      });
      console.log(`[seed] system user ensured: ${email} (role: ${options.role})`);
    } else {
      console.log(`[seed] system user already exists: ${email} (role: ${options.role})`);
    }
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const created = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: options.name,
      role: options.role,
      tokenBalance: 0,
    },
  });
  console.log(`[seed] system user ensured: ${email} (role: ${options.role})`);
  return created;
}

async function ensureCatalog(options: SeedOptions) {
  const serviceCountBefore = await prisma.service.count();
  const pilotServices = await seedPilotServices();

  let legacyServices = 0;
  let trends = 0;
  let scenarioTemplateCount = 0;
  if (options.includeDevCatalog) {
    const devCatalog = await seedDevCatalog();
    legacyServices = devCatalog.legacyServices;
    trends = devCatalog.trends;
    scenarioTemplateCount = devCatalog.scenarioTemplates;
  }

  if (
    serviceCountBefore > 0
    && pilotServices.created === 0
    && pilotServices.patched === 0
    && legacyServices === 0
    && trends === 0
    && scenarioTemplateCount === 0
  ) {
    console.log(`[seed] catalog already populated, skipped (${serviceCountBefore} services)`);
    return;
  }

  console.log(
    `[seed] catalog ensured: ${pilotServices.created} pilot services created, ${pilotServices.patched} patched, ${legacyServices} legacy services, ${trends} trends, ${scenarioTemplateCount} scenario templates`,
  );
}

async function ensureTokenPackages() {
  const ensuredPackages = await seedTokenPackages();
  const createdSettings = await seedPublicSettings();
  console.log(`[seed] token packages: ${ensuredPackages} ensured`);
  if (createdSettings > 0) {
    console.log(`[seed] public settings: ${createdSettings} created`);
  }
}

async function ensureStylePresets() {
  let ensured = 0;
  for (const preset of stylePresets) {
    await prisma.stylePreset.upsert({
      where: { slug: preset.slug },
      update: {
        kind: preset.kind,
        title: preset.title,
        description: preset.description,
        promptText: preset.promptText,
        sortOrder: preset.sortOrder,
        isActive: true,
      },
      create: {
        ...preset,
        thumbnail: null,
        isActive: true,
      },
    });
    ensured += 1;
  }
  console.log(`[seed] style presets: ${ensured} ensured`);
}

async function ensureMediaAssetsMigration() {
  const migrated = await migrateMediaAssets();
  console.log(`[seed] media assets migration: ${migrated} trends migrated`);
}

async function seedDevUser() {
  const passwordHash = await bcrypt.hash('user123', BCRYPT_COST);
  return prisma.user.upsert({
    where: { email: 'user@allvision.studio' },
    update: {
      passwordHash,
      name: 'Test User',
      role: 'USER',
      tokenBalance: 25,
      deletedAt: null,
    },
    create: {
      email: 'user@allvision.studio',
      passwordHash,
      name: 'Test User',
      role: 'USER',
      tokenBalance: 25,
    },
  });
}

async function seedPilotServices() {
  let created = 0;
  let patched = 0;
  for (const service of giftFactoryServices) {
    const existing = await prisma.service.findUnique({ where: { slug: service.slug } });
    if (existing) {
      // Always refresh seed services to canonical seed config (Pro-default, current prices, latest userInputForm).
      // Admin can override later through /admin/services UI; seed only runs at deploy time on system upgrades.
      const needsUpdate =
        existing.priceCoinsStandard !== service.priceCoinsStandard ||
        existing.priceCoinsPro !== service.priceCoinsPro ||
        existing.priceTokens !== service.priceTokens ||
        JSON.stringify(existing.userInputForm) !== JSON.stringify(service.userInputForm) ||
        JSON.stringify(existing.pipelineConfig) !== JSON.stringify(service.pipelineConfig) ||
        existing.isActive !== service.isActive ||
        existing.isFeatured !== service.isFeatured;

      if (needsUpdate) {
        await prisma.service.update({
          where: { slug: service.slug },
          data: {
            priceTokens: service.priceTokens,
            priceCoinsStandard: service.priceCoinsStandard,
            priceCoinsPro: service.priceCoinsPro,
            previewVideo: service.previewVideo,
            userInputForm: service.userInputForm,
            pipelineConfig: service.pipelineConfig,
            isFeatured: service.isFeatured,
            isActive: service.isActive,
            aiProvider: service.aiProvider,
            aiModel: service.aiModel,
          },
        });
        patched += 1;
      }
      continue;
    }
    await prisma.service.create({ data: service });
    created += 1;
  }
  return { created, patched };
}


async function seedDevCatalog() {
  const createdServices = new Map<string, string>();
  let legacyServices = 0;
  for (const service of services) {
    const existing = await prisma.service.findUnique({ where: { slug: service.slug } });
    if (existing) {
      createdServices.set(existing.slug, existing.id);
      continue;
    }
    const created = await prisma.service.create({ data: service });
    createdServices.set(created.slug, created.id);
    legacyServices += 1;
  }

  const trendsServiceId = createdServices.get('trends');
  if (!trendsServiceId) throw new Error('Trends service was not created');

  const existingTrends = await prisma.trend.count();
  if (existingTrends === 0) {
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
  }

  let scenarioTemplateCount = 0;
  for (const [index, template] of scenarioTemplates.entries()) {
    const existing = await prisma.scenarioTemplate.findUnique({ where: { slug: template.slug } });
    if (existing) continue;
    await prisma.scenarioTemplate.create({
      data: {
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
    scenarioTemplateCount += 1;
  }

  return {
    legacyServices,
    trends: existingTrends === 0 ? trendSeed.length : 0,
    scenarioTemplates: scenarioTemplateCount,
  };
}

async function seedTokenPackages() {
  const existing = await prisma.tokenPackage.count();
  if (existing > 0) return existing;
  await prisma.tokenPackage.createMany({ data: tokenPackages });
  return tokenPackages.length;
}

async function seedPublicSettings() {
  let created = 0;
  for (const setting of publicSettings) {
    const existing = await prisma.setting.findUnique({ where: { key: setting.key } });
    if (existing) continue;
    await prisma.setting.create({ data: setting });
    created += 1;
  }
  return created;
}

async function truncateForDevSeed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run destructive dev seed with NODE_ENV=production');
  }
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AIUsageLog",
      "ChatMessage",
      "Chat",
      "MediaAsset",
      "EpisodeCharacter",
      "Episode",
      "Scene",
      "Character",
      "AbuseReport",
      "Payment",
      "Order",
      "FairyTaleScriptRecord",
      "TokenTransaction",
      "Project",
      "Trend",
      "ScenarioTemplate",
      "Service",
      "TokenPackage",
      "StylePreset",
      "Setting",
      "User"
    RESTART IDENTITY CASCADE
  `);
}

function readEnv(primary: string, fallback?: string) {
  return process.env[primary] ?? (fallback ? process.env[fallback] : undefined);
}

if (require.main === module) {
  runSeed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
}
