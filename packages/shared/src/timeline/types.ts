import { z } from 'zod';

/**
 * Таймлайн — единственный источник правды для смонтированного ролика.
 *
 * Один и тот же JSON читают двое: плеер предпросмотра в браузере и рендер на сервере.
 * Поэтому набор возможностей намеренно узкий (фиксированные переходы, фиксированные стили
 * титров, без произвольных кейфреймов) — за счёт гибкости покупается то, что предпросмотр
 * честно показывает будущий файл.
 */

export const TIMELINE_VERSION = 1;

export const TIMELINE_ASPECTS = ['9:16', '16:9', '1:1', '4:5'] as const;
export type TimelineAspect = (typeof TIMELINE_ASPECTS)[number];

/** Переходы ограничены теми, что одинаково выражаются в CSS и в ffmpeg xfade. */
export const TIMELINE_TRANSITIONS = ['cut', 'dissolve', 'fade-black', 'slide'] as const;
export type TimelineTransition = (typeof TIMELINE_TRANSITIONS)[number];

export const TIMELINE_TEXT_STYLES = ['clean', 'bold', 'card', 'ribbon', 'quote', 'caption'] as const;
export type TimelineTextStyle = (typeof TIMELINE_TEXT_STYLES)[number];

export const TIMELINE_TEXT_POSITIONS = ['top', 'center', 'bottom'] as const;
export type TimelineTextPosition = (typeof TIMELINE_TEXT_POSITIONS)[number];

export const TIMELINE_SOURCE_KINDS = ['video', 'image', 'color'] as const;
export type TimelineSourceKind = (typeof TIMELINE_SOURCE_KINDS)[number];

/**
 * Границы взяты не из вкуса, а из стоимости: за ними растёт время рендера и разваливается
 * предпросмотр на телефоне (живых video-элементов и так держим минимум).
 */
export const TIMELINE_LIMITS = {
  maxScenes: 30,
  maxTotalDurationSec: 180,
  maxSceneDurationSec: 60,
  minSceneDurationSec: 0.5,
  maxTransitionDurationSec: 2,
  maxOverlaysPerScene: 3,
  /** Слоёв в одной сцене: больше — и коллаж превращается в кашу, а рендер в минуты. */
  maxLayersPerScene: 8,
  /** Дорожек звука на ролик: больше — и микс превращается в кашу, а предпросмотр в тормоза. */
  maxAudioTracks: 8,
  maxTextLength: 200,
  /** Шаблон видео-поздравления заведомо короче ролика из редактора. */
  maxTemplateScenes: 12,
} as const;

const trimmedText = z.string().trim().min(1).max(TIMELINE_LIMITS.maxTextLength);

export const timelineTextOverlaySchema = z.object({
  id: z.string().trim().min(1).max(80),
  text: trimmedText,
  /** Вторая строка помельче: подпись, дата, имя. */
  subtext: z.string().trim().max(TIMELINE_LIMITS.maxTextLength).optional(),
  style: z.enum(TIMELINE_TEXT_STYLES).default('clean'),
  position: z.enum(TIMELINE_TEXT_POSITIONS).default('bottom'),
  /** Секунды от начала сцены. Пусто — титр висит всю сцену. */
  startSec: z.number().min(0).max(TIMELINE_LIMITS.maxSceneDurationSec).optional(),
  endSec: z.number().min(0).max(TIMELINE_LIMITS.maxSceneDurationSec).optional(),
});

export type TimelineTextOverlay = z.infer<typeof timelineTextOverlaySchema>;

export const timelineSourceSchema = z.object({
  kind: z.enum(TIMELINE_SOURCE_KINDS),
  /** Ссылка на файл: /static/..., http(s):// или asset:<id>. Для kind=color не нужна. */
  url: z.string().trim().min(1).max(2000).optional(),
  /** Заливка для kind=color, например титульная карточка. */
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export type TimelineSource = z.infer<typeof timelineSourceSchema>;

export const timelineSceneSchema = z.object({
  id: z.string().trim().min(1).max(80),
  /**
   * Слои сцены снизу вверх: медиа и титры. Это основная форма записи.
   * Схема слоёв лежит в ./layers, а не здесь, чтобы не было кольцевого импорта.
   */
  layers: z.array(z.unknown()).max(TIMELINE_LIMITS.maxLayersPerScene).optional(),
  /** Цвет подложки под слоями. */
  background: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),

  // --- Прежняя форма записи: один источник и титры поверх. ---
  // Так записаны все ролики и двенадцать шаблонов, созданных до слоёв. Переписывать их
  // незачем: sceneLayers() раскладывает такую сцену на слои при чтении.
  source: timelineSourceSchema.optional(),
  /** Обрезка исходного видео. Для картинок и заливок не используется. */
  trimStartSec: z.number().min(0).max(3600).optional(),
  trimEndSec: z.number().min(0).max(3600).optional(),
  /**
   * Длительность сцены в ролике. Для картинки и заливки задаётся явно, для видео
   * вычисляется из обрезки — см. sceneDurationSec().
   */
  durationSec: z.number().min(TIMELINE_LIMITS.minSceneDurationSec).max(TIMELINE_LIMITS.maxSceneDurationSec).optional(),
  /** Переход к СЛЕДУЮЩЕЙ сцене. У последней сцены игнорируется. */
  transition: z.enum(TIMELINE_TRANSITIONS).default('cut'),
  transitionDurationSec: z.number().min(0).max(TIMELINE_LIMITS.maxTransitionDurationSec).optional(),
  /** Оригинальный звук сцены. */
  muted: z.boolean().default(false),
  volume: z.number().min(0).max(2).default(1),
  overlays: z.array(timelineTextOverlaySchema).max(TIMELINE_LIMITS.maxOverlaysPerScene).default([]),
  /** Откуда сцена взялась — для интерфейса редактора, на рендер не влияет. */
  origin: z.enum(['upload', 'library', 'generated', 'template']).optional(),
  /** Проект генерации, если сцену сделал ИИ: по нему показываем «перегенерировать». */
  generationProjectId: z.string().trim().max(80).optional(),
});

export type TimelineScene = z.infer<typeof timelineSceneSchema>;

export const timelineAudioTrackSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  volume: z.number().min(0).max(2).default(0.7),
  fadeInSec: z.number().min(0).max(10).default(1),
  fadeOutSec: z.number().min(0).max(10).default(1),
  /** Повторять, если дорожка короче ролика. */
  loop: z.boolean().default(true),
  /** С какой секунды ролика играет дорожка. */
  startAtSec: z.number().min(0).max(TIMELINE_LIMITS.maxTotalDurationSec).default(0),
  /**
   * С какой секунды САМОГО ФАЙЛА начинать. Не путать со startAtSec: тот говорит, когда
   * дорожка вступает в ролике, а этот — какой кусок трека брать (например, начать песню
   * с припева, а не со вступления).
   */
  trimStartSec: z.number().min(0).max(3600).default(0),
  /**
   * Сколько секунд дорожка звучит. Пусто — до конца файла (или до конца ролика, если
   * дорожка зациклена).
   *
   * Появилось вместе с резкой звука: без верхней границы трек нельзя разделить на куски —
   * второй фрагмент звучал бы поверх первого до самого конца.
   */
  durationSec: z.number().min(0.2).max(TIMELINE_LIMITS.maxTotalDurationSec).optional(),
});

export type TimelineAudioTrack = z.infer<typeof timelineAudioTrackSchema>;

export const AUDIO_TRACK_KINDS = ['music', 'voice'] as const;
export type AudioTrackKind = (typeof AUDIO_TRACK_KINDS)[number];

/**
 * Дорожка в общем списке звука.
 *
 * `kind` не косметика: под голос музыка приглушается, и рендер должен понимать, что чем
 * является. Идентификатор нужен редактору, чтобы двигать конкретную дорожку.
 */
export const timelineNamedAudioTrackSchema = timelineAudioTrackSchema.extend({
  id: z.string().trim().min(1).max(80),
  kind: z.enum(AUDIO_TRACK_KINDS),
  title: z.string().trim().max(120).optional(),
});

export type TimelineNamedAudioTrack = z.infer<typeof timelineNamedAudioTrackSchema>;

export const timelineSchema = z.object({
  version: z.literal(TIMELINE_VERSION).default(TIMELINE_VERSION),
  aspect: z.enum(TIMELINE_ASPECTS).default('9:16'),
  /**
   * Прежняя форма записи: кадры друг за другом. Пусто, если ролик собран дорожками.
   * Читать сцены нужно через timelineScenes(), а не отсюда: тогда обе формы работают.
   */
  scenes: z.array(timelineSceneSchema).max(TIMELINE_LIMITS.maxScenes).default([]),
  /**
   * Дорожки с клипами на своих секундах — то, как ролик собирают в редакторе.
   * Схема лежит в ./tracks, а не здесь, чтобы не было кольцевого импорта: там она
   * ссылается на схему слоёв, а слои — на этот файл.
   */
  tracks: z.array(z.unknown()).max(8).optional(),
  /** Фоновая музыка на весь ролик. */
  music: timelineAudioTrackSchema.optional(),
  /**
   * Озвучка. Отдельная дорожка, потому что под неё музыка приглушается —
   * иначе на телефонном динамике голос тонет в фоне.
   */
  voiceover: timelineAudioTrackSchema.optional(),
  /**
   * Все звуковые дорожки ролика. Музыки и голоса может быть несколько: одна реплика на
   * ролик — это ограничение, а не замысел.
   *
   * Поля `music` и `voiceover` выше остались для роликов, записанных до этого списка, и
   * для шаблонов поздравлений, где дорожка ровно одна. Читать звук нужно через
   * `timelineAudioTracks()`, а не напрямую: тогда обе формы работают одинаково.
   */
  audio: z.array(timelineNamedAudioTrackSchema).max(TIMELINE_LIMITS.maxAudioTracks).optional(),
})
  // Ролик обязан быть записан хоть как-то: пустой таймлайн нечего ни показывать, ни собирать.
  .superRefine((value, ctx) => {
    const hasScenes = value.scenes.length > 0;
    const hasTracks = Array.isArray(value.tracks) && value.tracks.length > 0;
    if (!hasScenes && !hasTracks) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes'], message: 'В ролике нет ни одной сцены.' });
    }
  });

export type Timeline = z.infer<typeof timelineSchema>;

/** Разбор с подстановкой значений по умолчанию. Бросает ZodError на кривом таймлайне. */
export function parseTimeline(value: unknown): Timeline {
  return timelineSchema.parse(value);
}
