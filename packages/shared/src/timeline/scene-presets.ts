/**
 * Шаблоны генерации сцен для редактора.
 *
 * Это НЕ шаблоны видео-поздравлений: те собирают весь ролик, а эти — заготовки
 * промпта для одной сцены. Человек, который не пишет промпты, выбирает «Двое обнимаются»
 * и получает результат; тот, кто пишет, правит подставленный текст под себя.
 *
 * Живут в коде, а не в админке, по той же причине, что и вкладки витрины: это продуктовый
 * контент, который едет вместе с релизом и должен быть согласован с набором моделей.
 */

export const SCENE_PRESET_GROUPS = ['people', 'atmosphere', 'story'] as const;
export type ScenePresetGroup = (typeof SCENE_PRESET_GROUPS)[number];

export type ScenePreset = {
  code: string;
  title: string;
  /** Что получится — коротко, языком результата, а не модели. */
  description: string;
  group: ScenePresetGroup;
  /** Промпт, который подставится в поле. Пользователь может его править. */
  prompt: string;
  /** Нужна ли этой сцене фотография человека. */
  needsPhoto: boolean;
};

export const SCENE_PRESET_GROUP_TITLES: Record<ScenePresetGroup, string> = {
  people: 'С людьми',
  atmosphere: 'Атмосфера',
  story: 'Сюжет',
};

const IDENTITY_TAIL =
  ' Keep faces stable, sharp and recognizable in every frame: no morphing, no identity drift, no warping of eyes, mouth or hands. Photorealistic, natural film-like motion.';

export const SCENE_PRESETS: readonly ScenePreset[] = [
  {
    code: 'hug',
    title: 'Двое обнимаются',
    description: 'Тёплое объятие крупным планом',
    group: 'people',
    needsPhoto: true,
    prompt:
      'Two people from the photo warmly hug each other, smiling, eyes closed for a moment. Soft natural light, shallow depth of field, gentle camera push-in.' + IDENTITY_TAIL,
  },
  {
    code: 'laugh',
    title: 'Смеются вместе',
    description: 'Живая реакция, будто камеру не заметили',
    group: 'people',
    needsPhoto: true,
    prompt:
      'The people from the photo burst into genuine laughter together, looking at each other, relaxed and unposed. Handheld camera feel, warm daylight.' + IDENTITY_TAIL,
  },
  {
    code: 'look-to-camera',
    title: 'Смотрит в камеру',
    description: 'Спокойный портретный кадр с лёгким движением',
    group: 'people',
    needsPhoto: true,
    prompt:
      'The person from the photo looks calmly straight into the camera, blinking naturally, hair and clothes moving slightly in the air. Slow cinematic camera drift.' + IDENTITY_TAIL,
  },
  {
    code: 'walk-away',
    title: 'Уходит вдаль',
    description: 'Финальный кадр — герой уходит от камеры',
    group: 'story',
    needsPhoto: true,
    prompt:
      'The person from the photo slowly walks away from the camera into the distance, the camera holding still. Golden hour light, long shadows, cinematic ending shot.' + IDENTITY_TAIL,
  },
  {
    code: 'toast',
    title: 'Поднимают бокалы',
    description: 'Праздничный тост за столом',
    group: 'people',
    needsPhoto: true,
    prompt:
      'The people from the photo raise their glasses in a celebratory toast, smiling at each other, warm festive lights glowing behind them.' + IDENTITY_TAIL,
  },
  {
    code: 'confetti',
    title: 'Конфетти и хлопушки',
    description: 'Салют из конфетти вокруг героя',
    group: 'people',
    needsPhoto: true,
    prompt:
      'Colorful confetti bursts and slowly falls around the person from the photo, who smiles and looks up. Festive, bright, joyful, slight slow motion.' + IDENTITY_TAIL,
  },
  {
    code: 'fireworks',
    title: 'Салют над городом',
    description: 'Ночное небо в фейерверках',
    group: 'atmosphere',
    needsPhoto: false,
    prompt:
      'Spectacular fireworks bursting over a night city skyline, reflections shimmering on water, slow cinematic camera tilt upward. No people in frame.',
  },
  {
    code: 'snowfall',
    title: 'Тихий снегопад',
    description: 'Медленный снег и огни гирлянд',
    group: 'atmosphere',
    needsPhoto: false,
    prompt:
      'Gentle snowfall at dusk, warm holiday garland lights glowing softly in the background, snowflakes drifting slowly through the frame, calm and quiet.',
  },
  {
    code: 'candles',
    title: 'Свечи на торте',
    description: 'Крупный план огоньков',
    group: 'atmosphere',
    needsPhoto: false,
    prompt:
      'Extreme close-up of birthday candles burning on a cake, flames flickering gently, warm bokeh background, shallow depth of field, slow camera drift.',
  },
  {
    code: 'flowers',
    title: 'Цветы распускаются',
    description: 'Ускоренное цветение крупным планом',
    group: 'atmosphere',
    needsPhoto: false,
    prompt:
      'Spring flowers slowly blooming in soft morning light, petals opening, delicate macro shot, gentle breeze, dreamy shallow focus.',
  },
  {
    code: 'photo-album',
    title: 'Листается альбом',
    description: 'Переход между воспоминаниями',
    group: 'story',
    needsPhoto: false,
    prompt:
      'Hands slowly turning the pages of an old family photo album on a wooden table, warm lamp light, dust motes in the air, nostalgic and quiet.',
  },
  {
    code: 'road-trip',
    title: 'Дорога из окна',
    description: 'Кадр в пути — хорошо между сценами',
    group: 'story',
    needsPhoto: false,
    prompt:
      'View from a car window on a summer road trip, landscape passing by, warm sunlight flickering through trees, relaxed holiday mood.',
  },
];

export function scenePreset(code: string): ScenePreset | undefined {
  return SCENE_PRESETS.find((preset) => preset.code === code);
}
