/**
 * Шаблоны сцен для редактора роликов.
 *
 * Вынесены отдельным модулем: набор пополняется чаще остальных, а превью к нему владелец
 * загружает через админку — в коде остаются только заголовок, описание и промпт.
 *
 * Два вида: `editor-scene` работает с одним кадром сцены, `editor-scene-duo` — с двумя
 * людьми, поэтому в его промптах прямо сказано сохранять обе внешности без подмены лиц.
 */
export const editorScenePresets = [
  {
    slug: 'scene-alive-portrait',
    kind: 'editor-scene',
    title: 'Кадр оживает',
    description: 'Лёгкое дыхание, моргание и еле заметное движение камеры — фотография оживает, лицо не плывёт.',
    promptText:
      'Bring this photograph to life with subtle, natural motion: gentle breathing, soft blinking, barely perceptible camera drift. Keep every face perfectly stable and recognizable, no morphing, no identity drift. Preserve the original composition, clothing and colours. Photorealistic, cinematic, film-like grain.',
    sortOrder: 10,
  },
  {
    slug: 'scene-slow-zoom',
    kind: 'editor-scene',
    title: 'Медленный наезд',
    description: 'Плавное приближение к герою — кадр смотрится дороже статичной фотографии.',
    promptText:
      'Slow cinematic push-in toward the subject, shallow depth of field, gentle parallax between foreground and background. Keep faces sharp and unchanged. Warm natural lighting, photorealistic.',
    sortOrder: 20,
  },
  {
    slug: 'scene-golden-hour',
    kind: 'editor-scene',
    title: 'Золотой час',
    description: 'Тёплый закатный свет и мягкие блики — кадр из семейного фильма.',
    promptText:
      'Relight the scene with warm golden hour sunlight, soft lens flares, dust motes floating in the air, gentle camera drift. Keep the subject identity and composition unchanged. Photorealistic, nostalgic, cinematic.',
    sortOrder: 30,
  },
  {
    slug: 'scene-snowfall',
    kind: 'editor-scene',
    title: 'Тихий снегопад',
    description: 'Крупные хлопья снега и морозный воздух вокруг героя.',
    promptText:
      'Add a calm snowfall around the subject: large soft snowflakes drifting slowly, cold winter air, subtle breath vapor, gentle camera movement. Keep faces and clothing unchanged. Photorealistic, peaceful mood.',
    sortOrder: 40,
  },
  {
    slug: 'scene-fireworks',
    kind: 'editor-scene',
    title: 'Салют над городом',
    description: 'Праздничный салют в небе и тёплые отблески на лицах.',
    promptText:
      'Add a festive fireworks display in the night sky behind the subject, colourful bursts reflecting warm light on faces, slight camera tilt upward. Keep the subject identity and pose. Photorealistic, celebratory mood.',
    sortOrder: 50,
  },
  {
    slug: 'scene-candles',
    kind: 'editor-scene',
    title: 'Свечи на торте',
    description: 'Тёплый свет свечей и лёгкий дым — момент перед загаданным желанием.',
    promptText:
      'Warm candlelight illuminating the subject from below, tiny flames flickering, soft smoke curling upward, cosy indoor birthday atmosphere. Keep faces recognizable and sharp. Photorealistic, intimate mood.',
    sortOrder: 60,
  },
  {
    slug: 'scene-studio-light',
    kind: 'editor-scene',
    title: 'Съёмка в студии',
    description: 'Ровный студийный свет и чистый фон — портрет как с профессиональной съёмки.',
    promptText:
      'Place the subject in a professional photo studio: clean seamless backdrop, soft key light with gentle rim light, shallow depth of field, subtle model movement and a natural smile. Keep identity, hairstyle and clothing unchanged. Photorealistic, editorial quality.',
    sortOrder: 70,
  },
  {
    slug: 'scene-album-pages',
    kind: 'editor-scene',
    title: 'Листается альбом',
    description: 'Фотография лежит в семейном альбоме, страница мягко переворачивается.',
    promptText:
      'Show the photograph resting on a page of a family photo album, a hand gently turning the page, warm lamp light, dust in the air, shallow depth of field. Photorealistic, nostalgic.',
    sortOrder: 80,
  },

  {
    slug: 'scene-duo-hug',
    kind: 'editor-scene-duo',
    title: 'Обнимаются',
    description: 'Двое сходятся в объятиях — тёплый спокойный момент.',
    promptText:
      'The two people from the reference photos come together into a warm, natural hug, smiling gently, eyes closing for a moment. Preserve both faces exactly as in the references: no morphing, no face swapping, no identity drift. Soft natural lighting, photorealistic, cinematic.',
    sortOrder: 10,
  },
  {
    slug: 'scene-duo-kiss',
    kind: 'editor-scene-duo',
    title: 'Целуются',
    description: 'Нежный поцелуй в щёку — по-семейному, без пошлости.',
    promptText:
      'The two people from the reference photos share a tender, tasteful kiss on the cheek, both smiling softly afterwards. Preserve both identities exactly, no morphing. Warm natural light, shallow depth of field, photorealistic, romantic but restrained.',
    sortOrder: 20,
  },
  {
    slug: 'scene-duo-laugh',
    kind: 'editor-scene-duo',
    title: 'Смеются вместе',
    description: 'Живой общий смех — самое человечное, что можно поставить в поздравление.',
    promptText:
      'The two people from the reference photos burst into genuine shared laughter, looking at each other, shoulders relaxed, eyes crinkling. Preserve both identities exactly. Natural daylight, handheld camera feel, photorealistic.',
    sortOrder: 30,
  },
  {
    slug: 'scene-duo-studio',
    kind: 'editor-scene-duo',
    title: 'Вдвоём в студии',
    description: 'Совместный студийный портрет: ровный свет, чистый фон.',
    promptText:
      'Place both people from the reference photos together in a professional photo studio: clean backdrop, soft key light, they stand close, exchange a glance and smile at the camera. Preserve both identities exactly, natural poses. Photorealistic, editorial quality.',
    sortOrder: 40,
  },
  {
    slug: 'scene-duo-dance',
    kind: 'editor-scene-duo',
    title: 'Танцуют',
    description: 'Медленный танец вдвоём — движение мягкое, лица узнаваемы.',
    promptText:
      'The two people from the reference photos slow dance together, gentle swaying motion, warm string lights in the background, soft bokeh. Preserve both identities exactly, no morphing. Photorealistic, romantic evening mood.',
    sortOrder: 50,
  },
  {
    slug: 'scene-duo-toast',
    kind: 'editor-scene-duo',
    title: 'Поднимают бокалы',
    description: 'Праздничный тост вдвоём — для юбилеев и свадеб.',
    promptText:
      'The two people from the reference photos raise glasses in a celebratory toast, clinking them together, warm candlelit table, festive background bokeh. Preserve both identities exactly. Photorealistic, celebratory.',
    sortOrder: 60,
  },
  {
    slug: 'scene-duo-walk',
    kind: 'editor-scene-duo',
    title: 'Идут вместе',
    description: 'Двое неспешно идут рядом — хороший финальный кадр ролика.',
    promptText:
      'The two people from the reference photos walk side by side along a quiet path, talking and smiling, camera slowly following them from behind and then to the side. Preserve both identities exactly. Golden hour light, photorealistic, cinematic.',
    sortOrder: 70,
  },
] as const;
