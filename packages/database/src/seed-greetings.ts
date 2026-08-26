import type { Prisma } from './index';
import { ProcessingType } from './index';

/**
 * G3 — шаблоны видео-поздравлений.
 *
 * Шаблон устроен одинаково: пользователь загружает пачку фотографий, каждая становится
 * отдельной сценой, сцены склеиваются в ролик с титрами и музыкой. Отличаются шаблоны
 * промптом движения, оформлением титров и поводом.
 *
 * Цена линейна по числу снимков (`priceCoinsPerPhoto`): сколько сцен заказали, столько
 * платных генераций и будет. Это честно и понятно без калькулятора.
 */

const CATEGORY = 'VIDEO_GREETINGS';

function image(seed: string, width = 800, height = 600) {
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

/** Дешёвая и аккуратная модель оживления фото: движение мягкое, лица не плывут. */
const ANIMATE_MODEL = 'hailuo-2.3-fast';
/** Стилизация кадра перед анимацией. */
const STYLIZE_MODEL = 'seedream-4';

type TimelineOverlay = {
  id: string;
  text: string;
  subtext?: string;
  style: 'clean' | 'bold' | 'card' | 'ribbon' | 'quote' | 'caption';
  position: 'top' | 'center' | 'bottom';
  startSec?: number;
  endSec?: number;
};

type TimelineSceneJson = {
  id: string;
  source: { kind: 'video' | 'image' | 'color' | 'batch'; url?: string; color?: string };
  durationSec?: number;
  transition?: 'cut' | 'dissolve' | 'fade-black' | 'slide';
  transitionDurationSec?: number;
  muted?: boolean;
  overlays?: TimelineOverlay[];
};

type GreetingTemplate = {
  slug: string;
  title: string;
  shortDesc: string;
  description: string;
  occasionTags: string[];
  featured?: boolean;
  sortOrder: number;
  /** Цена за одну сцену (одну фотографию). */
  pricePerPhoto: number;
  minPhotos: number;
  maxPhotos: number;
  photosLabel: string;
  photosHint: string;
  /** Промпт движения для каждой сцены. */
  motionPrompt: string;
  /** Во что превратить кадр до анимации. Пусто — фото анимируется как есть. */
  stylizePrompt?: string;
  sceneDurationSec: number;
  /** Оформление вступительного титра. */
  introStyle: TimelineOverlay['style'];
  introColor: string;
  titleLabel: string;
  titlePlaceholder: string;
  subtitlePlaceholder: string;
  /** Финальный титр: если пусто, ролик заканчивается последней сценой. */
  outroText?: string;
  /** Озвучка текста поздравления голосом. */
  voiceover?: { label: string; hint: string; placeholder: string; voice: string; emotion: string };
  defaultAspect: '9:16' | '16:9' | '1:1';
};

/**
 * Сборка таймлайна шаблона.
 *
 * Титульная карточка и финал — это сцены-заливки с титрами; если пользователь не заполнил
 * текст, блок рендера выбрасывает их сам (пустой чёрный кадр показывать незачем).
 * Сцены из фотографий описываются одной служебной сценой-пачкой: их число заранее неизвестно.
 */
function buildTimeline(template: GreetingTemplate): string {
  const scenes: TimelineSceneJson[] = [
    {
      id: 'intro',
      source: { kind: 'color', color: template.introColor },
      durationSec: 2.5,
      transition: 'dissolve',
      transitionDurationSec: 0.7,
      overlays: [
        {
          id: 'intro_title',
          text: '{{user.title}}',
          subtext: '{{user.subtitle}}',
          style: template.introStyle,
          position: 'center',
        },
      ],
    },
    {
      id: 'scene',
      source: { kind: 'batch' },
      transition: 'dissolve',
      transitionDurationSec: 0.6,
      // Оживлённое фото звука не несёт, а музыка идёт своей дорожкой.
      muted: true,
    },
  ];

  if (template.outroText) {
    scenes.push({
      id: 'outro',
      source: { kind: 'color', color: template.introColor },
      durationSec: 3,
      transition: 'cut',
      overlays: [
        {
          id: 'outro_title',
          text: template.outroText,
          style: template.introStyle,
          position: 'center',
        },
      ],
    });
  }

  return JSON.stringify({
    aspect: '{{user.aspect}}',
    scenes,
    music: { url: '{{user.music}}', volume: 0.7, fadeInSec: 1.5, fadeOutSec: 2.5, loop: true },
  });
}

function buildForm(template: GreetingTemplate) {
  const fields: Record<string, unknown>[] = [
    {
      id: 'photos',
      type: 'photos',
      label: template.photosLabel,
      required: true,
      minPhotos: template.minPhotos,
      maxPhotos: template.maxPhotos,
      priceCoinsPerPhoto: template.pricePerPhoto,
      maxSizeMb: 15,
      allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
      hint: template.photosHint,
    },
    {
      id: 'title',
      type: 'text',
      label: template.titleLabel,
      required: false,
      maxLength: 60,
      placeholder: template.titlePlaceholder,
      hint: 'Появится на титульном кадре. Оставьте пустым — ролик начнётся сразу с фотографий.',
    },
    {
      id: 'subtitle',
      type: 'text',
      label: 'Подпись под заголовком',
      required: false,
      maxLength: 60,
      placeholder: template.subtitlePlaceholder,
    },
  ];

  if (template.voiceover) {
    fields.push({
      id: 'speech',
      type: 'textarea',
      label: template.voiceover.label,
      required: false,
      maxLength: 600,
      placeholder: template.voiceover.placeholder,
      hint: template.voiceover.hint,
    });
  }

  fields.push(
    {
      id: 'music',
      type: 'music-select',
      label: 'Музыка',
      required: false,
      mediaKind: 'background-music',
      allowUserUpload: false,
      allowLibrary: true,
      hint: 'Выберите настроение — трек будет играть весь ролик и плавно затихнет в конце.',
    },
    {
      id: 'aspect',
      type: 'aspect_ratio',
      label: 'Формат ролика',
      required: false,
      aspectOptions: ['9:16', '1:1', '16:9'],
      defaultAspect: template.defaultAspect,
      hint: 'Вертикаль удобнее отправлять в мессенджер, горизонталь — смотреть на компьютере.',
    },
  );

  return fields;
}

function buildPipeline(template: GreetingTemplate) {
  const steps: Record<string, unknown>[] = [
    {
      id: 'step_1',
      blockSlug: 'scene-batch',
      params: {
        photos: '{{user.photos}}',
        mode: template.stylizePrompt ? 'stylize-animate' : 'animate',
        model: ANIMATE_MODEL,
        prompt: template.motionPrompt,
        ...(template.stylizePrompt
          ? { stylize_model: STYLIZE_MODEL, stylize_prompt: template.stylizePrompt }
          : {}),
        duration: template.sceneDurationSec,
        aspect_ratio: '{{user.aspect}}',
        max_scenes: template.maxPhotos,
      },
    },
  ];

  const renderParams: Record<string, unknown> = {
    timeline: buildTimeline(template),
    clips: '{{step_1.output.metadata.clips}}',
    music: '{{user.music}}',
    photo_motion: true,
    quality: 'balanced',
    max_scenes: template.maxPhotos + 2,
  };

  if (template.voiceover) {
    steps.push({
      id: 'step_2',
      blockSlug: 'text-to-speech',
      params: {
        model: 'minimax-speech',
        text: '{{user.speech}}',
        voice: template.voiceover.voice,
        emotion: template.voiceover.emotion,
        language: 'Russian',
      },
    });
    renderParams.voiceover = '{{step_2.output.url}}';
  }

  steps.push({
    id: template.voiceover ? 'step_3' : 'step_2',
    blockSlug: 'timeline-render',
    params: renderParams,
  });

  return steps;
}

function buildService(template: GreetingTemplate) {
  return {
    slug: template.slug,
    title: template.title,
    description: template.description,
    shortDesc: template.shortDesc,
    category: CATEGORY,
    occasionTags: template.occasionTags,
    priceTokens: template.pricePerPhoto,
    priceCoinsStandard: template.pricePerPhoto,
    priceCoinsPro: template.pricePerPhoto,
    // Себестоимость одной сцены: анимация (+ стилизация, если она есть в шаблоне).
    costUsd: template.stylizePrompt ? 0.21 : 0.16,
    coverImage: image(`greeting-${template.slug}`),
    galleryImages: [image(`greeting-${template.slug}-1`), image(`greeting-${template.slug}-2`)],
    previewImage: image(`greeting-${template.slug}-preview`),
    previewVideo: null,
    processingType: ProcessingType.AUTO,
    aiProvider: 'fal',
    aiModel: 'data-driven-pipeline',
    aiConfig: {},
    isActive: true,
    isFeatured: template.featured === true,
    sortOrder: template.sortOrder,
    featuredOrder: template.sortOrder,
    // Prisma ждёт InputJsonValue; наши билдеры возвращают обычные объекты.
    userInputForm: buildForm(template) as unknown as Prisma.InputJsonValue,
    pipelineConfig: buildPipeline(template) as unknown as Prisma.InputJsonValue,
  };
}

/** Общий хвост промпта: лицо не должно «плыть» — это главная претензия к оживлению фото. */
const IDENTITY_TAIL =
  ' Keep every face perfectly stable, sharp and recognizable in every frame: no morphing, no identity drift, no face replacement, no warping of eyes, mouth or hands. Preserve the original composition, clothing and colours. Photorealistic, natural film-like motion.';

const TEMPLATES: GreetingTemplate[] = [
  {
    slug: 'greeting-revive-album',
    title: 'Ожившие фотографии',
    shortDesc: 'Старые снимки оживают и складываются в ролик с музыкой',
    description:
      'Загрузите семейные фотографии — каждая оживёт лёгким движением и станет отдельной сценой. Мы склеим их плавными переходами, добавим титры и музыку. Получится ролик, который не стыдно показать за столом.',
    occasionTags: ['MEMORY', 'JUBILEE', 'BIRTHDAY'],
    featured: true,
    sortOrder: 1,
    pricePerPhoto: 35,
    minPhotos: 4,
    maxPhotos: 12,
    photosLabel: 'Фотографии для ролика',
    photosHint: 'От 4 до 12 снимков. Порядок можно менять — он станет порядком сцен в ролике.',
    motionPrompt:
      'Gently bring this photograph to life. Subtle, tasteful motion only: slow parallax camera drift, soft breathing, natural blinking, hair and fabric moving slightly in the air.' + IDENTITY_TAIL,
    sceneDurationSec: 5,
    introStyle: 'quote',
    introColor: '#0b1020',
    titleLabel: 'Заголовок ролика',
    titlePlaceholder: 'Наша семья',
    subtitlePlaceholder: '1985 — 2026',
    defaultAspect: '9:16',
  },
  {
    slug: 'greeting-birthday',
    title: 'С днём рождения',
    shortDesc: 'Тёплое видео-поздравление из фотографий именинника',
    description:
      'Соберите поздравление из фотографий именинника: каждый кадр оживёт, добавятся титры с именем и праздничная музыка. Отправляется одним файлом в любой мессенджер.',
    occasionTags: ['BIRTHDAY'],
    featured: true,
    sortOrder: 2,
    pricePerPhoto: 35,
    minPhotos: 4,
    maxPhotos: 12,
    photosLabel: 'Фотографии именинника',
    photosHint: 'От 4 до 12 фото. Лучше всего работают снимки, где лицо видно крупно.',
    motionPrompt:
      'Bring this celebratory photograph to life with warm, joyful motion: gentle camera push-in, soft smiling micro-expressions, natural blinking, festive light shimmering in the background.' + IDENTITY_TAIL,
    sceneDurationSec: 5,
    introStyle: 'bold',
    introColor: '#1a0b20',
    titleLabel: 'Кому поздравление',
    titlePlaceholder: 'С днём рождения, Аня!',
    subtitlePlaceholder: 'от всей семьи',
    outroText: 'Будь счастлива!',
    defaultAspect: '9:16',
  },
  {
    slug: 'greeting-jubilee',
    title: 'Юбилей: жизнь в кадрах',
    shortDesc: 'Торжественный ролик к круглой дате',
    description:
      'Ролик к юбилею: снимки разных лет оживают и складываются в спокойную, торжественную историю. Подходит для показа за праздничным столом и для отправки родным.',
    occasionTags: ['JUBILEE', 'MEMORY'],
    sortOrder: 3,
    pricePerPhoto: 35,
    minPhotos: 6,
    maxPhotos: 12,
    photosLabel: 'Фотографии разных лет',
    photosHint: 'От 6 до 12 снимков. Расположите их по порядку — от самых старых к недавним.',
    motionPrompt:
      'Bring this photograph to life with calm, dignified motion: very slow cinematic camera drift, gentle breathing and blinking, warm nostalgic light.' + IDENTITY_TAIL,
    sceneDurationSec: 6,
    introStyle: 'ribbon',
    introColor: '#12100a',
    titleLabel: 'Заголовок',
    titlePlaceholder: 'С юбилеем!',
    subtitlePlaceholder: '60 лет',
    outroText: 'С юбилеем!',
    defaultAspect: '16:9',
  },
  {
    slug: 'greeting-love-story',
    title: 'История любви',
    shortDesc: 'Ролик из ваших общих фотографий',
    description:
      'Ваши совместные фотографии оживают и складываются в короткий фильм о вас двоих. Подойдёт на годовщину, 14 февраля или просто так.',
    occasionTags: ['ANNIVERSARY', 'VALENTINE', 'WEDDING'],
    featured: true,
    sortOrder: 4,
    pricePerPhoto: 35,
    minPhotos: 4,
    maxPhotos: 12,
    photosLabel: 'Ваши общие фотографии',
    photosHint: 'От 4 до 12 снимков — от первых свиданий до сегодняшнего дня.',
    motionPrompt:
      'Bring this romantic photograph to life: soft slow camera movement, tender micro-expressions, natural blinking, warm golden light and gently moving background.' + IDENTITY_TAIL,
    sceneDurationSec: 5,
    introStyle: 'quote',
    introColor: '#1b0d14',
    titleLabel: 'Заголовок',
    titlePlaceholder: 'Наша история',
    subtitlePlaceholder: '5 лет вместе',
    defaultAspect: '9:16',
  },
  {
    slug: 'greeting-wedding',
    title: 'Свадебный ролик',
    shortDesc: 'Свадебные фотографии в одном коротком фильме',
    description:
      'Свадебные кадры оживают и превращаются в короткий фильм с плавными переходами и музыкой. Хороший подарок молодожёнам от гостей и родителей.',
    occasionTags: ['WEDDING', 'ANNIVERSARY'],
    sortOrder: 5,
    pricePerPhoto: 35,
    minPhotos: 5,
    maxPhotos: 12,
    photosLabel: 'Свадебные фотографии',
    photosHint: 'От 5 до 12 кадров: сборы, церемония, банкет, портреты.',
    motionPrompt:
      'Bring this wedding photograph to life with elegant cinematic motion: slow graceful camera glide, veil and fabric moving softly, warm celebratory light, tender expressions.' + IDENTITY_TAIL,
    sceneDurationSec: 6,
    introStyle: 'quote',
    introColor: '#14100c',
    titleLabel: 'Имена молодожёнов',
    titlePlaceholder: 'Аня и Миша',
    subtitlePlaceholder: '12 июня 2026',
    defaultAspect: '16:9',
  },
  {
    slug: 'greeting-new-year',
    title: 'Новогоднее поздравление',
    shortDesc: 'Праздничный ролик с огнями и снегом',
    description:
      'Новогоднее видео-поздравление: ваши фотографии оживают в праздничной атмосфере — гирлянды мерцают, идёт снег. Отправьте всем, кого хотите поздравить, одним файлом.',
    occasionTags: ['NEW_YEAR'],
    featured: true,
    sortOrder: 6,
    pricePerPhoto: 35,
    minPhotos: 4,
    maxPhotos: 12,
    photosLabel: 'Фотографии для поздравления',
    photosHint: 'От 4 до 12 снимков. Подойдут и новогодние кадры, и обычные — атмосферу добавим мы.',
    motionPrompt:
      'Bring this photograph to life with festive winter magic: softly falling snow, warm bokeh of holiday garlands twinkling in the background, gentle camera drift, natural blinking and breathing.' + IDENTITY_TAIL,
    sceneDurationSec: 5,
    introStyle: 'bold',
    introColor: '#0a1424',
    titleLabel: 'Поздравление',
    titlePlaceholder: 'С Новым годом!',
    subtitlePlaceholder: '2027',
    outroText: 'С Новым годом!',
    defaultAspect: '9:16',
  },
  {
    slug: 'greeting-march-8',
    title: 'С 8 марта',
    shortDesc: 'Весенний ролик для самых близких',
    description:
      'Поздравление к 8 марта: фотографии оживают в мягком весеннем свете, добавляются титры и музыка. Готово за несколько минут.',
    occasionTags: ['MARCH_8'],
    sortOrder: 7,
    pricePerPhoto: 35,
    minPhotos: 3,
    maxPhotos: 10,
    photosLabel: 'Фотографии',
    photosHint: 'От 3 до 10 снимков — можно одну героиню, можно всю женскую часть семьи.',
    motionPrompt:
      'Bring this photograph to life with soft spring atmosphere: warm sunlight, gentle breeze moving hair, delicate flower petals drifting through the air, tender smile and natural blinking.' + IDENTITY_TAIL,
    sceneDurationSec: 5,
    introStyle: 'ribbon',
    introColor: '#1d1016',
    titleLabel: 'Поздравление',
    titlePlaceholder: 'С 8 марта!',
    subtitlePlaceholder: 'самой любимой',
    defaultAspect: '9:16',
  },
  {
    slug: 'greeting-feb-23',
    title: 'С 23 февраля',
    shortDesc: 'Сдержанный мужской ролик к празднику',
    description:
      'Поздравление к 23 февраля: фотографии оживают в спокойном, сдержанном стиле, с титрами и музыкой. Подойдёт и для семьи, и для коллег.',
    occasionTags: ['FEB_23'],
    sortOrder: 8,
    pricePerPhoto: 35,
    minPhotos: 3,
    maxPhotos: 10,
    photosLabel: 'Фотографии',
    photosHint: 'От 3 до 10 снимков. Можно сделать общий ролик на весь отдел.',
    motionPrompt:
      'Bring this photograph to life with restrained, confident motion: slow steady camera move, calm expression, natural blinking, subtle atmospheric light.' + IDENTITY_TAIL,
    sceneDurationSec: 5,
    introStyle: 'bold',
    introColor: '#0d1410',
    titleLabel: 'Поздравление',
    titlePlaceholder: 'С 23 февраля!',
    subtitlePlaceholder: 'с уважением',
    defaultAspect: '9:16',
  },
  {
    slug: 'greeting-baby-year',
    title: 'Первый год малыша',
    shortDesc: 'Как рос ребёнок — месяц за месяцем',
    description:
      'Ролик о первом годе жизни: снимки по месяцам оживают и складываются в тёплую историю взросления. Отличный подарок бабушкам и дедушкам.',
    occasionTags: ['NEWBORN', 'BIRTHDAY'],
    sortOrder: 9,
    pricePerPhoto: 35,
    minPhotos: 6,
    maxPhotos: 12,
    photosLabel: 'Фотографии по месяцам',
    photosHint: 'От 6 до 12 снимков. Расположите их по возрасту — от самых первых дней.',
    motionPrompt:
      'Bring this baby photograph to life with very gentle motion: soft camera drift, tiny natural movements, blinking, warm nursery light. Keep the motion calm and safe-looking.' + IDENTITY_TAIL,
    sceneDurationSec: 5,
    introStyle: 'card',
    introColor: '#0f1220',
    titleLabel: 'Заголовок',
    titlePlaceholder: 'Наш первый год',
    subtitlePlaceholder: 'Мише 1 годик',
    defaultAspect: '9:16',
  },
  {
    slug: 'greeting-kid-cartoon',
    title: 'Ребёнок в мультфильме',
    shortDesc: 'Фотографии ребёнка превращаются в мультик',
    description:
      'Каждая фотография ребёнка превращается в мультипликационный кадр, а затем оживает. Получается собственный маленький мультфильм с титрами и музыкой.',
    occasionTags: ['BIRTHDAY', 'NEWBORN', 'GRADUATION'],
    sortOrder: 10,
    pricePerPhoto: 55,
    minPhotos: 3,
    maxPhotos: 10,
    photosLabel: 'Фотографии ребёнка',
    photosHint: 'От 3 до 10 снимков. Лучше всего подходят кадры, где лицо хорошо видно.',
    stylizePrompt:
      'Redraw this photo as a warm, friendly 2D cartoon illustration for children: clean bold outlines, bright saturated colours, simple shapes, soft shading. Keep the child clearly recognizable — same hair, same face proportions, same clothing colours. Cheerful storybook style.',
    motionPrompt:
      'Animate this cartoon illustration with playful, bouncy motion: the character moves and smiles, the background elements sway gently. Keep the cartoon style consistent and the character recognizable in every frame.',
    sceneDurationSec: 5,
    introStyle: 'bold',
    introColor: '#101a2a',
    titleLabel: 'Заголовок',
    titlePlaceholder: 'Приключения Миши',
    subtitlePlaceholder: 'серия первая',
    defaultAspect: '9:16',
  },
  {
    slug: 'greeting-graduation',
    title: 'Выпускной и 1 сентября',
    shortDesc: 'Школьные и студенческие кадры в одном ролике',
    description:
      'Ролик к выпускному или 1 сентября: школьные фотографии оживают и складываются в историю. Подойдёт для показа на празднике и для родительского чата.',
    occasionTags: ['GRADUATION'],
    sortOrder: 11,
    pricePerPhoto: 35,
    minPhotos: 4,
    maxPhotos: 12,
    photosLabel: 'Школьные фотографии',
    photosHint: 'От 4 до 12 кадров: класс, друзья, поездки, последний звонок.',
    motionPrompt:
      'Bring this school photograph to life with light, optimistic motion: gentle camera movement, friendly smiles, natural blinking, bright daylight.' + IDENTITY_TAIL,
    sceneDurationSec: 5,
    introStyle: 'card',
    introColor: '#0b1524',
    titleLabel: 'Заголовок',
    titlePlaceholder: 'Выпуск 2026',
    subtitlePlaceholder: '11 «А»',
    defaultAspect: '16:9',
  },
  {
    slug: 'greeting-pet',
    title: 'Поздравление от питомца',
    shortDesc: 'Кот или пёс поздравляет вашим текстом',
    description:
      'Фотографии питомца оживают, а поверх звучит поздравление, озвученное живым голосом по вашему тексту. Неожиданно и очень тепло — такое пересылают дальше.',
    occasionTags: ['BIRTHDAY', 'JUST_BECAUSE', 'NEW_YEAR'],
    sortOrder: 12,
    pricePerPhoto: 35,
    minPhotos: 2,
    maxPhotos: 8,
    photosLabel: 'Фотографии питомца',
    photosHint: 'От 2 до 8 снимков. Подойдут любые кадры, где питомца хорошо видно.',
    motionPrompt:
      'Bring this pet photograph to life with charming natural motion: the animal blinks, tilts its head slightly, ears and fur move softly, gentle camera drift. Keep the animal anatomically correct and clearly recognizable — same breed, same colouring, no human features.',
    sceneDurationSec: 5,
    introStyle: 'card',
    introColor: '#141018',
    titleLabel: 'Заголовок',
    titlePlaceholder: 'Поздравление от Барсика',
    subtitlePlaceholder: 'мяу!',
    voiceover: {
      label: 'Текст поздравления (озвучим голосом)',
      hint: 'Напишите поздравление от лица питомца — мы озвучим его и наложим на ролик. Оставьте пустым, если хотите только музыку.',
      placeholder: 'Мяу! Поздравляю с днём рождения и требую больше вкусняшек!',
      voice: 'Lively_Girl',
      emotion: 'happy',
    },
    defaultAspect: '9:16',
  },
];

export const greetingTemplateSlugs = TEMPLATES.map((template) => template.slug);

export const greetingTemplates = TEMPLATES.map(buildService);
