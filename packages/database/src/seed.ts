import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcrypt';
import {
  GenerationKind,
  PresetCategory,
  Role,
  VoiceSourceType,
  VoiceStatus,
  prisma,
} from './index';

const BCRYPT_COST = 12;
const DEMO_ASSETS_ROOT = path.resolve(__dirname, '../../../apps/api/demo-assets');
const DEFAULT_PRESET_IMAGE = '/static/placeholders/preset-default.jpg';
const DEFAULT_PRESET_VIDEO = '/static/placeholders/preset-default.mp4';

function staticAsset(relativePath: string) {
  return `/static/${relativePath.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

function firstAsset(dir: string, extensions: string[], fallback: string) {
  const absoluteDir = path.join(DEMO_ASSETS_ROOT, dir);
  if (!fs.existsSync(absoluteDir)) return fallback;

  const file = fs
    .readdirSync(absoluteDir)
    .find((entry) => extensions.includes(path.extname(entry).toLowerCase()));

  return file ? staticAsset(path.join(dir, file)) : fallback;
}

const restorePreview = firstAsset('photo-restore', ['.jpg', '.jpeg', '.png', '.webp'], DEFAULT_PRESET_IMAGE);
const animatePreviewVideo = firstAsset('photo-animate', ['.mp4', '.webm', '.mov'], DEFAULT_PRESET_VIDEO);
const trendsPreviewVideo = firstAsset('trends', ['.mp4', '.webm', '.mov'], DEFAULT_PRESET_VIDEO);

const voices = [
  {
    id: 'preset-voice-anna',
    name: 'Анна (взрослая, дружелюбная)',
    providerVoiceId: 'mock-voice-anna',
    previewAudio: '/static/voices/mock-voice-anna.mp3',
  },
  {
    id: 'preset-voice-igor',
    name: 'Игорь (мужской, нейтральный)',
    providerVoiceId: 'mock-voice-igor',
    previewAudio: '/static/voices/mock-voice-igor.mp3',
  },
  {
    id: 'preset-voice-masha',
    name: 'Маша (детский)',
    providerVoiceId: 'mock-voice-masha',
    previewAudio: '/static/voices/mock-voice-masha.mp3',
  },
  {
    id: 'preset-voice-eduard',
    name: 'Эдуард (мужской, серьёзный)',
    providerVoiceId: 'mock-voice-eduard',
    previewAudio: '/static/voices/mock-voice-eduard.mp3',
  },
  {
    id: 'preset-voice-olga',
    name: 'Ольга (женский, тёплый)',
    providerVoiceId: 'mock-voice-olga',
    previewAudio: '/static/voices/mock-voice-olga.mp3',
  },
  {
    id: 'preset-voice-kirill',
    name: 'Кирилл (молодой, энергичный)',
    providerVoiceId: 'mock-voice-kirill',
    previewAudio: '/static/voices/mock-voice-kirill.mp3',
  },
];

const presets = [
  {
    slug: 'photo-restore',
    title: 'Восстановление старого фото',
    shortDesc: 'Убирает шум, мягко возвращает резкость и цвет архивным снимкам.',
    description: 'Mock-first пресет для реставрации старых семейных фотографий и сканов.',
    category: PresetCategory.PHOTO_RESTORE,
    kind: GenerationKind.IMAGE,
    mode: 'preset-photo-restore',
    promptTemplate: null,
    promptHint: null,
    needsInput: true,
    acceptedInput: 'image',
    aiProvider: 'mock',
    aiModel: 'mock-photo-restore',
    aiConfig: { assetPool: 'photo-restore' },
    coinsCost: 8,
    previewImage: restorePreview,
    previewVideo: null,
    sortOrder: 10,
    isFeatured: true,
    tags: ['photo', 'restore', 'family'],
  },
  {
    slug: 'photo-animate',
    title: 'Оживление фото',
    shortDesc: 'Создаёт короткое живое видео из портрета или семейного кадра.',
    description: 'Mock-first пресет для аккуратной анимации одного изображения.',
    category: PresetCategory.PHOTO_ANIMATE,
    kind: GenerationKind.VIDEO,
    mode: 'preset-photo-animate',
    promptTemplate: null,
    promptHint: null,
    needsInput: true,
    acceptedInput: 'image',
    aiProvider: 'mock',
    aiModel: 'mock-photo-animate',
    aiConfig: { assetPool: 'photo-animate' },
    coinsCost: 25,
    previewImage: restorePreview,
    previewVideo: animatePreviewVideo,
    sortOrder: 20,
    isFeatured: true,
    tags: ['photo', 'animate', 'video'],
  },
  {
    slug: 'photo-enhance-animate',
    title: 'Улучшить и оживить фото',
    shortDesc: 'Сначала чистит изображение, затем делает короткую анимацию.',
    description: 'Комбо-пресет для улучшения фото и генерации короткого mock-видео.',
    category: PresetCategory.PHOTO_ENHANCE_AND_ANIMATE,
    kind: GenerationKind.VIDEO,
    mode: 'preset-photo-enhance-animate',
    promptTemplate: null,
    promptHint: null,
    needsInput: true,
    acceptedInput: 'image',
    aiProvider: 'mock',
    aiModel: 'mock-photo-enhance-animate',
    aiConfig: { assetPools: ['photo-restore', 'photo-animate'] },
    coinsCost: 30,
    previewImage: restorePreview,
    previewVideo: animatePreviewVideo,
    sortOrder: 30,
    isFeatured: true,
    tags: ['photo', 'enhance', 'animate'],
  },
  {
    slug: 'trend-dance-1',
    title: 'Трендовый танец: Neon Step',
    shortDesc: 'Вертикальный танцевальный ролик в энергичном социальном формате.',
    description: 'Заглушка для trend dance генерации на базе одного изображения.',
    category: PresetCategory.TREND_DANCE,
    kind: GenerationKind.VIDEO,
    mode: 'preset-trend-dance',
    promptTemplate: 'Сделай энергичный танцевальный ролик с героем на фото.',
    promptHint: 'Можно указать настроение, одежду или фон.',
    needsInput: true,
    acceptedInput: 'image',
    aiProvider: 'mock',
    aiModel: 'mock-trend-dance-neon',
    aiConfig: { assetPool: 'trends', variant: 'neon-step' },
    coinsCost: 50,
    previewImage: restorePreview,
    previewVideo: trendsPreviewVideo,
    sortOrder: 40,
    isFeatured: true,
    tags: ['trend', 'dance', 'vertical'],
  },
  {
    slug: 'trend-dance-2',
    title: 'Трендовый танец: Family Pop',
    shortDesc: 'Весёлый вертикальный ролик для семейных поздравлений и сторис.',
    description: 'Заглушка trend dance с мягкой семейной подачей.',
    category: PresetCategory.TREND_DANCE,
    kind: GenerationKind.VIDEO,
    mode: 'preset-trend-dance',
    promptTemplate: 'Сделай лёгкий праздничный танец с героем на фото.',
    promptHint: 'Укажи повод: день рождения, праздник или просто веселье.',
    needsInput: true,
    acceptedInput: 'image',
    aiProvider: 'mock',
    aiModel: 'mock-trend-dance-family',
    aiConfig: { assetPool: 'trends', variant: 'family-pop' },
    coinsCost: 50,
    previewImage: restorePreview,
    previewVideo: trendsPreviewVideo,
    sortOrder: 50,
    isFeatured: false,
    tags: ['trend', 'dance', 'family'],
  },
  {
    slug: 'trend-dance-3',
    title: 'Трендовый танец: Retro Disco',
    shortDesc: 'Ретро-диско ролик с ярким движением и вертикальным кадром.',
    description: 'Заглушка trend dance для ретро и party-форматов.',
    category: PresetCategory.TREND_DANCE,
    kind: GenerationKind.VIDEO,
    mode: 'preset-trend-dance',
    promptTemplate: 'Сделай ретро-диско танец с героем на фото.',
    promptHint: 'Можно добавить стиль: 80-е, вечеринка, сцена, огни.',
    needsInput: true,
    acceptedInput: 'image',
    aiProvider: 'mock',
    aiModel: 'mock-trend-dance-retro',
    aiConfig: { assetPool: 'trends', variant: 'retro-disco' },
    coinsCost: 50,
    previewImage: restorePreview,
    previewVideo: trendsPreviewVideo,
    sortOrder: 60,
    isFeatured: false,
    tags: ['trend', 'dance', 'retro'],
  },
  {
    slug: 'tale-for-kids',
    title: 'Сказка для ребёнка',
    shortDesc: 'Пишет короткую добрую сказку по имени, возрасту и уроку.',
    description: 'Текстовый mock-пресет для генерации детской сказки.',
    category: PresetCategory.TEXT_PRESET,
    kind: GenerationKind.TEXT,
    mode: 'preset-tale',
    promptTemplate: 'Напиши сказку для ребёнка {{childName}} на тему {{theme}}.',
    promptHint: 'Укажи имя, возраст и чему должна научить история.',
    needsInput: false,
    acceptedInput: null,
    aiProvider: 'mock',
    aiModel: 'mock-text-tale',
    aiConfig: { templatePool: 'fairy-tales' },
    coinsCost: 3,
    previewImage: DEFAULT_PRESET_IMAGE,
    previewVideo: null,
    sortOrder: 70,
    isFeatured: true,
    tags: ['text', 'kids', 'tale'],
  },
  {
    slug: 'letter-template',
    title: 'Шаблон письма',
    shortDesc: 'Помогает быстро собрать аккуратное письмо в нужном тоне.',
    description: 'Текстовый mock-пресет для писем, обращений и деловых сообщений.',
    category: PresetCategory.TEXT_PRESET,
    kind: GenerationKind.TEXT,
    mode: 'preset-letter',
    promptTemplate: 'Составь письмо на тему: {{topic}}. Тон: {{tone}}.',
    promptHint: 'Опиши адресата, цель и желаемый тон.',
    needsInput: false,
    acceptedInput: null,
    aiProvider: 'mock',
    aiModel: 'mock-text-letter',
    aiConfig: {},
    coinsCost: 2,
    previewImage: DEFAULT_PRESET_IMAGE,
    previewVideo: null,
    sortOrder: 80,
    isFeatured: false,
    tags: ['text', 'letter', 'template'],
  },
  {
    slug: 'social-post',
    title: 'Пост для соцсетей',
    shortDesc: 'Генерирует короткий пост с понятной структурой и CTA.',
    description: 'Текстовый mock-пресет для быстрых публикаций и анонсов.',
    category: PresetCategory.TEXT_PRESET,
    kind: GenerationKind.TEXT,
    mode: 'preset-social-post',
    promptTemplate: 'Напиши пост для соцсетей о {{topic}} в стиле {{style}}.',
    promptHint: 'Укажи тему, аудиторию и площадку.',
    needsInput: false,
    acceptedInput: null,
    aiProvider: 'mock',
    aiModel: 'mock-text-social-post',
    aiConfig: {},
    coinsCost: 2,
    previewImage: DEFAULT_PRESET_IMAGE,
    previewVideo: null,
    sortOrder: 90,
    isFeatured: false,
    tags: ['text', 'social', 'post'],
  },
  {
    slug: 'voiceover-short',
    title: 'Короткая озвучка',
    shortDesc: 'Создаёт короткую TTS-озвучку по тексту и выбранному голосу.',
    description: 'Аудио mock-пресет для быстрой озвучки коротких сообщений.',
    category: PresetCategory.AUDIO_PRESET,
    kind: GenerationKind.AUDIO,
    mode: 'preset-voiceover-short',
    promptTemplate: '{{text}}',
    promptHint: 'Вставь текст до 30 секунд звучания.',
    needsInput: false,
    acceptedInput: null,
    aiProvider: 'mock',
    aiModel: 'mock-audio-tts',
    aiConfig: { defaultVoiceId: 'preset-voice-anna' },
    coinsCost: 5,
    previewImage: DEFAULT_PRESET_IMAGE,
    previewVideo: null,
    sortOrder: 100,
    isFeatured: false,
    tags: ['audio', 'tts', 'voice'],
  },
];

async function main() {
  const adminHash = await bcrypt.hash('admin123', BCRYPT_COST);
  const userHash = await bcrypt.hash('user123', BCRYPT_COST);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@allvision.ai' },
    update: {
      password: adminHash,
      name: 'Admin',
      role: Role.ADMIN,
      coinBalance: 1000,
      emailVerified: true,
    },
    create: {
      email: 'admin@allvision.ai',
      password: adminHash,
      name: 'Admin',
      role: Role.ADMIN,
      coinBalance: 1000,
      emailVerified: true,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'user@allvision.ai' },
    update: {
      password: userHash,
      name: 'Test User',
      role: Role.USER,
      coinBalance: 25,
      emailVerified: true,
    },
    create: {
      email: 'user@allvision.ai',
      password: userHash,
      name: 'Test User',
      role: Role.USER,
      coinBalance: 25,
      emailVerified: true,
    },
  });

  for (const voice of voices) {
    await prisma.voice.upsert({
      where: { id: voice.id },
      update: {
        name: voice.name,
        sourceType: VoiceSourceType.PRESET,
        providerVoiceId: voice.providerVoiceId,
        status: VoiceStatus.READY,
        isPaid: false,
        isSystem: true,
        previewAudio: voice.previewAudio,
        sourceAudio: null,
        userId: null,
      },
      create: {
        id: voice.id,
        name: voice.name,
        sourceType: VoiceSourceType.PRESET,
        providerVoiceId: voice.providerVoiceId,
        status: VoiceStatus.READY,
        isPaid: false,
        isSystem: true,
        previewAudio: voice.previewAudio,
        sourceAudio: null,
        userId: null,
      },
    });
  }

  for (const preset of presets) {
    await prisma.presetRecipe.upsert({
      where: { slug: preset.slug },
      update: preset,
      create: preset,
    });
  }

  console.log('[seed] created accounts:');
  console.log(`  admin: ${admin.email} / admin123  (balance ${admin.coinBalance})`);
  console.log(`  user:  ${user.email}  / user123   (balance ${user.coinBalance})`);
  console.log(`[seed] upserted ${voices.length} preset voices and ${presets.length} preset recipes`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
