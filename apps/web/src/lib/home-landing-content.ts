export type HomeMedia = {
  type: 'image' | 'video';
  url: string;
  alt: string;
};

export type HomeTrendingSlot = {
  slotId: string;
  serviceSlug: string;
  title?: string;
  description?: string;
  media?: HomeMedia;
  tone: 'violet' | 'amber' | 'cyan' | 'rose';
};

export type HomeModelFamily = {
  key: string;
  title: string;
  description: string;
  models: string[];
  accent: 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'sky';
};

export type HomeBenefit = {
  key: string;
  title: string;
  description: string;
};

export type HomeStat = {
  label: string;
  value: string;
};

export type HomeGreetingStep = {
  key: string;
  title: string;
  description: string;
};

export type HomeLandingContent = {
  /**
   * Первый экран: видео-поздравления. Это главный продукт, поэтому он открывает страницу,
   * а не делит внимание с остальным каталогом.
   */
  greetings: {
    sectionKey: string;
    eyebrow: string;
    title: string;
    lead: string;
    primaryCta: string;
    secondaryCta: string;
    /** Фон первого экрана. */
    media: HomeMedia;
    /** Скриншот редактора: главный аргумент «соберу сам». */
    editorMedia: HomeMedia;
    editorTitle: string;
    editorLead: string;
    steps: HomeGreetingStep[];
    stats: HomeStat[];
  };
  hero: {
    sectionKey: string;
    eyebrow: string;
    title: string;
    lead: string;
    primaryCta: string;
    secondaryCta: string;
    media: HomeMedia;
    featuredTitle: string;
    featuredDescription: string;
    featuredMedia: HomeMedia;
    stats: HomeStat[];
  };
  trending: {
    sectionKey: string;
    title: string;
    description: string;
    slots: HomeTrendingSlot[];
  };
  chat: {
    sectionKey: string;
    eyebrow: string;
    title: string;
    lead: string;
    prompts: string[];
    mock: {
      prompt: string;
      resultTitle: string;
      resultDescription: string;
      media: HomeMedia;
    };
  };
  models: {
    sectionKey: string;
    eyebrow: string;
    title: string;
    lead: string;
    families: HomeModelFamily[];
  };
  readyServices: {
    sectionKey: string;
    eyebrow: string;
    title: string;
    lead: string;
    cta: string;
    serviceSlugs: string[];
  };
  studio: {
    sectionKey: string;
    eyebrow: string;
    title: string;
    lead: string;
    cta: string;
    media: HomeMedia;
    items: HomeBenefit[];
  };
  benefits: {
    sectionKey: string;
    eyebrow: string;
    title: string;
    lead: string;
    items: HomeBenefit[];
  };
  finalCta: {
    sectionKey: string;
    title: string;
    lead: string;
  };
};

export const HOME_LANDING_CONTENT = {
  greetings: {
    sectionKey: 'greetings-hero',
    eyebrow: 'Видео-поздравления',
    title: 'Поздравление, которое пересматривают',
    lead:
      'Не открытка из мессенджера и не пятнадцать секунд из шаблона. Ваши фотографии оживают, '
      + 'звучит ваш голос, а в финале — то, что вы хотели сказать. Соберите сами за вечер или '
      + 'возьмите готовый сценарий и просто добавьте снимки.',
    primaryCta: 'Выбрать шаблон',
    secondaryCta: 'Собрать самому',
    media: {
      type: 'image',
      url: 'https://picsum.photos/seed/allvision-greetings-stage/1800/1100',
      alt: 'Кадр из видео-поздравления Allvision Studio',
    } satisfies HomeMedia,
    editorMedia: {
      type: 'image',
      url: 'https://picsum.photos/seed/allvision-editor-shot/1600/1000',
      alt: 'Редактор роликов Allvision Studio',
    } satisfies HomeMedia,
    editorTitle: 'Редактор, в котором понятно всё',
    editorLead:
      'Сцены на шкале времени, титры мышкой, музыка и голос отдельными дорожками. '
      + 'Видно, что получится, ещё до сборки.',
    steps: [
      {
        key: 'photos',
        title: 'Загрузите фотографии',
        description: 'Хоть из семейного альбома, хоть с телефона. Порядок снимков станет порядком сцен.',
      },
      {
        key: 'voice',
        title: 'Добавьте голос и музыку',
        description: 'Запишите поздравление сами или пусть его произнесёт синтез. Музыку выберите из библиотеки.',
      },
      {
        key: 'result',
        title: 'Заберите готовый файл',
        description: 'Скачиваете и отправляете. Без водяных знаков и подписки — вы платите только за сборку.',
      },
    ] satisfies HomeGreetingStep[],
    stats: [
      { value: '12', label: 'готовых сценариев' },
      { value: '3 мин', label: 'до первой сцены' },
      { value: 'без', label: 'водяных знаков' },
    ] satisfies HomeStat[],
  },
  hero: {
    sectionKey: 'hero',
    eyebrow: 'Трендовые AI-услуги',
    title: 'Трендовые видео, образы и услуги за минуты',
    lead:
      'Выберите готовый сценарий или откройте Allvision AI: фото, видео, аватары, локации и референсы собираются в одном рабочем пространстве.',
    primaryCta: 'Открыть Allvision AI',
    secondaryCta: 'Смотреть услуги',
    media: {
      type: 'image',
      url: 'https://picsum.photos/seed/allvision-home-trends-stage/1800/1100',
      alt: 'Витрина трендовых AI-услуг Allvision Studio',
    } satisfies HomeMedia,
    featuredTitle: 'Тренд недели',
    featuredDescription: 'Видео, которое легко повторить из готовой услуги',
    featuredMedia: {
      type: 'image',
      url: 'https://picsum.photos/seed/allvision-home-featured-trend/900/1125',
      alt: 'Пример трендовой генерации',
    } satisfies HomeMedia,
    stats: [
      { label: 'Фото и видео', value: '2 режима' },
      { label: 'Модели', value: '12+' },
      { label: 'Оплата', value: 'без подписки' },
    ],
  },
  trending: {
    sectionKey: 'trending-services',
    title: 'Популярные сценарии для быстрого старта',
    description: 'Самые понятные форматы: выберите идею, добавьте референс и получите готовый результат.',
    slots: [
      {
        slotId: 'trend-face-video',
        serviceSlug: 'face-in-trend',
        title: 'Лицо в трендовом ролике',
        description: 'Загрузите портрет, выберите настроение и получите вертикальный клип.',
        media: {
          type: 'image',
          url: 'https://picsum.photos/seed/allvision-face-trend/900/1200',
          alt: 'Трендовое видео с портретом',
        },
        tone: 'violet',
      },
      {
        slotId: 'trend-old-photo',
        serviceSlug: 'revive-old-photo',
        title: 'Оживить старое фото',
        description: 'Теплое движение для семейного архива, открытки или памятного видео.',
        media: {
          type: 'image',
          url: 'https://picsum.photos/seed/allvision-old-photo-memory/900/1200',
          alt: 'Оживление старого фото',
        },
        tone: 'amber',
      },
      {
        slotId: 'trend-kid-hero',
        serviceSlug: 'kid-cartoon-hero',
        title: 'Персонаж в мульт-образе',
        description: 'Аватар или фото превращается в яркий образ для семейной истории.',
        media: {
          type: 'image',
          url: 'https://picsum.photos/seed/allvision-cartoon-hero/900/1200',
          alt: 'Мультяшный герой по фото',
        },
        tone: 'cyan',
      },
      {
        slotId: 'trend-card',
        serviceSlug: 'anniversary-card',
        title: 'Видео-открытка к событию',
        description: 'Готовый формат для поздравления, юбилея, свадьбы или важной даты.',
        media: {
          type: 'image',
          url: 'https://picsum.photos/seed/allvision-anniversary-card/900/1200',
          alt: 'AI видео-открытка',
        },
        tone: 'rose',
      },
    ] satisfies HomeTrendingSlot[],
  },
  chat: {
    sectionKey: 'ai-chat',
    eyebrow: 'Allvision AI',
    title: 'Свободный чат для любых генераций',
    lead:
      'Пишите промпт, прикрепляйте референс, выбирайте модель и продолжайте работу с готовым результатом как с новым исходником.',
    prompts: [
      'Сделай кинематографичный ролик 9:16 по описанию',
      'Возьми этот результат как референс и измени стиль',
      'Создай реалистичный образ персонажа для Студии',
    ],
    mock: {
      prompt: 'Создай атмосферный vertical shot: неон, дождь, мягкая камера...',
      resultTitle: 'Готовый результат',
      resultDescription: 'Можно скачать, сохранить в Студию или использовать как референс',
      media: {
        type: 'image',
        url: 'https://picsum.photos/seed/allvision-ai-chat-result/1200/675',
        alt: 'Пример результата Allvision AI',
      } satisfies HomeMedia,
    },
  },
  models: {
    sectionKey: 'model-catalog',
    eyebrow: 'Модели',
    title: 'Большой набор моделей под разные задачи',
    lead:
      'В одном интерфейсе собраны быстрые и Pro-варианты для изображений, text-to-video, image-to-video и роликов со звуком.',
    families: [
      {
        key: 'image',
        title: 'Изображения и правки',
        description: 'Генерация, стилизация, аккуратное редактирование и подготовка референсов.',
        models: ['Nano Banana 2', 'Gemini image edit'],
        accent: 'violet',
      },
      {
        key: 'image-to-video',
        title: 'Фото в видео',
        description: 'Оживление портретов, сцен и готовых образов из Студии.',
        models: ['Kling 2.6', 'Kling 3.0', 'Hailuo 2.3'],
        accent: 'cyan',
      },
      {
        key: 'text-to-video',
        title: 'Текст в видео',
        description: 'Ролики только по описанию, без обязательного референса.',
        models: ['Seedance 2', 'Veo 3.1', 'Sora 2'],
        accent: 'emerald',
      },
      {
        key: 'audio-video',
        title: 'Видео со звуком',
        description: 'Звук включается только у моделей, где провайдер это поддерживает.',
        models: ['Veo 3.1', 'Kling 3.0 Standard'],
        accent: 'amber',
      },
      {
        key: 'studio-assets',
        title: 'Аватары и локации',
        description: 'Сохраняйте образы, создавайте вариации и используйте их в услугах.',
        models: ['Style presets', 'Image edit', 'Library generation'],
        accent: 'rose',
      },
      {
        key: 'service-pipelines',
        title: 'Готовые пайплайны',
        description: 'Не нужно разбираться в настройках: выбирайте услугу и запускайте.',
        models: ['Фото', 'Тренды', 'Открытки'],
        accent: 'sky',
      },
    ] satisfies HomeModelFamily[],
  },
  readyServices: {
    sectionKey: 'ready-services',
    eyebrow: 'Готовые услуги',
    title: 'Когда не хочется выбирать модель вручную',
    lead:
      'Услуги скрывают сложность: вы загружаете нужные материалы, а система выбирает готовый пайплайн.',
    cta: 'Все услуги',
    serviceSlugs: ['revive-old-photo', 'single-photo-2017', 'face-in-trend', 'kid-cartoon-hero', 'anniversary-card', 'group-photo-2017'],
  },
  studio: {
    sectionKey: 'studio-highlight',
    eyebrow: 'Личная Студия',
    title: 'Создавайте свой аватар и его вариации',
    lead:
      'Загрузите фото один раз — соберите реалистичный аватар и сохраните его в Студии. Затем создавайте сколько угодно вариаций: новый образ, стиль или сцену в один клик и используйте их в любых услугах.',
    cta: 'Открыть Студию',
    media: {
      type: 'image',
      url: 'https://picsum.photos/seed/allvision-studio-avatar/1200/900',
      alt: 'Аватары и их вариации в Студии Allvision',
    } satisfies HomeMedia,
    items: [
      {
        key: 'avatar-once',
        title: 'Аватар один раз',
        description: 'Соберите образ из своих фото и переиспользуйте его в услугах и чате.',
      },
      {
        key: 'variations',
        title: 'Бесконечные вариации',
        description: 'Меняйте стиль, образ и сцену — каждая вариация сохраняется рядом с оригиналом.',
      },
      {
        key: 'reuse',
        title: 'Готово к работе',
        description: 'Выбранный аватар сразу доступен в любой генерации без повторной загрузки.',
      },
    ] satisfies HomeBenefit[],
  },
  benefits: {
    sectionKey: 'benefits-pricing',
    eyebrow: 'Удобно и честно',
    title: 'Минимум лишних шагов, максимум контроля',
    lead:
      'Allvision Studio соединяет свободную генерацию, готовые услуги и личную библиотеку референсов. Токены списываются за конкретный запуск.',
    items: [
      {
        key: 'library',
        title: 'Личная Студия',
        description: 'Аватары, локации и результаты доступны для повторного использования.',
      },
      {
        key: 'reference',
        title: 'Результат как референс',
        description: 'Удачный кадр можно сразу отправить в следующий запрос.',
      },
      {
        key: 'pricing',
        title: 'Низкая себестоимость',
        description: 'Нет подписки: цена зависит от модели, длительности и звука.',
      },
      {
        key: 'mobile',
        title: 'Работает на любом экране',
        description: 'Главная, чат и услуги адаптируются под телефон, ноутбук и рабочий монитор.',
      },
    ] satisfies HomeBenefit[],
  },
  finalCta: {
    sectionKey: 'final-cta',
    title: 'Начните с тренда или свободного чата',
    lead: 'Выберите готовую услугу, если нужен быстрый результат, или откройте Allvision AI для полного контроля.',
  },
} satisfies HomeLandingContent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneContent<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepMerge<T>(base: T, override: unknown): T {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? (override as T) : cloneContent(base);
  }
  if (!isRecord(base)) {
    return override === undefined || override === null ? base : (override as T);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    result[key] = deepMerge(value, isRecord(override) ? override[key] : undefined);
  }
  return result as T;
}

export function mergeHomeLandingContent(content?: Partial<HomeLandingContent> | null): HomeLandingContent {
  return deepMerge(HOME_LANDING_CONTENT, content);
}
