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
  CINEMA: 'CINEMA',
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

// Промпт «Фото в стиле 2к17» для ОДНОГО человека (1 референс).
const PHOTO_2017_PROMPT_ONE = `GPT Image 2 edit. Use the uploaded photo ONLY as a face and identity reference. Create one new photorealistic solo photo of this exact person from the CIS / post-Soviet summer of 2016-2017, the nostalgic VK era.

CRITICAL identity rules:
- Show EXACTLY ONE person - the same person as in the reference - and no one else. Do NOT add other people, background friends, crowds or faces on posters, and do NOT duplicate the person.
- Reproduce the person exactly and recognizably from the reference: same face shape, eyes, eyebrows, nose, mouth, jawline, hairstyle, hair color, skin tone, age and natural expression. Do NOT blend, morph, warp, beautify, re-age or change the face. Keep the face sharp and clearly recognizable. Do not copy the original photo's pose, framing, clothing or background - only the identity.

It must look like a real amateur phone snapshot taken by a friend from a few meters away, never a selfie. The person stands or sits relaxed and natural in an ordinary post-Soviet courtyard at dusk.

MANDATORY wardrobe change: replace whatever the person is wearing in their reference with authentic 2016-2017 raion (двор) street style - an adidas-style retro track jacket (олимпийка) with side stripes, OR a Thrasher-style flame-logo hoodie, OR a plain dark hoodie or tracksuit top, paired with dark tracksuit pants or fitted jeans, white sneakers, optional cap or beanie. The outfit must clearly read as 2016-2017 CIS youth streetwear. Never keep the original clothing.

Scene: grey panel apartment blocks (панельки / хрущёвки) in the background, asphalt, benches, metal garages, workout bars, old parked cars, a simple playground. Strong малиновый закат: a crimson-pink-purple sunset gradient sky glowing behind the buildings, warm low sunlight, long soft shadows.

LIGHTING AND INTEGRATION (critical - this is the most important rule): the entire photo must share ONE single coherent light situation - the warm crimson-pink sunset light plus soft cool dusk ambient. The face and body MUST be fully re-lit and color-graded to match this exact light: a warm rim/edge light on hair, cheek and shoulders coming from the glowing sky, soft warm-to-neutral fill on the face, and the SAME white balance, color temperature, exposure, contrast, softness and grain across the person and the background. The person must look genuinely photographed standing in this courtyard at this moment, their skin tone blended into the warm dusk grade while staying recognizable. Do NOT keep the original lighting or color of the reference face. Strictly avoid a pasted, cut-out, sticker or photoshop-composite look: the face may not be brighter, sharper, cleaner, cooler or a different color than the scene, and there must be no mismatch between the face and the environment. The person must be lit by the same single sunset light and sit in the same focal plane and grain as the background.

Framing and pose: a candid shot framed from the head down to roughly the knees or mid-thigh - NOT a tiny distant full-body figure and NOT a tight face close-up. The person stands or leans casually against the sunset and the panelki, slightly off-center, relaxed natural posture, hands in pockets or loosely at the sides, looking at the camera or slightly away. Not a model pose, no outstretched arm, no phone in hand, no mirror.

ANATOMY AND PROPORTIONS (critical): render fully correct, natural human anatomy. The head must be in correct, realistic proportion to the neck and body, with normal shoulder width and natural limb and torso length. No oversized or undersized head, no wrong head-to-body ratio, no shrunken or elongated body, no warped or melted proportions, no distorted limbs or hands.

Look and quality: a good-quality amateur 2017 phone photo - natural and candid, NOT a polished studio render and NOT cinematic. Clean and reasonably sharp with crisp, detailed face, hair and clothing and a clearly readable background; only a faint hint of grain and a warm color cast, slightly uneven natural exposure, flat phone-camera depth with the whole frame in focus (no bokeh, no background blur). Authentic VK vibe but in good, clear resolution. Keep the face recognizable, lit and textured like the rest of the photo. Realistic detailed skin texture, natural proportions, correct hands.

Avoid: disproportionate oversized or tiny head, wrong head-to-body ratio, elongated or shrunken body, warped or unnatural proportions, distorted limbs, pasted or cut-out face, photoshop composite, sticker face, face lit differently from the scene, mismatched white balance or color temperature on the face, face brighter sharper or cooler than the body and background, double lighting, glossy AI skin, beauty filter, glamour retouch, cinematic editorial polish, heavy HDR, oversaturation, selfie framing, outstretched arm, phone or mirror in frame, modern influencer aesthetic, extra people, duplicated face, distorted face, deformed hands, text, captions, logos or watermarks.`;

// Промпт «Фото в стиле 2к17» для ДВУХ человек (2 референса). Отличается от prompt_one только
// блоком про количество референсов/людей (чётко 2, без «если 3 то 3, если 4 то 4»).
const PHOTO_2017_PROMPT_TWO = `GPT Image 2 edit. You are given EXACTLY TWO reference images. Each uploaded reference image is ONE separate real person. Create one new photorealistic photo of two people together from the CIS / post-Soviet summer of 2016-2017, the nostalgic VK era.

CRITICAL identity and count rules:
- Show EXACTLY TWO people and no one else. Place the FIRST reference person on the LEFT and the SECOND reference person on the RIGHT, side by side at the SAME distance from the camera and the same scale (neither pushed behind the other).
- Reproduce BOTH faces with the SAME maximum care, detail and likeness, each from its OWN reference image: same face shape, eyes, eyebrows, nose, mouth, jawline, hairstyle, hair color, skin tone, age and natural expression. The RIGHT person (second reference) must match their reference just as exactly and sharply as the LEFT person - do NOT let the second face become generic, softer, blurrier, half-turned away, distorted or less detailed than the first. Both faces clearly visible and facing roughly toward the camera.
- Do NOT blend, average, mix or swap faces between the two people. Do NOT duplicate either person, do NOT invent extra people, do NOT add background friends, crowds or faces on posters. Keep both faces sharp, clearly separated and recognizable.

It must look like a real amateur phone snapshot taken by a friend from a few meters away, never a selfie. The two stand or sit close together, side by side, relaxed and natural, in an ordinary post-Soviet courtyard at dusk.

MANDATORY wardrobe change for both: replace whatever each person is wearing in their reference with authentic 2016-2017 raion (двор) street style - adidas-style retro track jackets (олимпийки) with side stripes, Thrasher-style flame-logo hoodies, plain dark hoodies or tracksuit tops, dark tracksuit pants or fitted jeans, white sneakers, optional caps or beanies. Vary the outfits naturally between the two. Never keep the original clothing.

Scene: grey panel apartment blocks (панельки / хрущёвки) in the background, asphalt, benches, metal garages, workout bars, old parked cars, a simple playground. Strong малиновый закат: a crimson-pink-purple sunset gradient sky glowing behind the buildings, warm low sunlight, long soft shadows.

LIGHTING AND INTEGRATION (critical - this is the most important rule): the entire photo must share ONE single coherent light situation - the warm crimson-pink sunset light plus soft cool dusk ambient. EVERY face and body MUST be fully re-lit and color-graded to match this exact light: a warm rim/edge light on hair, cheeks and shoulders coming from the glowing sky, soft warm-to-neutral fill on the faces, and the SAME white balance, color temperature, exposure, contrast, softness and grain across both people and the background. Both must look genuinely photographed together standing in this courtyard at this moment, their skin tones blended into the warm dusk grade while staying recognizable. Do NOT keep the original lighting or color of the reference faces. Strictly avoid a pasted, cut-out, sticker or photoshop-composite look: neither face may be brighter, sharper, cleaner, cooler or a different color than the other or than the scene, and there must be no mismatch between faces and environment. Both people must be lit by the same single sunset light and sit in the same focal plane and grain.

Framing and pose: a candid shot framed from the heads down to roughly the knees or mid-thigh - NOT tiny distant full-body figures and NOT tight face close-ups. The two stand or sit casually together against the sunset and the panelki, slightly off-center, relaxed natural posture, hands in pockets or loosely at the sides, looking at the camera or slightly away. Not model poses, no outstretched arm, no phone in hand, no mirror.

ANATOMY AND PROPORTIONS (critical): render fully correct, natural human anatomy for both. Each head must be in correct, realistic proportion to its neck and body, with normal shoulder width and natural limb and torso length, and both people at consistent, believable scale relative to each other. No oversized or undersized heads, no wrong head-to-body ratio, no shrunken or elongated bodies, no warped or melted proportions, no distorted limbs or hands.

Look and quality: a good-quality amateur 2017 phone photo - natural and candid, NOT a polished studio render and NOT cinematic. Clean and reasonably sharp with crisp, detailed faces, hair and clothing and a clearly readable background; only a faint hint of grain and a warm color cast, slightly uneven natural exposure, flat phone-camera depth with the whole frame in focus (no bokeh, no background blur). Authentic VK vibe but in good, clear resolution. Keep both faces recognizable, lit and textured like the rest of the photo. Realistic detailed skin texture, natural proportions, correct hands.

Avoid: the second / right-hand face less detailed, softer, blurrier or more distorted than the first, one person half-turned away or hidden behind the other, faces at different sharpness or detail, disproportionate oversized or tiny heads, wrong head-to-body ratio, elongated or shrunken bodies, inconsistent scale between the two, warped or unnatural proportions, distorted limbs, pasted or cut-out faces, photoshop composite, sticker faces, faces lit differently from the scene, mismatched white balance or color temperature on faces, faces brighter sharper or cooler than the bodies and background, double lighting, glossy AI skin, beauty filter, glamour retouch, cinematic editorial polish, heavy HDR, oversaturation, selfie framing, outstretched arm, phone or mirror in frame, modern influencer aesthetic, merged or duplicated faces, wrong number of people, distorted faces, deformed hands, text, captions, logos or watermarks.`;

// Анимация для услуг «Фото 2к17» (опциональный шаг по галочке «Анимировать фото»):
// камера медленно пролетает как в клипе, оживает только фон/ветер/свет, персонажи смотрят в камеру.
const PHOTO_2017_ANIMATION_PROMPT =
  'Bring this 2017 photo to life as a short, cinematic B-roll clip, like an establishing shot in a music video. The camera slowly drifts and glides past the scene with a smooth, steady slow dolly / parallax move, as if a videographer is filming a gentle fly-by. The person or people stay still and simply look calmly straight into the camera — almost no movement, only subtle micro-motion: slight natural blinking and faint breathing. Do NOT make them dance, gesture, walk, turn away or change pose or expression. The environment comes alive instead: wind gently moves their hair and clothes, trees, grass and bushes sway softly, the crimson-pink sunset clouds drift slowly, and the warm dusk light shimmers. Keep every face stable, sharp and exactly recognizable in every frame — no morphing, no identity drift, no face replacement, no warping of eyes, mouth or hands. Preserve the original composition, clothing, colours and the warm sunset lighting. Photorealistic, natural film-like motion, smooth, calm and steady.';

export const giftFactoryServices = [
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
          model: { standard: 'gpt-image-2', pro: 'gpt-image-2' },
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
          audio_source: '{{user.trendVideo}}',
          audio_volume: 1,
          audio_fade_in_sec: 0,
          audio_fade_out_sec: 0,
          audio_loop: false,
          keep_original_audio: false,
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
          model: { standard: 'gpt-image-2', pro: 'gpt-image-2' },
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
    slug: 'future-child',
    title: 'Будущий ребёнок',
    shortDesc: 'Покажем, как может выглядеть ребёнок по фото мамы и папы',
    description:
      'Загрузите чёткие фото мамы и папы, выберите пол и возраст ребёнка. Нейросеть соберёт реалистичный портрет с узнаваемыми семейными чертами обоих родителей.',
    category: ServiceCategory.KIDS_HEROES,
    // Себестоимость: nano-banana @2K ($0.08) ≈ 10 коинов
    priceTokens: 69,
    priceCoinsStandard: 69,
    priceCoinsPro: 69,
    costUsd: 0.08,
    coverImage: image('gift-future-child'),
    galleryImages: [image('gift-future-child-1'), image('gift-future-child-2')],
    previewImage: image('gift-future-child-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 4,
    userInputForm: [
      {
        id: 'mother_photo',
        type: 'photo',
        label: 'Фото мамы',
        required: true,
        hint: 'Чёткий портрет: лицо хорошо видно, без очков, маски, сильных теней и фильтров',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'father_photo',
        type: 'photo',
        label: 'Фото папы',
        required: true,
        hint: 'Чёткий портрет: лицо хорошо видно, без очков, маски, сильных теней и фильтров',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'child_gender',
        type: 'select',
        label: 'Пол ребёнка',
        required: true,
        options: [
          { value: 'girl', label: 'Девочка' },
          { value: 'boy', label: 'Мальчик' },
        ],
      },
      {
        id: 'child_age',
        type: 'select',
        label: 'Возраст',
        required: true,
        options: [
          { value: '2', label: '2 года' },
          { value: '7', label: '7 лет' },
          { value: '15', label: '15 лет' },
        ],
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['1:1', '4:3', '3:4'],
        defaultAspect: '1:1',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: '{{user.mother_photo}}',
        params: {
          model: { standard: 'gpt-image-2', pro: 'gpt-image-2' },
          image_urls: ['{{user.father_photo}}'],
          output_format: 'jpg',
          aspect_ratio: '{{user.aspect}}',
          resolution: '2K',
          prompt:
            'Create ONE photorealistic portrait of a {{user.child_age}} year old {{user.child_gender}} child as a creative visualization based on the two parent reference photos: @image_1 is the mother and @image_2 is the father. The child must look biologically plausible as their child, blending recognizable family traits from both parents: face shape, eyes, eyebrows, nose, lips, skin tone, hair color/texture and natural expression. Keep the child age exactly {{user.child_age}} years old and the gender exactly {{user.child_gender}}. Do not copy either parent as an adult, do not make a sibling clone, do not add extra people, do not add text or watermarks. Natural realistic skin texture, clear eyes, believable child proportions, soft everyday lighting, warm studio-quality but not glossy, no plastic smoothing, no caricature, no fantasy styling, no medical prediction framing. The final image should feel like a real family portrait photo with a clean background and maximum realism.',
        },
      },
    ],
  },
  {
    slug: 'old-age-portrait',
    title: 'Я в старости',
    shortDesc: 'Реалистично покажем, как вы можете выглядеть в пожилом возрасте',
    description:
      'Загрузите своё фото, где лицо хорошо видно. Нейросеть аккуратно состарит портрет, сохранив ваши черты, форму лица, взгляд и естественную мимику.',
    category: ServiceCategory.NOSTALGIA,
    // Себестоимость: nano-banana @2K ($0.08) ≈ 10 коинов
    priceTokens: 49,
    priceCoinsStandard: 49,
    priceCoinsPro: 49,
    costUsd: 0.08,
    coverImage: image('gift-old-age-portrait'),
    galleryImages: [image('gift-old-age-portrait-1'), image('gift-old-age-portrait-2')],
    previewImage: image('gift-old-age-portrait-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 5,
    userInputForm: [
      {
        id: 'portrait',
        type: 'photo',
        label: 'Ваше фото',
        required: true,
        hint: 'Чёткий портрет анфас или лёгкий поворот: лицо открыто, без очков, маски, сильных теней и фильтров',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['1:1', '4:3', '3:4'],
        defaultAspect: '1:1',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: '{{user.portrait}}',
        params: {
          model: { standard: 'gpt-image-2', pro: 'gpt-image-2' },
          output_format: 'jpg',
          aspect_ratio: '{{user.aspect}}',
          resolution: '2K',
          prompt:
            'Transform the person in the reference photo into a realistic older version at about 75-85 years old while preserving the exact identity. Keep the same person, same gender, ethnicity, face geometry, eye shape, nose, mouth, eyebrows, recognizable smile/gaze, hairstyle logic and overall personality. Add believable age details: natural wrinkles, softer skin elasticity, subtle age spots, grey or silver hair where appropriate, mature facial structure, but no caricature and no horror look. Do not change the person into someone else, do not beautify into a generic model, do not add extra people, text or watermark. Photorealistic portrait, natural everyday light, clear face, realistic skin texture, no plastic smoothing, no AI-gloss, no excessive makeup, no dramatic studio retouch. The result should look like an authentic future portrait photo of the same person.',
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
          model: { standard: 'gpt-image-2', pro: 'gpt-image-2' },
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
  {
    slug: 'last-kiss-meteor',
    title: 'Последний поцелуй',
    shortDesc: 'Киносцена на берегу моря: ссора, метеорит, волна и примиряющий поцелуй',
    description:
      'Загрузите по фото девушки и парня — нейросеть соберёт кинематографичный ролик одним непрерывным кадром: пара спорит на берегу моря, в небе вспыхивает метеорит и падает в воду, большая волна идёт к берегу, герои осознают силу момента, мирятся и целуются, а морская пена накрывает кадр как драматичный кино-переход. Генерируется на Seedance 2.0 с переносом двух людей и нативным звуком.',
    category: ServiceCategory.TRENDS_MEMES,
    // Себестоимость: seedance-2 omni 10s @720p ($0.2/сек * 10 = $2.0) ≈ 160 коинов
    priceTokens: 199,
    priceCoinsStandard: 199,
    priceCoinsPro: 199,
    costUsd: 2.0,
    coverImage: image('gift-last-kiss'),
    galleryImages: [image('gift-last-kiss-1'), image('gift-last-kiss-2')],
    previewImage: image('gift-last-kiss-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 5,
    userInputForm: [
      {
        id: 'photo_her',
        type: 'photo',
        label: 'Фото девушки',
        required: true,
        hint: 'Чёткий портрет анфас даёт лучший перенос лица',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'photo_him',
        type: 'photo',
        label: 'Фото парня',
        required: true,
        hint: 'Чёткий портрет анфас даёт лучший перенос лица',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'duration',
        type: 'duration',
        label: 'Длительность видео',
        required: false,
        durationOptions: [8, 10, 15],
        defaultDuration: 10,
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['9:16', '16:9'],
        defaultAspect: '9:16',
      },
      {
        id: 'music',
        type: 'audio',
        label: 'Своя музыка (необязательно)',
        required: false,
        hint: 'MP3/WAV до 25MB. Если не добавить — останется кинозвук со взрывом.',
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
        blockSlug: 'text-to-video',
        input: '{{user.photo_her}}',
        params: {
          model: { standard: 'seedance-2-omni', pro: 'seedance-2-omni' },
          mode: 'omni_reference',
          image_urls: ['{{user.photo_her}}', '{{user.photo_him}}'],
          duration: '{{user.duration}}',
          aspect_ratio: '{{user.aspect}}',
          resolution: '720p',
          seed: 284917,
          prompt:
            'Ultra-cinematic photorealistic dramatic romance video, captured as ONE single continuous unbroken take from one steady wide camera position. No cuts, no edits, no scene changes, no angle changes, no jump cuts: the whole story happens inside one continuous frame. The camera is locked off with only a very slow smooth push-in during the kiss. Location: a real ocean shore at stormy golden-hour dusk, wet sand, dark blue sea, wind moving hair and clothing, natural waves rolling in. In frame the entire time: an adult woman with the exact face and identity of @image_1 and an adult man with the exact face and identity of @image_2; preserve their real facial features, skin tone, hair, age and identity consistently for the whole video. Generate tasteful seaside clothing: the woman wears an elegant flowing light summer dress or beach jacket, the man wears a light short-sleeve summer shirt and casual shorts or linen trousers. The action unfolds continuously in one shot: first they have an emotional argument with tense gestures and hurt expressions, but no physical aggression; then far behind them a bright meteor crosses the sky and lands in the open sea, creating a spectacular cinematic plume of light, steam, sparks and a huge ocean wave on the horizon; they turn to look at it, then look back at each other, their expressions soften into love and forgiveness, they embrace and share a romantic kiss; the wave reaches the shore as dramatic sea spray and white foam, washing over the foreground and briefly covering the couple and the lens like a clean movie transition. Keep the scene PG-13, romantic and symbolic, with no graphic harm, no panic close-ups and no disturbing details. Maximum realism, real physics, realistic water, volumetric sunset light, sea mist, glowing embers in the distance, dramatic sky, filmic color grading, subtle film grain, premium cinema lens.',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'video-compose',
        input: '{{step_1.output}}',
        params: {
          watermark: false,
          title: 'Allvision',
          audio_source: '{{user.music}}',
          audio_volume: 0.6,
          audio_fade_in_sec: 1,
          audio_fade_out_sec: 2,
          audio_loop: true,
          keep_original_audio: true,
        },
      },
    ],
  },
  {
    slug: 'single-photo-2017',
    title: 'Фото в стиле 2к17',
    shortDesc: 'Реалистичное фото 1 или 2 человек в эстетике СНГ-2017',
    description:
      'Загрузите одно или два фото — нейросеть перенесёт вас в атмосферу 2016–2017: двор, панельки, олимпийка или худи, малиновый закат и живой телефонный свет без мыльной AI-графики. Одно фото — один человек, два фото — двое друзей на одном кадре. По желанию оживим результат.',
    category: ServiceCategory.NOSTALGIA,
    priceTokens: 39,
    priceCoinsStandard: 39,
    priceCoinsPro: 39,
    costUsd: 0.1,
    coverImage: image('gift-single-2017'),
    galleryImages: [image('gift-single-2017-1'), image('gift-single-2017-2')],
    previewImage: image('gift-single-2017-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 6,
    userInputForm: [
      {
        id: 'person1',
        type: 'photo',
        label: 'Фото 1 (обязательно)',
        required: true,
        hint: 'Чёткий портрет: лицо крупно и хорошо видно, примерно по грудь',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'person2',
        type: 'photo',
        label: 'Фото 2 (необязательно)',
        required: false,
        hint: 'Добавьте второго человека — сделаем фото на двоих. Можно не добавлять.',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['1:1', '3:4', '9:16', '16:9'],
        defaultAspect: '3:4',
      },
      {
        id: 'animate',
        type: 'checkbox',
        label: 'Анимировать фото (оживить)',
        required: false,
        defaultChecked: false,
        // 2×2 матрица цен: (1 чел / 2 чел) × (без анимации / с анимацией).
        secondaryField: 'person2',
        priceCoinsUnchecked: 39, // 1 человек, без анимации
        priceCoinsChecked: 99, // 1 человек, с анимацией
        priceCoinsUncheckedSecondary: 49, // 2 человека, без анимации
        priceCoinsCheckedSecondary: 119, // 2 человека, с анимацией
        hint: 'Сначала создадим фото, затем Kling 3.0 мягко оживит его: камера медленно пролетает как в клипе, фон, ветер и свет двигаются, а вы просто смотрите в кадр. Результат — короткое видео.',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'photo-2017',
        input: '{{user.person1}}',
        params: {
          model: { standard: 'gpt-image-2', pro: 'gpt-image-2' },
          image_urls: ['{{user.person2}}'],
          output_format: 'jpg',
          aspect_ratio: '{{user.aspect}}',
          resolution: '4K',
          quality: 'high',
          prompt_one: PHOTO_2017_PROMPT_ONE,
          prompt_two: PHOTO_2017_PROMPT_TWO,
          animate: '{{user.animate}}',
          video_model: 'kling-3-pro',
          duration: 5,
          animation_prompt: PHOTO_2017_ANIMATION_PROMPT,
        },
      },
    ],
  },
  {
    slug: 'group-photo-2017',
    title: 'Групповое фото в стиле 2к17',
    shortDesc: 'Соберём компанию друзей на одном фото в эстетике СНГ-2017',
    description:
      'Загрузите фото 2–4 друзей — нейросеть соберёт одно групповое фото в духе 2016–2017: олимпийки и Thrasher, малиновый закат, дворы, телефонная резкость и живой вечерний свет без студийной обработки. Лица сохраняются с ваших фотографий.',
    category: ServiceCategory.NOSTALGIA,
    // Себестоимость: GPT Image 2 standard ≈ $0.10
    priceTokens: 49,
    priceCoinsStandard: 49,
    priceCoinsPro: 49,
    costUsd: 0.1,
    coverImage: image('gift-group-2017'),
    galleryImages: [image('gift-group-2017-1'), image('gift-group-2017-2')],
    previewImage: image('gift-group-2017-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    // Объединено в единую услугу single-photo-2017 «Фото в стиле 2к17» (1 или 2 человека).
    isActive: false,
    isFeatured: false,
    sortOrder: 7,
    userInputForm: [
      {
        id: 'friend_1',
        type: 'photo',
        label: 'Друг 1 (обязательно)',
        required: true,
        hint: 'Портрет анфас',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'friend_2',
        type: 'photo',
        label: 'Друг 2 (обязательно)',
        required: true,
        hint: 'Портрет анфас',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'friend_3',
        type: 'photo',
        label: 'Друг 3 (необязательно)',
        required: false,
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'friend_4',
        type: 'photo',
        label: 'Друг 4 (необязательно)',
        required: false,
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['1:1', '16:9', '9:16'],
        defaultAspect: '1:1',
      },
      {
        id: 'animate',
        type: 'checkbox',
        label: 'Анимировать фото (оживить)',
        required: false,
        defaultChecked: false,
        priceCoinsUnchecked: 49,
        priceCoinsChecked: 119,
        hint: 'Сначала создадим групповое фото, затем Kling 3.0 мягко оживит его: камера медленно пролетает как в клипе, фон, ветер и свет двигаются, а вы просто смотрите в кадр. Результат — короткое видео.',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: '{{user.friend_1}}',
        params: {
          model: { standard: 'gpt-image-2', pro: 'gpt-image-2' },
          image_urls: ['{{user.friend_2}}', '{{user.friend_3}}', '{{user.friend_4}}'],
          output_format: 'jpg',
          aspect_ratio: '{{user.aspect}}',
          resolution: '4K',
          quality: 'high',
          prompt: `GPT Image 2 edit. You are given several reference images. Each uploaded reference image is ONE separate real person. Create one new photorealistic group photo from the CIS / post-Soviet summer of 2016-2017, the nostalgic VK era.

CRITICAL identity and count rules:
- The number of people in the result MUST exactly equal the number of provided reference images: 2 references means exactly 2 people, 3 references means exactly 3 people, 4 references means exactly 4 people.
- Each person must be reproduced exactly and recognizably from their OWN reference image: same face shape, eyes, eyebrows, nose, mouth, jawline, hairstyle, hair color, skin tone, age and natural expression. Treat every reference as a distinct individual.
- Do NOT blend, average, mix or swap faces between people. Do NOT duplicate the same person, do NOT invent extra people, do NOT add background friends, crowds or faces on posters. Keep each face sharp, clearly separated and recognizable.

It must look like a real amateur phone snapshot taken by a friend from a few meters away, never a selfie. The group stands or sits close together, relaxed and natural, in an ordinary post-Soviet courtyard at dusk.

MANDATORY wardrobe change for everyone: replace whatever each person is wearing in their reference with authentic 2016-2017 raion (двор) street style - adidas-style retro track jackets (олимпийки) with side stripes, Thrasher-style flame-logo hoodies, plain dark hoodies or tracksuit tops, dark tracksuit pants or fitted jeans, white sneakers, optional caps or beanies. Vary the outfits naturally between people. Never keep the original clothing.

Scene: grey panel apartment blocks (панельки / хрущёвки) in the background, asphalt, benches, metal garages, workout bars, old parked cars, a simple playground. Strong малиновый закат: a crimson-pink-purple sunset gradient sky glowing behind the buildings, warm low sunlight, long soft shadows.

LIGHTING AND INTEGRATION (critical - this is the most important rule): the entire photo must share ONE single coherent light situation - the warm crimson-pink sunset light plus soft cool dusk ambient. EVERY face and body MUST be fully re-lit and color-graded to match this exact light: a warm rim/edge light on hair, cheeks and shoulders coming from the glowing sky, soft warm-to-neutral fill on the faces, and the SAME white balance, color temperature, exposure, contrast, softness and grain across all people and the background. Everyone must look genuinely photographed together standing in this courtyard at this moment, their skin tones blended into the warm dusk grade while staying recognizable. Do NOT keep the original lighting or color of the reference faces. Strictly avoid a pasted, cut-out, sticker or photoshop-composite look: no face may be brighter, sharper, cleaner, cooler or a different color than the others or than the scene, and there must be no mismatch between faces and environment. All people must be lit by the same single sunset light and sit in the same focal plane and grain.

Framing and pose: a candid group shot framed from the heads down to roughly the knees or mid-thigh - NOT tiny distant full-body figures and NOT tight face close-ups. People stand or sit casually together against the sunset and the panelki, slightly off-center, relaxed natural posture, hands in pockets or loosely at the sides, looking at the camera or slightly away. Not model poses, no outstretched arm, no phone in hand, no mirror.

ANATOMY AND PROPORTIONS (critical): render fully correct, natural human anatomy for everyone. Each head must be in correct, realistic proportion to its neck and body, with normal shoulder width and natural limb and torso length, and all people at consistent, believable scale relative to each other. No oversized or undersized heads, no wrong head-to-body ratio, no shrunken or elongated bodies, no warped or melted proportions, no distorted limbs or hands.

Look and quality: a REAL amateur 2017 smartphone photo, not a polished studio render. Slightly soft focus, mild sensor noise and grain applied evenly across the WHOLE frame including all faces, slightly uneven natural exposure, warm color cast, simple flat phone-camera depth, authentic imperfect VK vibe. Keep every FACE recognizable but lit and textured like the rest of the photo. Realistic skin texture, natural proportions, correct hands.

Avoid: disproportionate oversized or tiny heads, wrong head-to-body ratio, elongated or shrunken bodies, inconsistent scale between people, warped or unnatural proportions, distorted limbs, pasted or cut-out faces, photoshop composite, sticker faces, faces lit differently from the scene, mismatched white balance or color temperature on faces, faces brighter sharper or cooler than the bodies and background, double lighting, glossy AI skin, beauty filter, glamour retouch, cinematic editorial polish, heavy HDR, oversaturation, selfie framing, outstretched arm, phone or mirror in frame, modern influencer aesthetic, merged or duplicated faces, wrong number of people, distorted faces, deformed hands, text, captions, logos or watermarks.`,
        },
      },
      {
        id: 'step_2',
        blockSlug: 'image-to-video',
        input: '{{step_1.output}}',
        // Conditional: runs only when the user ticked "animate".
        when: { field: 'animate', value: 'true' },
        params: {
          model: { standard: 'kling-3-pro', pro: 'kling-3-pro' },
          duration: 5,
          aspect_ratio: '{{user.aspect}}',
          prompt: PHOTO_2017_ANIMATION_PROMPT,
        },
      },
    ],
  },
  {
    slug: 'face-in-trend-pro',
    title: 'Я в трендовом видео Kling 3.0',
    shortDesc: 'Загрузите фото и видео до 15 сек: по умолчанию Kling 3.0 Motion Control, опционально face-swap',
    description:
      'Загрузите фото и своё трендовое видео до 15 секунд. По умолчанию Kling 3.0 Motion Control оживит фото по движениям из видео, длина результата будет равна длине видео-референса. Если нужно, можно выбрать face-swap: тогда лицо будет вставлено в исходный ролик. Финальный звук всегда берётся из загруженного видео-референса.',
    category: ServiceCategory.TRENDS_MEMES,
    // Себестоимость зависит от режима: Qubico face-swap или Kling Motion Control 3.0.
    priceTokens: 159,
    priceCoinsStandard: 159,
    priceCoinsPro: 159,
    costUsd: 1.6,
    coverImage: image('gift-trend-pro'),
    galleryImages: [image('gift-trend-pro-1'), image('gift-trend-pro-2')],
    previewImage: image('gift-trend-pro-preview'),
    previewVideo: trendVideo(2),
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 7,
    userInputForm: [
      {
        id: 'transferMode',
        type: 'select',
        label: 'Способ генерации',
        required: false,
        hint: 'Если не выбирать режим, используется Kling 3.0 Motion Control.',
        options: [
          { value: 'motion_transfer', label: 'Kling 3.0 Motion Control' },
          { value: 'face_swap', label: 'Face-swap' },
        ],
      },
      {
        id: 'face',
        type: 'photo',
        label: 'Ваше фото',
        required: true,
        hint: 'Для переноса лица нужен чёткий портрет. Для повторения движений лучше фото человека по пояс или в полный рост, лицо открыто и хорошо видно.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'userVideo',
        type: 'video',
        label: 'Ваше видео (тренд)',
        required: true,
        hint: 'Загрузите видео-тренд: MP4/MOV, до 15 сек',
        maxSizeMb: 50,
        maxDurationSec: 15,
        allowedFormats: ['mp4', 'webm', 'mov'],
        allowUserUpload: true,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'trend-video-transfer',
        input: '{{user.face}}',
        params: {
          mode: '{{user.transferMode}}',
          default_mode: 'motion_transfer',
          people_count: 'one',
          reference_video: '{{user.userVideo}}',
          primary_photo: '{{user.face}}',
          duration_from_reference: true,
          face_swap_model: 'qubico-video-toolkit',
          motion_model: 'kling-motion-3.0-std',
          aspect_ratio: '9:16',
          resolution: '720p',
          prompt:
            'Repeat the main person motion from the reference trend video while preserving the uploaded person identity. Natural body movement, stable face, realistic lighting, vertical social-video framing.',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'video-compose',
        input: '{{step_1.output}}',
        params: {
          watermark: false,
          title: 'Allvision trend',
          audio_source: '{{user.userVideo}}',
          audio_volume: 1,
          audio_fade_in_sec: 0,
          audio_fade_out_sec: 0,
          audio_loop: false,
          keep_original_audio: false,
        },
      },
    ],
  },
  {
    slug: 'face-in-trend-seedance-2',
    title: 'Я в трендовом видео Seedance 2.0',
    shortDesc: 'Загрузите фото и видео до 15 сек: по умолчанию Seedance 2, опционально face-swap',
    description:
      'Загрузите фото и своё трендовое видео до 15 секунд. По умолчанию Seedance 2 использует видео как референс движения, камеры и сцены, а фото — как референс личности. Длина результата равна длине видео-референса. Если нужно, можно выбрать face-swap. Финальный звук всегда берётся из загруженного видео-референса.',
    category: ServiceCategory.TRENDS_MEMES,
    priceTokens: 159,
    priceCoinsStandard: 159,
    priceCoinsPro: 159,
    costUsd: 1.5,
    coverImage: image('gift-trend-pro'),
    galleryImages: [image('gift-trend-pro-1'), image('gift-trend-pro-2')],
    previewImage: image('gift-trend-pro-preview'),
    previewVideo: trendVideo(2),
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 8,
    userInputForm: [
      {
        id: 'transferMode',
        type: 'select',
        label: 'Способ генерации',
        required: false,
        hint: 'Если не выбирать режим, используется Seedance 2.',
        options: [
          { value: 'seedance_omni', label: 'Seedance 2' },
          { value: 'face_swap', label: 'Face-swap' },
        ],
      },
      {
        id: 'face',
        type: 'photo',
        label: 'Ваше фото',
        required: true,
        hint: 'Лучше фото человека по пояс или в полный рост, лицо открыто и хорошо видно.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'userVideo',
        type: 'video',
        label: 'Ваше видео (тренд)',
        required: true,
        hint: 'Загрузите видео-тренд: MP4/MOV, до 15 сек',
        maxSizeMb: 50,
        maxDurationSec: 15,
        allowedFormats: ['mp4', 'webm', 'mov'],
        allowUserUpload: true,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'trend-video-transfer',
        input: '{{user.face}}',
        params: {
          mode: '{{user.transferMode}}',
          default_mode: 'seedance_omni',
          people_count: 'one',
          reference_video: '{{user.userVideo}}',
          primary_photo: '{{user.face}}',
          duration_from_reference: true,
          seedance_model: 'seedance-2-omni',
          face_swap_model: 'qubico-video-toolkit',
          aspect_ratio: '9:16',
          resolution: '720p',
          prompt:
            'Use @video1 as the motion, timing, camera and scene reference. Use @image1 as the identity reference for the only main person. Keep exactly one person, preserve the uploaded identity consistently, do not copy the face from the source video, no text, no watermark. Photorealistic vertical social video with natural movement and stable face.',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'video-compose',
        input: '{{step_1.output}}',
        params: {
          watermark: false,
          title: 'Allvision Seedance trend',
          audio_source: '{{user.userVideo}}',
          audio_volume: 1,
          audio_fade_in_sec: 0,
          audio_fade_out_sec: 0,
          audio_loop: false,
          keep_original_audio: false,
        },
      },
    ],
  },
  {
    slug: 'duo-trend-pro',
    title: 'Мы в трендовом видео Kling 3.0 (Motion control)',
    shortDesc: 'Два фото и видео до 15 сек: по умолчанию Kling 3.0 Motion Control, опционально face-swap',
    description:
      'Загрузите два чётких фото и своё видео до 15 секунд, где в кадре строго два человека. По умолчанию Allvision соберёт общий кадр с двумя людьми и передаст движение через Kling 3.0 Motion Control. Если нужно, можно выбрать face-swap: система последовательно заменит левое и правое лицо в исходном ролике. Длина результата равна длине видео-референса, финальный звук всегда берётся из него.',
    category: ServiceCategory.TRENDS_MEMES,
    // Себестоимость зависит от режима: последовательный Qubico face-swap или Nano Banana + Kling Motion Control 3.0.
    priceTokens: 169,
    priceCoinsStandard: 169,
    priceCoinsPro: 169,
    costUsd: 1.6,
    coverImage: image('gift-duo-trend'),
    galleryImages: [image('gift-duo-trend-1'), image('gift-duo-trend-2')],
    previewImage: image('gift-duo-trend-preview'),
    previewVideo: trendVideo(3),
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 9,
    userInputForm: [
      {
        id: 'transferMode',
        type: 'select',
        label: 'Способ генерации',
        required: false,
        hint: 'Если не выбирать режим, используется Kling 3.0 Motion Control.',
        options: [
          { value: 'motion_transfer', label: 'Kling 3.0 Motion Control' },
          { value: 'face_swap', label: 'Face-swap' },
        ],
      },
      {
        id: 'face_left',
        type: 'photo',
        label: 'Фото для героя слева',
        required: true,
        hint: 'Чёткий портрет анфас',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'face_right',
        type: 'photo',
        label: 'Фото для героя справа',
        required: true,
        hint: 'Чёткий портрет анфас',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'userVideo',
        type: 'video',
        label: 'Ваше видео (тренд с двумя людьми)',
        required: true,
        hint: 'Важно: в видео должно быть строго 2 человека. MP4/MOV, до 15 сек, оба человека хорошо видны.',
        maxSizeMb: 50,
        maxDurationSec: 15,
        allowedFormats: ['mp4', 'webm', 'mov'],
        allowUserUpload: true,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'trend-video-transfer',
        input: '{{user.face_left}}',
        params: {
          mode: '{{user.transferMode}}',
          default_mode: 'motion_transfer',
          people_count: 'two',
          reference_video: '{{user.userVideo}}',
          primary_photo: '{{user.face_left}}',
          secondary_photo: '{{user.face_right}}',
          duration_from_reference: true,
          face_swap_model: 'qubico-video-toolkit',
          motion_model: 'kling-motion-3.0-std',
          portrait_model: 'gpt-image-2',
          target_faces_index_left: '0',
          target_faces_index_right: '1',
          aspect_ratio: '9:16',
          resolution: '720p',
          prompt:
            'Repeat the two-person motion from the reference trend video. Keep exactly two people, preserve left and right identities, natural body movement, stable faces, vertical social-video framing.',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'video-compose',
        input: '{{step_1.output}}',
        params: {
          watermark: false,
          title: 'Allvision trend',
          audio_source: '{{user.userVideo}}',
          audio_volume: 1,
          audio_fade_in_sec: 0,
          audio_fade_out_sec: 0,
          audio_loop: false,
          keep_original_audio: false,
        },
      },
    ],
  },
  {
    slug: 'duo-trend-kling-omni',
    title: 'Мы в трендовом видео Kling 3.0 (Omni reference)',
    shortDesc: 'Два фото и видео до 15 сек: по умолчанию Kling 3.0 Omni reference, опционально face-swap',
    description:
      'Загрузите два чётких фото и своё видео до 15 секунд, где в кадре строго два человека. По умолчанию Kling 3.0 Omni reference получает видео как референс движения, камеры и сцены, а два фото — как референсы лиц для левого и правого героя. Если нужно, можно выбрать face-swap. Длина результата равна длине видео-референса, финальный звук всегда берётся из него.',
    category: ServiceCategory.TRENDS_MEMES,
    priceTokens: 199,
    priceCoinsStandard: 199,
    priceCoinsPro: 199,
    costUsd: 2.0,
    coverImage: image('gift-duo-kling-omni'),
    galleryImages: [image('gift-duo-kling-omni-1'), image('gift-duo-kling-omni-2')],
    previewImage: image('gift-duo-kling-omni-preview'),
    previewVideo: trendVideo(3),
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 10,
    userInputForm: [
      {
        id: 'transferMode',
        type: 'select',
        label: 'Способ генерации',
        required: false,
        hint: 'Если не выбирать режим, используется Kling 3.0 Omni reference.',
        options: [
          { value: 'kling_omni', label: 'Kling 3.0 Omni reference' },
          { value: 'face_swap', label: 'Face-swap' },
        ],
      },
      {
        id: 'face_left',
        type: 'photo',
        label: 'Фото для героя слева',
        required: true,
        hint: 'Чёткий портрет анфас: лицо открыто, без очков и сильной тени.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'face_right',
        type: 'photo',
        label: 'Фото для героя справа',
        required: true,
        hint: 'Чёткий портрет анфас: лицо открыто, без очков и сильной тени.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'userVideo',
        type: 'video',
        label: 'Видео с двумя людьми',
        required: true,
        hint: 'Важно: в видео должно быть строго 2 человека, левый и правый герой хорошо видны. MP4/MOV, до 15 сек.',
        maxSizeMb: 50,
        maxDurationSec: 15,
        allowedFormats: ['mp4', 'webm', 'mov'],
        allowUserUpload: true,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'trend-video-transfer',
        input: '{{user.face_left}}',
        params: {
          mode: '{{user.transferMode}}',
          default_mode: 'kling_omni',
          people_count: 'two',
          reference_video: '{{user.userVideo}}',
          primary_photo: '{{user.face_left}}',
          secondary_photo: '{{user.face_right}}',
          duration_from_reference: true,
          face_swap_model: 'qubico-video-toolkit',
          kling_omni_model: 'kling-3-omni',
          aspect_ratio: '9:16',
          resolution: '720p',
          enable_audio: false,
          keep_original_audio: false,
          prefer_multi_shots: false,
          prompt:
            'Use @video as the exact motion, timing, camera, background, rhythm and scene reference. Use @image_1 as the identity reference for the LEFT person and @image_2 as the identity reference for the RIGHT person. Keep exactly two people in the result, matching the two people in the reference video positions. Do not add, remove, duplicate or merge people. Preserve each identity separately with strong likeness: face shape, eyes, nose, mouth, eyebrows, hair, skin tone and natural expression. Do not swap sides, do not blend faces, do not copy the original faces from @video. Keep the original action and framing from @video, adapt clothing and body proportions naturally when needed. Photorealistic vertical social video, stable identities across every frame, natural motion, believable lighting, no text, no watermark.',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'video-compose',
        input: '{{step_1.output}}',
        params: {
          watermark: false,
          title: 'Allvision Kling Omni trend',
          audio_source: '{{user.userVideo}}',
          audio_volume: 1,
          audio_fade_in_sec: 0,
          audio_fade_out_sec: 0,
          audio_loop: false,
          keep_original_audio: false,
        },
      },
    ],
  },
  {
    slug: 'duo-trend-seedance-2',
    title: 'Мы в трендовом видео Seedance 2.0',
    shortDesc: 'Два фото и видео до 15 сек: по умолчанию Seedance 2, опционально face-swap',
    description:
      'Загрузите два чётких фото и своё видео до 15 секунд, где в кадре строго два человека. По умолчанию Seedance 2 использует видео как референс движения, камеры и сцены, а два фото — как референсы личностей для левого и правого героя. Если нужно, можно выбрать face-swap. Длина результата равна длине видео-референса, финальный звук всегда берётся из него.',
    category: ServiceCategory.TRENDS_MEMES,
    priceTokens: 189,
    priceCoinsStandard: 189,
    priceCoinsPro: 189,
    costUsd: 1.9,
    coverImage: image('gift-duo-kling-omni'),
    galleryImages: [image('gift-duo-kling-omni-1'), image('gift-duo-kling-omni-2')],
    previewImage: image('gift-duo-kling-omni-preview'),
    previewVideo: trendVideo(3),
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 11,
    userInputForm: [
      {
        id: 'transferMode',
        type: 'select',
        label: 'Способ генерации',
        required: false,
        hint: 'Если не выбирать режим, используется Seedance 2.',
        options: [
          { value: 'seedance_omni', label: 'Seedance 2' },
          { value: 'face_swap', label: 'Face-swap' },
        ],
      },
      {
        id: 'face_left',
        type: 'photo',
        label: 'Фото для героя слева',
        required: true,
        hint: 'Чёткий портрет анфас: лицо открыто, без очков и сильной тени.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'face_right',
        type: 'photo',
        label: 'Фото для героя справа',
        required: true,
        hint: 'Чёткий портрет анфас: лицо открыто, без очков и сильной тени.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'userVideo',
        type: 'video',
        label: 'Видео с двумя людьми',
        required: true,
        hint: 'Важно: в видео должно быть строго 2 человека, левый и правый герой хорошо видны. MP4/MOV, до 15 сек.',
        maxSizeMb: 50,
        maxDurationSec: 15,
        allowedFormats: ['mp4', 'webm', 'mov'],
        allowUserUpload: true,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'trend-video-transfer',
        input: '{{user.face_left}}',
        params: {
          mode: '{{user.transferMode}}',
          default_mode: 'seedance_omni',
          people_count: 'two',
          reference_video: '{{user.userVideo}}',
          primary_photo: '{{user.face_left}}',
          secondary_photo: '{{user.face_right}}',
          duration_from_reference: true,
          seedance_model: 'seedance-2-omni',
          face_swap_model: 'qubico-video-toolkit',
          target_faces_index_left: '0',
          target_faces_index_right: '1',
          aspect_ratio: '9:16',
          resolution: '720p',
          prompt:
            'Use @video1 as the motion, timing, camera and scene reference. Use @image1 as the identity reference for the LEFT person and @image2 as the identity reference for the RIGHT person. Keep exactly two people, preserve left and right identities separately, do not swap sides, do not blend faces, do not copy identities from the source video, no text, no watermark. Photorealistic vertical social video with natural motion and stable faces.',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'video-compose',
        input: '{{step_1.output}}',
        params: {
          watermark: false,
          title: 'Allvision Seedance duo trend',
          audio_source: '{{user.userVideo}}',
          audio_volume: 1,
          audio_fade_in_sec: 0,
          audio_fade_out_sec: 0,
          audio_loop: false,
          keep_original_audio: false,
        },
      },
    ],
  },
  {
    slug: 'toxis-dance',
    title: 'Танец токсиса',
    shortDesc: 'Загрузите фото — под капотом Kling 3.0 Motion Control повторит танец токсиса',
    description:
      'Загрузите фото человека по пояс или в полный рост. Allvision использует готовый референс танца токсиса и Kling 3.0 Motion Control, чтобы оживить фото по этому движению. Длина результата равна длине референса, финальный звук берётся из него.',
    category: ServiceCategory.TRENDS_MEMES,
    priceTokens: 119,
    priceCoinsStandard: 119,
    priceCoinsPro: 119,
    costUsd: 1.2,
    coverImage: image('gift-toxis-dance'),
    galleryImages: [image('gift-toxis-dance-1'), image('gift-toxis-dance-2')],
    previewImage: image('gift-toxis-dance-preview'),
    previewVideo: trendVideo(1),
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 12,
    userInputForm: [
      {
        id: 'subject_type',
        type: 'select',
        label: 'Кто на фото?',
        required: true,
        hint: 'Человек — точный перенос движения (Kling Motion 3.0 Pro). Животное — сохраняем анатомию (Wan Motion).',
        options: [
          { value: 'human', label: 'Человек' },
          { value: 'animal', label: 'Животное' },
        ],
      },
      {
        id: 'face',
        type: 'photo',
        label: 'Ваше фото',
        required: true,
        hint: 'Лучше фото по пояс или в полный рост, объект открыт и хорошо виден.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'trend-video-transfer',
        input: '{{user.face}}',
        params: {
          mode: 'motion_transfer',
          default_mode: 'motion_transfer',
          people_count: 'one',
          subject_type: '{{user.subject_type}}',
          reference_video: trendVideo(1),
          primary_photo: '{{user.face}}',
          duration_from_reference: true,
          face_swap_model: 'qubico-video-toolkit',
          motion_model: 'kling-motion-3.0-pro',
          aspect_ratio: '9:16',
          resolution: '720p',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'video-compose',
        input: '{{step_1.output}}',
        params: {
          watermark: false,
          title: 'Allvision dance',
          audio_source: trendVideo(1),
          audio_volume: 1,
          audio_fade_in_sec: 0,
          audio_fade_out_sec: 0,
          audio_loop: false,
          keep_original_audio: false,
        },
      },
    ],
  },
  {
    slug: 'duo-reference-dance',
    title: 'Танец на двоих',
    shortDesc: 'Два человека в фиксированном танцевальном референсе: перенос лиц или повторение движений',
    description:
      'Загрузите два фото и выберите способ генерации. Референсное видео уже задано в услуге и должно содержать строго двух людей. В режиме переноса лиц система заменит левое и правое лицо. В режиме повторения движений Allvision соберёт общий кадр с двумя людьми и передаст движение через Kling Motion Control.',
    category: ServiceCategory.TRENDS_MEMES,
    priceTokens: 149,
    priceCoinsStandard: 149,
    priceCoinsPro: 149,
    costUsd: 1.6,
    coverImage: image('gift-duo-reference-dance'),
    galleryImages: [image('gift-duo-reference-dance-1'), image('gift-duo-reference-dance-2')],
    previewImage: image('gift-duo-reference-dance-preview'),
    previewVideo: trendVideo(3),
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 11,
    userInputForm: [
      {
        id: 'transferMode',
        type: 'select',
        label: 'Способ генерации',
        required: true,
        options: [
          { value: 'face_swap', label: 'Перенос лиц в видео' },
          { value: 'motion_transfer', label: 'Повторение движений с видео' },
        ],
      },
      {
        id: 'face_left',
        type: 'photo',
        label: 'Фото для героя слева',
        required: true,
        hint: 'Чёткий портрет анфас, лицо открыто и хорошо видно.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'face_right',
        type: 'photo',
        label: 'Фото для героя справа',
        required: true,
        hint: 'Чёткий портрет анфас, лицо открыто и хорошо видно.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'trend-video-transfer',
        input: '{{user.face_left}}',
        params: {
          mode: '{{user.transferMode}}',
          people_count: 'two',
          reference_video: trendVideo(3),
          primary_photo: '{{user.face_left}}',
          secondary_photo: '{{user.face_right}}',
          duration_from_reference: true,
          face_swap_model: 'qubico-video-toolkit',
          motion_model: 'kling-motion-3.0-std',
          portrait_model: 'gpt-image-2',
          target_faces_index_left: '0',
          target_faces_index_right: '1',
          aspect_ratio: '9:16',
          resolution: '720p',
          prompt:
            'Repeat the two-person dance movement from the reference video. Keep exactly two people, preserve left and right identities, natural energetic motion, stable faces, vertical social-video framing.',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'video-compose',
        input: '{{step_1.output}}',
        params: {
          watermark: false,
          title: 'Allvision duo dance',
          audio_source: trendVideo(3),
          audio_volume: 1,
          audio_fade_in_sec: 0,
          audio_fade_out_sec: 0,
          audio_loop: false,
          keep_original_audio: false,
        },
      },
    ],
  },
  {
    slug: 'repeat-motion-from-video',
    title: 'Вы повторяете движения с видео',
    shortDesc: 'Загрузите фото и видео — перенесём движения с видео на фото',
    description:
      'Инструмент Motion Control: загрузите своё фото и видео с движением (танец, жесты), а нейросеть оживит ваше фото, повторяя движения из видео. Лицо берётся с фото, движение — с видео.',
    category: ServiceCategory.TRENDS_MEMES,
    // Себестоимость: kling-motion-3.0-std 5s (~$0.195/сек * 5 = ~$0.98) ≈ 80 коинов
    priceTokens: 99,
    priceCoinsStandard: 99,
    priceCoinsPro: 99,
    costUsd: 0.98,
    coverImage: image('gift-repeat-motion'),
    galleryImages: [image('gift-repeat-motion-1'), image('gift-repeat-motion-2')],
    previewImage: image('gift-repeat-motion-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 12,
    userInputForm: [
      {
        id: 'photo',
        type: 'photo',
        label: 'Ваше фото',
        required: true,
        hint: 'Фото человека в полный рост или по пояс',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'userVideo',
        type: 'video',
        label: 'Видео с движениями',
        required: true,
        hint: 'Танец/жесты, MP4/MOV, до 15 сек',
        maxSizeMb: 50,
        maxDurationSec: 15,
        allowedFormats: ['mp4', 'webm', 'mov'],
        allowUserUpload: true,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'trend-video-transfer',
        input: '{{user.photo}}',
        params: {
          mode: 'motion_transfer',
          people_count: 'one',
          reference_video: '{{user.userVideo}}',
          primary_photo: '{{user.photo}}',
          duration_from_reference: true,
          motion_model: 'kling-motion-3.0-std',
          aspect_ratio: 'auto',
          resolution: '720p',
          prompt:
            'Repeat the movement from the uploaded reference video while preserving the uploaded person identity. Natural body movement, stable face, realistic lighting, same rhythm and timing as the source video.',
        },
      },
      {
        id: 'step_2',
        blockSlug: 'video-compose',
        input: '{{step_1.output}}',
        params: {
          watermark: false,
          title: 'Allvision motion',
          audio_source: '{{user.userVideo}}',
          audio_volume: 1,
          audio_fade_in_sec: 0,
          audio_fade_out_sec: 0,
          audio_loop: false,
          keep_original_audio: false,
        },
      },
    ],
  },
  {
    slug: 'face-in-trend-lite',
    title: 'Я в трендовом видео ЛАЙТ',
    shortDesc: 'Загрузите своё видео и фото лица — быстрый face-swap',
    description:
      'Инструмент: загрузите СВОЁ видео и фото лица — подставим ваше лицо в это видео обычным face-swap. Дешевле и быстрее ПРО-версии; движение и сцена остаются из исходного видео.',
    category: ServiceCategory.TRENDS_MEMES,
    // Себестоимость: Qubico face-swap ~$0.48 (5s * 24fps * $0.004) ≈ 40 коинов
    priceTokens: 59,
    priceCoinsStandard: 59,
    priceCoinsPro: 59,
    costUsd: 0.48,
    coverImage: image('gift-trend-lite'),
    galleryImages: [image('gift-trend-lite-1'), image('gift-trend-lite-2')],
    previewImage: image('gift-trend-lite-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 13,
    userInputForm: [
      {
        id: 'face',
        type: 'photo',
        label: 'Ваше фото лица',
        required: true,
        hint: 'Чёткий портрет анфас',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'userVideo',
        type: 'video',
        label: 'Ваше видео',
        required: true,
        hint: 'MP4/MOV, до 15 сек',
        maxSizeMb: 50,
        maxDurationSec: 15,
        allowedFormats: ['mp4', 'webm', 'mov'],
        allowUserUpload: true,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'face-swap-video',
        input: '{{user.face}}',
        params: {
          model: { standard: 'qubico-video-toolkit', pro: 'qubico-video-toolkit' },
          target_video: '{{user.userVideo}}',
          prompt: 'face swap into the uploaded video',
          duration: 5,
          estimatedFrames: 120,
        },
      },
      {
        id: 'step_2',
        blockSlug: 'video-compose',
        input: '{{step_1.output}}',
        params: {
          watermark: false,
          title: 'Allvision trend',
          audio_source: '{{user.userVideo}}',
          audio_volume: 1,
          audio_fade_in_sec: 0,
          audio_fade_out_sec: 0,
          audio_loop: false,
          keep_original_audio: false,
        },
      },
    ],
  },
  {
    slug: 'me-in-movie',
    title: 'Я в фильме',
    shortDesc: 'Создайте киносцену по промпту или оживите загруженный кадр фильма',
    description:
      'Выберите режим: «По промпту» — опишите киносцену, и Seedance 2.0 создаст ролик; фото пользователя можно добавить как референс внешности, но это необязательно. «По фото» — загрузите кадр фильма или кинематографичную сцену, и Kling 3.0 оживит её; при наличии вашего фото нейросеть аккуратно поместит вас в кадр. Если фото пользователя не добавлено, сервис создаст сцену без сохранения вашей внешности.',
    category: ServiceCategory.CINEMA,
    priceTokens: 120,
    priceCoinsStandard: 120,
    priceCoinsPro: 120,
    costUsd: 2.0,
    coverImage: image('gift-me-in-movie'),
    galleryImages: [image('gift-me-in-movie-1'), image('gift-me-in-movie-2')],
    previewImage: image('gift-me-in-movie-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 20,
    userInputForm: [
      {
        id: 'generation_mode',
        type: 'select',
        label: 'Режим создания',
        required: true,
        defaultValue: 'prompt',
        hint: 'По промпту — Seedance 2.0 создаёт сцену из текста. По фото — Kling 3.0 оживляет загруженный кадр фильма.',
        options: [
          { value: 'prompt', label: 'По промпту' },
          { value: 'photo', label: 'По фото' },
        ],
      },
      {
        id: 'person1',
        type: 'photo',
        label: 'Ваше фото (необязательно)',
        required: false,
        hint: 'Если добавить фото, нейросеть будет сохранять вашу внешность. Без фото будет создана новая сцена без вашего референса.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'scene_photo',
        type: 'photo',
        label: 'Кадр фильма',
        required: false,
        requiredWhen: { field: 'generation_mode', value: 'photo' },
        visibleWhen: { field: 'generation_mode', value: 'photo' },
        mediaGroup: 'scene',
        hint: 'Загрузите кадр фильма или кинематографичную сцену. Kling 3.0 оживит этот кадр.',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: false,
        allowSystemLibrary: false,
      },
      {
        id: 'prompt',
        type: 'textarea',
        label: 'Что должно произойти в сцене',
        required: false,
        requiredWhen: { field: 'generation_mode', value: 'prompt' },
        maxLength: 600,
        placeholder: 'Например: герой входит в неоновый город ночью, камера медленно приближается, дождь отражается в асфальте',
        hint: 'В режиме «По промпту» описание обязательно. В режиме «По фото» можно оставить пустым — модель сама мягко оживит кадр.',
      },
      {
        id: 'duration',
        type: 'duration',
        label: 'Длительность видео',
        required: false,
        hint: 'Kling 3.0 и Seedance 2.0 поддерживают короткие ролики до 15 секунд.',
        durationOptions: [5, 8, 10, 15],
        defaultDuration: 5,
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['auto', '9:16', '16:9', '1:1'],
        defaultAspect: '16:9',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'scene-transfer',
        input: '{{user.person1}}',
        params: {
          model: 'kling-3-omni',
          generation_mode: '{{user.generation_mode}}',
          photo_model: 'kling-3-omni',
          prompt_model: 'seedance-2-omni',
          prompt_text_model: 'seedance-2',
          scene_mode: 'photo',
          scene_image: '{{user.scene_photo}}',
          primary_photo: '{{user.person1}}',
          people_count: 'auto',
          stylize_characters: false,
          photo_base_prompt:
            'Kling 3.0 Omni cinematic photo-to-video. Use the uploaded film still as the exact scene reference: preserve its location, era, composition, lens feeling, lighting, color palette, wardrobe logic, props and atmosphere. If a user photo is provided, integrate that person into the scene as a believable live-action character, not a pasted cutout.',
          prompt_base_prompt:
            'Seedance 2.0 cinematic text-to-video. Create a photorealistic live-action film scene from the user prompt with professional movie camera language: coherent story action, natural blocking, realistic physics, filmic lighting, controlled depth of field, high production value, stable faces and clean motion.',
          character_prompt:
            'When a user photo is provided, preserve identity with high priority: same face structure, eyes, eyebrows, nose, mouth, hairstyle, hair color, skin tone, age impression and natural facial character. Match perspective, scale, shadows and lighting to the scene. Do not beautify, de-age, change gender, duplicate, morph or replace the person.',
          no_reference_prompt:
            'No user photo was provided. Generate the movie scene directly from the prompt/reference frame without preserving any specific real-person identity.',
          user_prompt: '{{user.prompt}}',
          default_photo_prompt:
            'Animate the uploaded film frame with subtle believable movement: gentle camera motion, natural environmental motion, realistic depth and atmosphere. Keep the scene coherent and cinematic.',
          default_prompt_prompt:
            'Create a coherent cinematic scene with clear action, realistic camera movement and polished film lighting.',
          duration: '{{user.duration}}',
          aspect_ratio: '{{user.aspect}}',
          resolution: '720p',
        },
      },
    ],
  },
  {
    slug: 'me-in-cartoon',
    title: 'Я в мультфильме',
    shortDesc: 'Создайте мультсцену по промпту или оживите загруженный кадр мультфильма',
    description:
      'Выберите режим: «По промпту» — опишите мультсцену, и Seedance 2.0 создаст ролик; ваше фото можно добавить как референс внешности, но это необязательно. «По фото» — загрузите кадр мультфильма, и Kling 3.0 оживит его; при наличии вашего фото нейросеть перенесёт вас в мультмир. Можно выбрать визуал персонажа: реалистичный человек в мультфильме или полностью мультяшный персонаж, а также стиль мультфильма.',
    category: ServiceCategory.CINEMA,
    priceTokens: 140,
    priceCoinsStandard: 140,
    priceCoinsPro: 140,
    costUsd: 2.2,
    coverImage: image('gift-me-in-cartoon'),
    galleryImages: [image('gift-me-in-cartoon-1'), image('gift-me-in-cartoon-2')],
    previewImage: image('gift-me-in-cartoon-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 21,
    userInputForm: [
      {
        id: 'generation_mode',
        type: 'select',
        label: 'Режим создания',
        required: true,
        defaultValue: 'prompt',
        hint: 'По промпту — Seedance 2.0 создаёт мультсцену из текста. По фото — Kling 3.0 оживляет загруженный кадр мультфильма.',
        options: [
          { value: 'prompt', label: 'По промпту' },
          { value: 'photo', label: 'По фото' },
        ],
      },
      {
        id: 'person1',
        type: 'photo',
        label: 'Ваше фото (необязательно)',
        required: false,
        hint: 'Если добавить фото, нейросеть сохранит вашу внешность. Без фото будет создана новая мультсцена без вашего референса.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'cartoon_visual_mode',
        type: 'select',
        label: 'Визуал персонажа',
        required: true,
        defaultValue: 'realistic',
        hint: 'Реалистичный — человек остаётся как живой внутри мультмира. Мультяшный — фото превращается в мультперсонажа.',
        options: [
          { value: 'realistic', label: 'Реалистичный' },
          { value: 'cartoon', label: 'Мультяшный' },
        ],
      },
      {
        id: 'cartoon_style',
        type: 'select',
        label: 'Стиль мультфильма',
        required: true,
        defaultValue: 'classic hand-drawn fairy-tale animation: warm color palette, clean expressive linework, soft painterly backgrounds, family adventure mood, elegant character acting',
        options: [
          {
            value: 'classic hand-drawn fairy-tale animation: warm color palette, clean expressive linework, soft painterly backgrounds, family adventure mood, elegant character acting',
            label: 'Классический 2D',
          },
          {
            value: 'modern 3D animated feature style: rounded appealing shapes, polished materials, cinematic lighting, colorful detailed environments, expressive but controlled animation',
            label: 'Современный 3D',
          },
          {
            value: 'anime-inspired cinematic animation: clean cel shading, expressive eyes, dynamic camera angles, detailed backgrounds, dramatic lighting, emotional movement',
            label: 'Аниме',
          },
          {
            value: 'comic-book animation style: bold outlines, graphic shadows, energetic poses, saturated color blocks, stylized motion and cinematic panel composition',
            label: 'Комикс',
          },
          {
            value: 'soft clay stop-motion inspired animation: tactile handmade textures, rounded forms, cozy lighting, gentle whimsical movement, miniature set feeling',
            label: 'Пластилиновый',
          },
        ],
      },
      {
        id: 'scene_photo',
        type: 'photo',
        label: 'Фото-кадр мультфильма',
        required: false,
        requiredWhen: { field: 'generation_mode', value: 'photo' },
        visibleWhen: { field: 'generation_mode', value: 'photo' },
        mediaGroup: 'scene',
        hint: 'Загрузите кадр мультфильма. Kling 3.0 оживит его и, если есть ваше фото, перенесёт персонажа в этот мультмир.',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: false,
        allowSystemLibrary: false,
      },
      {
        id: 'prompt',
        type: 'textarea',
        label: 'Что должно произойти в сцене',
        required: false,
        requiredWhen: { field: 'generation_mode', value: 'prompt' },
        maxLength: 600,
        placeholder: 'Например: герой летит над сказочным городом на светящемся зонте, камера плавно облетает башни',
        hint: 'В режиме «По промпту» описание обязательно. В режиме «По фото» можно оставить пустым — модель сама мягко оживит кадр.',
      },
      {
        id: 'duration',
        type: 'duration',
        label: 'Длительность видео',
        required: false,
        hint: 'Kling 3.0 и Seedance 2.0 поддерживают короткие ролики до 15 секунд.',
        durationOptions: [5, 8, 10, 15],
        defaultDuration: 5,
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['auto', '9:16', '16:9', '1:1'],
        defaultAspect: '9:16',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'scene-transfer',
        input: '{{user.person1}}',
        params: {
          model: 'kling-3-omni',
          generation_mode: '{{user.generation_mode}}',
          photo_model: 'kling-3-omni',
          prompt_model: 'seedance-2-omni',
          prompt_text_model: 'seedance-2',
          scene_mode: 'photo',
          scene_image: '{{user.scene_photo}}',
          primary_photo: '{{user.person1}}',
          people_count: 'auto',
          stylize_characters: false,
          stylize_model: 'gpt-image-2',
          stylize_prompt:
            'Create a polished animated character from the uploaded person reference while preserving recognizable identity: same face structure, eye shape, nose, mouth, hairstyle, age impression and personality. Match this selected animation direction: {{user.cartoon_style}}. Clean production-quality character design, stable face, expressive but not exaggerated, no text, no watermark, no extra people.',
          photo_base_prompt:
            'Kling 3.0 Omni cartoon photo-to-video. Use the uploaded cartoon still as the exact scene reference: preserve its composition, world, colors, props, camera framing and animation atmosphere. If a user photo is provided, integrate the referenced person into the cartoon scene according to the selected visual mode.',
          prompt_base_prompt:
            'Seedance 2.0 animated text-to-video. Create a coherent high-quality cartoon scene from the user prompt with clear staging, appealing animation design, stable characters, expressive motion, polished lighting and a family-friendly adventure feeling.',
          character_prompt:
            'If a user photo is provided, preserve the person identity according to the selected visual mode. Keep the face stable and recognizable across frames. Do not blend the person with background characters, do not duplicate them, do not add extra copies, and do not distort eyes, mouth or hands.',
          no_reference_prompt:
            'No user photo was provided. Generate the cartoon scene directly from the prompt/reference frame without preserving any specific real-person identity.',
          cartoon_visual_mode: '{{user.cartoon_visual_mode}}',
          cartoon_style: '{{user.cartoon_style}}',
          cartoon_realistic_prompt:
            'Realistic visual mode: if a user photo is provided, keep the referenced person photorealistic and instantly recognizable inside the animated world. Preserve real human skin texture, natural face proportions, realistic eyes and hair, correct scale, contact shadows and scene-matched lighting. The world is animated, but the referenced person should look like a real person genuinely filmed inside it, not a sticker and not a cartoon.',
          cartoon_character_prompt:
            'Cartoon visual mode: if a user photo is provided, transform the referenced person into a polished animated character while preserving identity. Keep the same face structure, eye shape, nose, mouth, hairstyle, age impression and personality, but render them in the selected cartoon style with clean shapes, stable face, appealing design and natural animation.',
          cartoon_style_prompt:
            'Apply the selected cartoon style consistently to the environment, color palette, character design, lighting and motion. Avoid copyrighted logos, text, watermarks, malformed faces, flicker and random extra characters.',
          user_prompt: '{{user.prompt}}',
          default_photo_prompt:
            'Animate the uploaded cartoon frame with charming natural motion: gentle camera movement, lively background details, expressive but stable character motion and coherent scene physics.',
          default_prompt_prompt:
            'Create a charming animated scene with clear action, appealing characters, polished motion and a coherent cartoon world.',
          duration: '{{user.duration}}',
          aspect_ratio: '{{user.aspect}}',
          resolution: '720p',
        },
      },
    ],
  },
  {
    slug: 'road-camera-couple',
    title: 'Фото с камеры на дороге',
    shortDesc: 'Парень, девушка и машина в чёрно-белом кадре дорожной камеры',
    description:
      'Загрузите отдельные референсы парня, девушки и автомобиля. GPT Image 2 соберёт один фотореалистичный чёрно-белый кадр в стиле камеры дорожного наблюдения: машина на городской дороге, два человека на передних сиденьях, интерфейс камеры контроля скорости.',
    category: ServiceCategory.TRENDS_MEMES,
    priceTokens: 1,
    priceCoinsStandard: 1,
    priceCoinsPro: 1,
    costUsd: 0.1,
    coverImage: image('gift-road-camera-couple'),
    galleryImages: [image('gift-road-camera-couple-1'), image('gift-road-camera-couple-2')],
    previewImage: image('gift-road-camera-couple-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 22,
    userInputForm: [
      {
        id: 'man_photo',
        type: 'photo',
        label: 'Фото парня',
        required: true,
        hint: 'Чёткое фото лица или портрет. Это будет водитель.',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'woman_photo',
        type: 'photo',
        label: 'Фото девушки',
        required: true,
        hint: 'Чёткое фото лица или портрет. Это будет пассажирка.',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'car_photo',
        type: 'photo',
        label: 'Фото машины',
        required: true,
        hint: 'Лучше фото автомобиля спереди или под углом, чтобы были видны модель, фары, решётка и номер.',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: false,
        allowSystemLibrary: false,
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['16:9', '1:1', '9:16'],
        defaultAspect: '16:9',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: '{{user.man_photo}}',
        params: {
          model: 'gpt-image-2',
          image_urls: ['{{user.woman_photo}}', '{{user.car_photo}}'],
          output_format: 'jpg',
          aspect_ratio: '{{user.aspect}}',
          resolution: '4K',
          prompt:
            'GPT Image 2 edit. Use exactly three provided references. Reference image 1 is the man/driver. Reference image 2 is the woman/passenger. Reference image 3 is the car. Preserve each person identity separately and clearly; preserve the car make, model, body, headlights, grille, proportions and license plates as closely as possible. Чёрно-белый фотореалистичный уличный кадр в стиле камеры дорожного наблюдения. Вид строго сверху и спереди. Автомобиль полностью идентичен фото-референсу: марка, модель, кузов, фары, решётка, пропорции и номерные знаки совпадают 1в1. Машина едет по городской дороге, расположена строго по центру кадра, симметричная композиция, подчёркнутый капот и решётка радиатора. В салоне два человека на передних сиденьях, их внешность, лица, причёски и пропорции полностью соответствуют фото-референсу (1в1). Водитель держит руль одной рукой и смотрит вперёд с лёгкой улыбкой, пассажирка наклоняется к нему и целует в щёку — интимный, спонтанный момент. Лобовое стекло слегка отражает свет, но лица хорошо читаемы. Асфальт с детализированной текстурой, бордюр слева, ощущение движения. Внизу кадра интерфейс камеры контроля скорости: моноширинный шрифт, надписи «CAM 09», дата и время «2026-03-16», скорость 217 km/h. Контрастный чёрно-белый тон, высокая резкость, документальная эстетика, gritty realism, street photography, surveillance camera look, cinematic raw mood.',
        },
      },
    ],
  },
  {
    slug: 'kid-in-blue-tractor',
    title: 'Ребёнок в мультике Синий трактор',
    shortDesc: 'Загрузите фото ребёнка — соберём его героем мультика',
    description:
      'Готовый шаблон: загрузите фото одного или двух детей, а сцену мультика мы уже подобрали. Дети стилизуются под мультфильм и переносятся в готовую сцену. Промпт оживления подбирается автоматически под одного или двух героев. Standard — Kling 3.0, Pro — Seedance 2.0.',
    category: ServiceCategory.KIDS_HEROES,
    priceTokens: 140,
    priceCoinsStandard: 140,
    priceCoinsPro: 219,
    costUsd: 2.2,
    coverImage: image('gift-kid-blue-tractor'),
    galleryImages: [image('gift-kid-blue-tractor-1'), image('gift-kid-blue-tractor-2')],
    previewImage: image('gift-kid-blue-tractor-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 22,
    userInputForm: [
      {
        id: 'tier',
        type: 'tier',
        label: 'Качество',
        required: false,
        hint: 'Пока доступен только Стандарт (Kling 3.0). Pro (Seedance 2.0) — скоро.',
        options: [
          { value: 'standard', label: 'Стандарт · Kling 3.0' },
          { value: 'pro', label: 'Pro · Seedance 2.0', disabled: true },
        ],
      },
      {
        id: 'person1',
        type: 'photo',
        label: 'Фото первого ребёнка',
        required: true,
        hint: 'Загрузите обычное фото ребёнка. Хотите эффект сильнее? Сделайте мультяшную вариацию фото в Студии и выберите её здесь — так получится реалистичнее.',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'person2',
        type: 'photo',
        label: 'Фото второго ребёнка (необязательно)',
        required: false,
        hint: 'Добавьте, если героев должно быть двое',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'duration',
        type: 'duration',
        label: 'Длительность видео',
        required: false,
        durationOptions: [5, 8, 10, 15],
        defaultDuration: 5,
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['auto', '9:16', '16:9', '1:1'],
        defaultAspect: '9:16',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'scene-transfer',
        input: '{{user.person1}}',
        params: {
          model: { standard: 'kling-3-omni', pro: 'seedance-2-omni' },
          // PLACEHOLDER сцены: замените scene_image на реальный кадр мультика (URL или asset:ID) в админке.
          scene_mode: 'photo',
          scene_image: image('cinema-blue-tractor-scene'),
          primary_photo: '{{user.person1}}',
          secondary_photo: '{{user.person2}}',
          people_count: 'auto',
          stylize_characters: false,
          base_prompt:
            'Bright 2D animated children cartoon scene in a sunny countryside meadow with a cheerful blue tractor, rolling green hills, flowers and a friendly farm. Flat saturated colors, simple clean outlines, soft round shapes, wholesome preschool animation style. The animated cartoon style applies to the background, props and cartoon characters, NOT to the main referenced child.',
          character_prompt:
            'CHARACTER FIDELITY (most important): the referenced real child must stay fully photorealistic and instantly recognizable. Reproduce their exact face from the reference photo - face shape, eyes, eyebrows, nose, mouth, hairstyle, hair color, skin tone and age - with sharp, clearly defined, undistorted facial features. Do NOT cartoonify, stylize, smooth, beautify or simplify the child, and do not turn their body into a cartoon. Integrate them as a real child genuinely present inside the animated world: correct human scale next to the cartoon characters, feet on the ground, soft contact shadow, and lighting and colors that match the scene so they are not a flat pasted cutout. Keep motion natural and human - calm believable posture and gentle real movement, with no exaggerated cartoon gestures, no rubber-limb bending, no morphing and no jittery animation.',
          default_user_prompt: 'Bring the cartoon scene to life with cheerful, gentle motion suitable for young children.',
          duration: '{{user.duration}}',
          aspect_ratio: '{{user.aspect}}',
          resolution: '720p',
        },
      },
    ],
  },
  {
    slug: 'me-in-harry-potter',
    title: 'Я в сцене «Гарри Поттер»',
    shortDesc: 'Готовый шаблон: загрузите фото — перенесём вас в волшебную сцену',
    description:
      'Готовый шаблон: загрузите фото одного или двух людей, а сцену мы уже подобрали. Персонажи реалистично переносятся в готовую киносцену. Промпт оживления подбирается автоматически под одного или двух героев. Standard — Kling 3.0, Pro — Seedance 2.0.',
    category: ServiceCategory.CINEMA,
    priceTokens: 120,
    priceCoinsStandard: 120,
    priceCoinsPro: 199,
    costUsd: 2.0,
    coverImage: image('gift-me-in-hp'),
    galleryImages: [image('gift-me-in-hp-1'), image('gift-me-in-hp-2')],
    previewImage: image('gift-me-in-hp-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 23,
    userInputForm: [
      {
        id: 'tier',
        type: 'tier',
        label: 'Качество',
        required: false,
        hint: 'Пока доступен только Стандарт (Kling 3.0). Pro (Seedance 2.0) — скоро.',
        options: [
          { value: 'standard', label: 'Стандарт · Kling 3.0' },
          { value: 'pro', label: 'Pro · Seedance 2.0', disabled: true },
        ],
      },
      {
        id: 'person1',
        type: 'photo',
        label: 'Фото первого персонажа',
        required: true,
        hint: 'Чёткое фото лица или человека',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'person2',
        type: 'photo',
        label: 'Фото второго персонажа (необязательно)',
        required: false,
        hint: 'Добавьте, если в сцене должны быть два человека',
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'duration',
        type: 'duration',
        label: 'Длительность видео',
        required: false,
        durationOptions: [5, 8, 10, 15],
        defaultDuration: 5,
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['auto', '9:16', '16:9', '1:1'],
        defaultAspect: '16:9',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'scene-transfer',
        input: '{{user.person1}}',
        params: {
          model: { standard: 'kling-3-omni', pro: 'seedance-2-omni' },
          // PLACEHOLDER сцены: замените scene_image на реальный кадр сцены (URL или asset:ID) в админке.
          scene_mode: 'photo',
          scene_image: image('cinema-hp-scene'),
          primary_photo: '{{user.person1}}',
          secondary_photo: '{{user.person2}}',
          people_count: 'auto',
          stylize_characters: false,
          base_prompt:
            'Photorealistic cinematic fantasy film scene set in a grand magical castle with warm candlelight, old stone halls, floating candles and a wondrous wizarding-school atmosphere. Filmic lighting and color grading, realistic textures.',
          default_user_prompt: 'Bring the scene to life with natural, subtle, believable motion.',
          duration: '{{user.duration}}',
          aspect_ratio: '{{user.aspect}}',
          resolution: '720p',
        },
      },
    ],
  },
  {
    slug: 'carousel-post',
    title: 'Карусель для поста',
    description:
      'Загрузите своё фото и впишите текст для каждого слайда — GPT Image 2 соберёт набор слайдов в едином стиле, разместит вас на каждом и впечатает текст прямо в дизайн. Цена считается за слайд.',
    shortDesc: 'Набор слайдов для поста-карусели в едином стиле с вашим фото',
    category: ServiceCategory.TRENDS_MEMES,
    // Себестоимость ~ nano-banana за слайд ($0.1 ≈ 10 коинов) + маржа -> 15 коинов/слайд.
    priceTokens: 15,
    priceCoinsStandard: 15,
    priceCoinsPro: 15,
    costUsd: 0.1,
    coverImage: image('gift-carousel-post'),
    galleryImages: [image('gift-carousel-1'), image('gift-carousel-2')],
    previewImage: image('gift-carousel-post-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 24,
    userInputForm: [
      {
        id: 'photo',
        type: 'photo',
        label: 'Ваше фото (необязательно)',
        required: false,
        hint: 'Можно не добавлять — тогда слайды будут только с текстом и дизайном. Если добавите, у каждого слайда появится галочка «добавить моё фото».',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'slides',
        type: 'slides',
        label: 'Слайды',
        required: true,
        maxSlides: 10,
        maxLength: 600,
        hint: 'Выберите число слайдов и впишите текст каждого. У каждого слайда есть галочка «добавить моё фото» (если вы загрузили фото). Цена считается за слайд. Короткий текст читается лучше.',
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат слайда',
        required: false,
        aspectOptions: ['3:4', '1:1', '9:16'],
        defaultAspect: '3:4',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'carousel-slides',
        input: '{{user.photo}}',
        params: {
          model: 'gpt-image-2',
          person_photo: '{{user.photo}}',
          slides: '{{user.slides}}',
          style_prompt:
            'Premium, modern personal-brand social-media carousel. Keep ONE consistent template across all slides: soft neutral cream and beige background with subtle warm gold accents, elegant serif headings paired with a clean sans-serif body, generous margins, a clear photo area for the person and a tidy text block. Cohesive, professional, aesthetic, editorial magazine-like layout, sharp readable typography.',
          aspect_ratio: '{{user.aspect}}',
        },
      },
    ],
  },
  {
    slug: 'product-card',
    title: 'Карточка товара',
    description:
      'Загрузите 1–3 фото товара с разных ракурсов и отметьте, что сгенерировать: обложку-карточку, лёгкую анимацию товара и/или рекламный ролик. Считается и оплачивается только выбранное. Описание товара появится позже (нужна текстовая модель).',
    shortDesc: 'Обложка, анимация и реклама товара из ваших фото',
    category: ServiceCategory.TRENDS_MEMES,
    priceTokens: 15,
    priceCoinsStandard: 15,
    priceCoinsPro: 15,
    costUsd: 1.8,
    coverImage: image('gift-product-card'),
    galleryImages: [image('gift-product-card-1'), image('gift-product-card-2')],
    previewImage: image('gift-product-card-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    // Заменён на отдельные услуги product-cover и product-ad (P9.4.1); комбинированная скрыта.
    isActive: false,
    isFeatured: false,
    sortOrder: 25,
    userInputForm: [
      {
        id: 'photo1',
        type: 'photo',
        label: 'Фото товара 1',
        required: true,
        hint: 'Главный ракурс товара',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: false,
        allowSystemLibrary: false,
      },
      {
        id: 'photo2',
        type: 'photo',
        label: 'Фото товара 2 (необязательно)',
        required: false,
        hint: 'Другой ракурс',
        allowStudioAvatars: false,
        allowSystemLibrary: false,
      },
      {
        id: 'photo3',
        type: 'photo',
        label: 'Фото товара 3 (необязательно)',
        required: false,
        hint: 'Ещё ракурс',
        allowStudioAvatars: false,
        allowSystemLibrary: false,
      },
      {
        id: 'product_name',
        type: 'text',
        label: 'Название товара',
        required: true,
        maxLength: 120,
        placeholder: 'Например: кроссовки AirMax / крем для лица',
      },
      {
        id: 'outputs',
        type: 'multiselect',
        label: 'Что сгенерировать',
        required: true,
        defaultValue: '["cover"]',
        hint: 'Цена считается за выбранное. Можно отметить несколько.',
        options: [
          { value: 'cover', label: 'Обложка (карточка)', priceCoins: 15, hint: 'GPT Image 2 по вашим фото' },
          { value: 'animation', label: 'Лёгкая анимация товара', priceCoins: 60, hint: 'Товар с разных ракурсов' },
          { value: 'ad', label: 'Рекламный ролик', priceCoins: 120, hint: 'Кинематографичная реклама (Seedance)' },
          { value: 'description', label: 'Описание товара', disabled: true, hint: 'Скоро — нужна текстовая модель' },
        ],
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат',
        required: false,
        aspectOptions: ['auto', '1:1', '16:9', '9:16'],
        defaultAspect: 'auto',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'product-card',
        input: '{{user.photo1}}',
        params: {
          photo1: '{{user.photo1}}',
          photo2: '{{user.photo2}}',
          photo3: '{{user.photo3}}',
          product_name: '{{user.product_name}}',
          outputs: '{{user.outputs}}',
          cover_model: 'gpt-image-2',
          animation_model: 'kling-3-pro',
          animation_duration: 5,
          ad_model: 'seedance-2-omni',
          ad_duration: 8,
          aspect_ratio: '{{user.aspect}}',
        },
      },
    ],
  },
  {
    slug: 'product-cover',
    title: 'Обложка товара',
    description:
      'Загрузите 1–3 фото товара — нейросеть соберёт чистую продающую обложку-карточку (GPT Image 2). При желании отметьте «лёгкая анимация», чтобы получить ещё и короткий ролик с показом товара с разных ракурсов.',
    shortDesc: 'Продающая обложка товара из ваших фото (+ опц. анимация)',
    category: ServiceCategory.TRENDS_MEMES,
    priceTokens: 15,
    priceCoinsStandard: 15,
    priceCoinsPro: 15,
    costUsd: 0.1,
    coverImage: image('gift-product-cover'),
    galleryImages: [image('gift-product-cover-1'), image('gift-product-cover-2')],
    previewImage: image('gift-product-cover-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 26,
    userInputForm: [
      { id: 'photo1', type: 'photo', label: 'Фото товара 1', required: true, hint: 'Главный ракурс', maxSizeMb: 10, allowedFormats: ['jpg', 'jpeg', 'png', 'webp'], allowStudioAvatars: false, allowSystemLibrary: false },
      { id: 'photo2', type: 'photo', label: 'Фото товара 2 (необязательно)', required: false, hint: 'Другой ракурс', allowStudioAvatars: false, allowSystemLibrary: false },
      { id: 'photo3', type: 'photo', label: 'Фото товара 3 (необязательно)', required: false, hint: 'Ещё ракурс', allowStudioAvatars: false, allowSystemLibrary: false },
      { id: 'product_name', type: 'text', label: 'Название товара', required: true, maxLength: 120, placeholder: 'Например: кроссовки AirMax' },
      {
        id: 'outputs',
        type: 'multiselect',
        label: 'Что сгенерировать',
        required: true,
        defaultValue: '["cover"]',
        hint: 'Цена считается за выбранное.',
        options: [
          { value: 'cover', label: 'Обложка (карточка)', priceCoins: 15, hint: 'GPT Image 2 по вашим фото' },
          { value: 'animation', label: 'Лёгкая анимация', priceCoins: 60, hint: 'Короткий ролик: товар с разных ракурсов' },
        ],
      },
      { id: 'aspect', type: 'aspect_ratio', label: 'Формат', required: false, aspectOptions: ['auto', '1:1', '16:9', '9:16'], defaultAspect: '1:1' },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'product-card',
        input: '{{user.photo1}}',
        params: {
          photo1: '{{user.photo1}}',
          photo2: '{{user.photo2}}',
          photo3: '{{user.photo3}}',
          product_name: '{{user.product_name}}',
          outputs: '{{user.outputs}}',
          cover_model: 'gpt-image-2',
          animation_model: 'kling-3-pro',
          animation_duration: 5,
          aspect_ratio: '{{user.aspect}}',
        },
      },
    ],
  },
  {
    slug: 'product-ad',
    title: 'Рекламное видео товара',
    description:
      'Загрузите фото товара с разных ракурсов и опишите желаемый стиль ролика (например: премиум, тёмный фон, неон). Нейросеть (Seedance) сделает кинематографичный рекламный ролик: разные ракурсы, фактуры, профессиональный монтаж. Если стиль не указать — соберём по умолчанию.',
    shortDesc: 'Кинематографичный рекламный ролик товара из ваших фото',
    category: ServiceCategory.TRENDS_MEMES,
    priceTokens: 120,
    priceCoinsStandard: 120,
    priceCoinsPro: 120,
    costUsd: 1.6,
    coverImage: image('gift-product-ad'),
    galleryImages: [image('gift-product-ad-1'), image('gift-product-ad-2')],
    previewImage: image('gift-product-ad-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 27,
    userInputForm: [
      { id: 'photo1', type: 'photo', label: 'Фото товара 1', required: true, hint: 'Ракурс 1', maxSizeMb: 10, allowedFormats: ['jpg', 'jpeg', 'png', 'webp'], allowStudioAvatars: false, allowSystemLibrary: false },
      { id: 'photo2', type: 'photo', label: 'Фото товара 2 (необязательно)', required: false, hint: 'Ракурс 2', allowStudioAvatars: false, allowSystemLibrary: false },
      { id: 'photo3', type: 'photo', label: 'Фото товара 3 (необязательно)', required: false, hint: 'Ракурс 3', allowStudioAvatars: false, allowSystemLibrary: false },
      { id: 'product_name', type: 'text', label: 'Название товара (необязательно)', required: false, maxLength: 120, placeholder: 'Например: кроссовки AirMax' },
      {
        id: 'style',
        type: 'textarea',
        label: 'Стиль ролика (необязательно)',
        required: false,
        maxLength: 500,
        placeholder: 'Например: премиум, тёмный фон, неоновая подсветка, медленные макро-кадры',
        hint: 'Опишите только настроение/стиль. Всё остальное (что это реклама по вашему фото) уже учтено. Пусто — стиль по умолчанию.',
      },
      { id: 'aspect', type: 'aspect_ratio', label: 'Формат', required: false, aspectOptions: ['16:9', '9:16', '1:1'], defaultAspect: '16:9' },
      { id: 'duration', type: 'duration', label: 'Длительность', required: false, durationOptions: [5, 8, 10], defaultDuration: 8 },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'product-card',
        input: '{{user.photo1}}',
        params: {
          photo1: '{{user.photo1}}',
          photo2: '{{user.photo2}}',
          photo3: '{{user.photo3}}',
          product_name: '{{user.product_name}}',
          outputs: ['ad'],
          ad_model: 'seedance-2-omni',
          ad_style: '{{user.style}}',
          ad_duration: '{{user.duration}}',
          aspect_ratio: '{{user.aspect}}',
        },
      },
    ],
  },
  {
    slug: 'video-quality-upscale',
    title: 'Улучшение качества видео',
    description:
      'Загрузите короткое MP4-видео — нейросеть улучшит детализацию и вернёт тот же ролик в повышенном качестве без изменения сюжета и длительности. Лимит модели: до 10 МБ и до 240 кадров, поэтому держим пользовательский лимит до 15 секунд.',
    shortDesc: 'Апскейл короткого видео без изменения длительности',
    category: ServiceCategory.TRENDS_MEMES,
    priceTokens: 15,
    priceCoinsStandard: 15,
    priceCoinsPro: 15,
    costUsd: 0.072,
    coverImage: image('gift-video-quality-upscale'),
    galleryImages: [image('gift-video-quality-upscale-1'), image('gift-video-quality-upscale-2')],
    previewImage: image('gift-video-quality-upscale-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 28,
    userInputForm: [
      {
        id: 'video',
        type: 'video',
        label: 'Исходное видео',
        required: true,
        hint: 'MP4 до 10 МБ. Лучше короткие ролики до 15 секунд; провайдер обрабатывает до 240 кадров.',
        maxSizeMb: 10,
        maxDurationSec: 15,
        allowedFormats: ['mp4'],
        allowUserUpload: true,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'video-upscale',
        input: '{{user.video}}',
        params: {
          model: { standard: 'video-upscale-2x', pro: 'video-upscale-2x' },
          video_url: '{{user.video}}',
          duration: 15,
          estimatedFrames: 240,
          postprocess: true,
          postprocess_profile: 'strong',
          sharpness: 100,
          contrast: 20,
          clarity: 100,
        },
      },
    ],
  },
  {
    slug: 'video-quality-kling',
    title: 'Улучшение видео через Kling 3.0',
    description:
      'Загрузите короткий ролик до 15 секунд — Kling 3.0 пересоберёт его как более чистую версию с повышенной резкостью, детализацией, стабильностью кадра и аккуратным контрастом. Промпт просит сохранить исходное движение, композицию, тайминг и длительность без смены сюжета.',
    shortDesc: 'Генеративное улучшение короткого видео через Kling 3.0',
    category: ServiceCategory.TRENDS_MEMES,
    priceTokens: 25,
    priceCoinsStandard: 25,
    priceCoinsPro: 25,
    costUsd: 1.5,
    coverImage: image('gift-video-quality-upscale'),
    galleryImages: [image('gift-video-quality-upscale-1'), image('gift-video-quality-upscale-2')],
    previewImage: image('gift-video-quality-upscale-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: true,
    sortOrder: 29,
    userInputForm: [
      {
        id: 'video',
        type: 'video',
        label: 'Исходное видео',
        required: true,
        hint: 'MP4 до 25 МБ и до 15 секунд. Лучше загружать ролик без сильной тряски и с понятным главным объектом.',
        maxSizeMb: 25,
        maxDurationSec: 15,
        allowedFormats: ['mp4', 'mov'],
        allowUserUpload: true,
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'text-to-video',
        input: '{{user.video}}',
        params: {
          model: { standard: 'kling-3-omni', pro: 'kling-3-omni' },
          mode: 'omni_reference',
          video: '{{user.video}}',
          duration: 15,
          aspect_ratio: 'auto',
          resolution: '720p',
          enable_audio: false,
          keep_original_audio: true,
          prompt:
            'Use the uploaded video as the strict source reference. Create the same video again with visibly improved quality while preserving the original duration, timing, camera motion, composition, subject identity, scene, action, framing, and rhythm. Do not invent a new story, do not change people, clothing, environment, camera angle, or motion. Improve clarity, sharpness, fine detail, compression artifacts, flicker, low-light noise, color balance, local contrast, facial stability, edge definition, and temporal consistency. Keep natural realistic texture, no plastic skin, no over-sharpening halos, no HDR look, no added text, no watermark, no extra objects. The output must feel like a cleaner high-quality restoration of the exact same clip.',
        },
      },
    ],
  },
  {
    slug: 'photo-enhance',
    title: 'Улучшение фото',
    shortDesc: 'Повышаем качество и резкость фото до 4K без потери лиц и деталей',
    description:
      'Загрузите фото — нейросеть Nano Banana сделает чёткую, детализированную версию в качестве до 4K: уберёт шум, размытие и артефакты сжатия, восстановит текстуру кожи, волос и ткани, выровняет цвет и контраст. Люди, лица, поза, одежда и фон сохраняются как на оригинале — это улучшение того же снимка, а не новая картинка.',
    category: ServiceCategory.NOSTALGIA,
    // Себестоимость Nano Banana 4K ≈ $0.12 → с маржой 19 коинов.
    priceTokens: 19,
    priceCoinsStandard: 19,
    priceCoinsPro: 19,
    costUsd: 0.12,
    coverImage: image('gift-photo-enhance'),
    galleryImages: [image('gift-photo-enhance-1'), image('gift-photo-enhance-2')],
    previewImage: image('gift-photo-enhance-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 8,
    userInputForm: [
      {
        id: 'photo',
        type: 'photo',
        label: 'Ваше фото',
        required: true,
        hint: 'Любое фото, которое нужно улучшить: портрет, групповое, пейзаж',
        maxSizeMb: 15,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['auto', '1:1', '3:4', '9:16', '16:9'],
        defaultAspect: 'auto',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-edit',
        input: '{{user.photo}}',
        params: {
          model: { standard: 'nano-banana', pro: 'nano-banana' },
          output_format: 'jpg',
          aspect_ratio: '{{user.aspect}}',
          resolution: '4K',
          prompt:
            'Enhance and upscale the uploaded photo to a crisp, clean, high-resolution image at the best possible quality (up to 4K). This is a faithful quality enhancement of the SAME photo, not a new image. Preserve the content exactly: keep every person fully recognizable with the same faces, facial features, expressions, hairstyles, skin tone, age, body proportions, poses, clothing, the background and the overall composition. Do NOT add, remove, move, merge or duplicate people or objects, do NOT re-age, beautify, restyle or change anything. Improve sharpness and fine detail, recover and reconstruct natural texture in skin (with realistic pores), hair, fabric and surfaces, remove blur, noise, grain, compression and JPEG artifacts, fix soft focus and low-light mush, and gently balance exposure, contrast and colour while keeping the original mood and lighting. The result must look like a naturally sharp, detailed photograph of the same moment — no plastic or waxy skin, no AI smoothing, no over-sharpening halos, no heavy HDR, no beauty filter, no painterly or cartoon look, no added text, logos or watermark.',
        },
      },
    ],
  },
  {
    slug: 'talking-character',
    title: 'Говорящий персонаж',
    shortDesc: 'Фото персонажа + аудио-озвучка → видео, где он это говорит (lip-sync)',
    description:
      'Загрузите фото персонажа и аудио-файл с озвучкой — нейросеть оживит персонажа, и он проговорит ваше аудио с синхронизацией губ. По желанию опишите поведение и жесты. OmniHuman 1.5 (реалистичные жесты и мимика) или Kling lip-sync (чёткая артикуляция, 1080p). Аудио до 35 секунд.',
    category: ServiceCategory.TRENDS_MEMES,
    // Себестоимость OmniHuman ~$1.3 (по аудио), Kling ~$1.0. Цена с маржой.
    priceTokens: 199,
    priceCoinsStandard: 199,
    priceCoinsPro: 199,
    costUsd: 1.3,
    coverImage: image('gift-talking-character'),
    galleryImages: [image('gift-talking-character-1'), image('gift-talking-character-2')],
    previewImage: image('gift-talking-character-preview'),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'piapi',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: false,
    sortOrder: 9,
    userInputForm: [
      {
        id: 'character',
        type: 'photo',
        label: 'Фото персонажа',
        required: true,
        hint: 'Чёткое фото лица/портрет персонажа, который будет говорить',
        maxSizeMb: 10,
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
        allowStudioAvatars: true,
        allowSystemLibrary: false,
      },
      {
        id: 'audio',
        type: 'audio',
        label: 'Аудио-озвучка',
        required: true,
        hint: 'Голос, который проговорит персонаж (MP3 или WAV, до 35 секунд)',
        maxSizeMb: 25,
        allowedFormats: ['mp3', 'wav', 'ogg', 'm4a'],
      },
      {
        id: 'prompt',
        type: 'textarea',
        label: 'Поведение персонажа (необязательно)',
        required: false,
        maxLength: 600,
        placeholder: 'Например: спокойно смотрит в камеру, лёгкая улыбка, естественные жесты',
        hint: 'Опишите настроение, действия и жесты. Работает с OmniHuman.',
      },
      {
        id: 'model',
        type: 'select',
        label: 'Модель',
        required: false,
        options: [
          { value: 'omnihuman-1.5', label: 'OmniHuman 1.5 (жесты, реализм)' },
          { value: 'kling-ai-avatar', label: 'Kling lip-sync (1080p, чёткие губы)' },
        ],
      },
      {
        id: 'aspect',
        type: 'aspect_ratio',
        label: 'Формат кадра',
        required: false,
        aspectOptions: ['9:16', '1:1', '16:9'],
        defaultAspect: '9:16',
      },
    ],
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'talking-avatar',
        input: '{{user.character}}',
        params: {
          model: '{{user.model}}',
          audio_url: '{{user.audio}}',
          prompt: '{{user.prompt}}',
          aspect_ratio: '{{user.aspect}}',
          fast_mode: true,
        },
      },
    ],
  },
];

const legacyTrendServiceSlugs = [
  'face-in-trend',
  'duo-reference-dance',
  'repeat-motion-from-video',
  'face-in-trend-lite',
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
    tokens: 16,
    priceRub: 289,
    originalPriceRub: 349,
    bonus: 0,
    features: ['Токены зачисляются ровно по настройке пакета', 'Списание только после запуска обработки', 'Подходит для фото, анимаций и трендов'],
    sortOrder: 10,
  },
  {
    title: 'Базовый',
    tokens: 47,
    priceRub: 789,
    originalPriceRub: 849,
    bonus: 3,
    badgeText: 'Выбирают чаще всего',
    features: ['Токены зачисляются ровно по настройке пакета', 'Выгодно, токены в подарок', 'Списание только после запуска обработки', 'Подходит для фото, анимаций и трендов'],
    isPopular: true,
    sortOrder: 20,
  },
  {
    title: 'Максимум',
    tokens: 80,
    priceRub: 1439,
    originalPriceRub: 1689,
    bonus: 8,
    features: ['Токены зачисляются ровно по настройке пакета', 'Выгодно, токены в подарок', 'Списание только после запуска обработки', 'Подходит для фото, анимаций и трендов'],
    sortOrder: 30,
  },
];

const stylePresets = [
  {
    slug: 'avatar-clean-face',
    kind: 'user-avatar',
    title: 'Чёткое фото для анимаций',
    description: 'Резкое фронтальное лицо крупным планом с ровным светом — лучшая основа для услуг с анимацией. Лучше делать движком GPT Image 2.',
    promptText:
      'Create one sharp, photorealistic frontal headshot of the same person, looking straight at the camera. Preserve their exact identity: face shape, eyes, eyebrows, nose, mouth, hairstyle, hair color, skin tone and age. Face large and centered in the frame, neutral relaxed expression, eyes open. Even soft frontal lighting with no harsh shadows, clean neutral background, no glasses, no hat, nothing occluding the face. Maximum facial detail and clarity, natural skin texture, no beautify, no smoothing, no stylization. This image will be used as a high-quality reference face for future animations.',
    sortOrder: 5,
  },
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
  { key: 'company_name', value: 'Allvision Academy' },
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

  console.log('[seed] gift services: ensuring allowlisted data-driven catalog services');
  const gift = await ensureGiftServices();
  console.log(`[seed] gift services: ${gift.created} created, ${gift.skipped} existing skipped (admin edits preserved)`);

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

// Explicit allowlist of services this stage is allowed to create on a normal (prod) run.
// IMPORTANT: keep this scoped to genuinely NEW services only. The catalog is otherwise managed
// through /admin/services, and the admin intentionally deletes services they do not want — so this
// loader must never re-create anything outside this list, and never updates/deletes existing rows.
// When adding a future batch of services, add their slugs here for that deploy, then clear the list.
const NEW_SERVICE_SLUGS_TO_CREATE = new Set<string>([
  'talking-character',
]);

// Additive loader for explicitly new data-driven services. It creates allowlisted services only when
// they are missing. Existing rows are never updated here: prices, covers, prompts and pipeline are
// managed from /admin/services and must survive deploy-time seed runs.
async function ensureGiftServices() {
  let created = 0;
  let skipped = 0;
  for (const service of giftFactoryServices) {
    if (!NEW_SERVICE_SLUGS_TO_CREATE.has(service.slug)) continue;
    const existing = await prisma.service.findUnique({
      where: { slug: service.slug },
      select: { id: true },
    });
    if (existing) {
      console.log(`[seed] gift service exists, skipped: ${service.slug}`);
      skipped += 1;
      continue;
    }
    await prisma.service.create({ data: service });
    console.log(`[seed] gift service created: ${service.slug}`);
    created += 1;
  }
  return { created, skipped };
}

async function ensureCatalog(options: SeedOptions) {
  if (!options.includeDevCatalog) {
    console.log('[seed] catalog seed disabled; services are managed through admin UI');
    return;
  }

  const serviceCountBefore = await prisma.service.count();

  let legacyServices = 0;
  let trends = 0;
  let scenarioTemplateCount = 0;
  const devCatalog = await seedDevCatalog();
  legacyServices = devCatalog.legacyServices;
  trends = devCatalog.trends;
  scenarioTemplateCount = devCatalog.scenarioTemplates;

  if (
    serviceCountBefore > 0
    && legacyServices === 0
    && trends === 0
    && scenarioTemplateCount === 0
  ) {
    console.log(`[seed] catalog already populated, skipped (${serviceCountBefore} services)`);
    return;
  }

  console.log(
    `[seed] dev catalog ensured: ${legacyServices} legacy services, ${trends} trends, ${scenarioTemplateCount} scenario templates`,
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
  let created = 0;
  let skipped = 0;
  for (const preset of stylePresets) {
    const existing = await prisma.stylePreset.findUnique({ where: { slug: preset.slug }, select: { id: true } });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.stylePreset.create({
      data: {
        ...preset,
        thumbnail: null,
        isActive: true,
      },
    });
    created += 1;
  }
  console.log(`[seed] style presets: ${created} created, ${skipped} existing skipped`);
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
  let skipped = 0;
  for (const service of giftFactoryServices) {
    if (legacyTrendServiceSlugs.includes(service.slug)) continue;
    const existing = await prisma.service.findUnique({ where: { slug: service.slug } });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.service.create({ data: service });
    created += 1;
  }
  return { created, patched: 0, skipped, legacyDeactivated: 0 };
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
