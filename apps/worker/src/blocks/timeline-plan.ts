import {
  TIMELINE_FPS,
  sceneDurationSec,
  timelineResolution,
  timelineTimings,
  timelineDurationSec,
  layerRect,
  type MediaLayer,
  type Timeline,
  type TimelineScene,
  type TimelineTransition,
} from '@allvision/shared';

/**
 * Планировщик ffmpeg-команд для сборки ролика.
 *
 * Вынесен из исполнителя намеренно: здесь нет ни файловой системы, ни сети, ни ffmpeg,
 * поэтому раскладку сцен, переходы и микс звука можно проверять тестами без окружения.
 */


export type ScenePlan = {
  index: number;
  sceneId: string;
  durationSec: number;
  outputName: string;
  args: string[];
};

export type FinalPlan = {
  args: string[];
  totalDurationSec: number;
};

export type TimelineRenderPlan = {
  scenes: ScenePlan[];
  final: FinalPlan;
  width: number;
  height: number;
  totalDurationSec: number;
};

/** Наши переходы в терминах ffmpeg xfade. */
const XFADE_BY_TRANSITION: Record<Exclude<TimelineTransition, 'cut'>, string> = {
  dissolve: 'fade',
  'fade-black': 'fadeblack',
  slide: 'slideleft',
};

const ENCODE_PRESETS = {
  fast: { preset: 'veryfast', crf: '23' },
  balanced: { preset: 'medium', crf: '20' },
  high: { preset: 'slow', crf: '18' },
} as const;

export type EncodeQuality = keyof typeof ENCODE_PRESETS;

function fixed(value: number, digits = 3): string {
  return value.toFixed(digits);
}

export type SceneOverlayFile = {
  path: string;
  /** Секунды от начала сцены. */
  startSec: number;
  endSec: number;
};

/** Материализованный слой: геометрия из таймлайна плюс файл на диске. */
export type LayerInput = {
  layer: MediaLayer;
  kind: 'video' | 'image' | 'color';
  /** Путь к файлу для video/image. */
  path?: string;
  color?: string;
  hasAudio: boolean;
};

/** Пиксельная рамка слоя в кадре. */
function boxRect(layer: MediaLayer, width: number, height: number) {
  const rect = layerRect(layer.box, width, height);
  // Чётные размеры: yuv420p не умеет нечётные, и ffmpeg падает уже на выводе.
  return {
    x: rect.x,
    y: rect.y,
    w: Math.max(2, rect.width - (rect.width % 2)),
    h: Math.max(2, rect.height - (rect.height % 2)),
  };
}

/**
 * Цепочка подготовки одного слоя: обрезка источника, вписывание в рамку, поворот.
 *
 * cover заполняет рамку и срезает лишнее, contain вписывает целиком — то же различие,
 * что у object-fit в браузере, чтобы предпросмотр и экспорт понимали слой одинаково.
 */
function layerFilter(input: LayerInput, box: { w: number; h: number }, durationSec: number, photoMotion: boolean): string {
  const stages: string[] = [];
  const crop = input.layer.crop;
  if (crop && (crop.x > 0 || crop.y > 0 || crop.w < 1 || crop.h < 1)) {
    stages.push(`crop=iw*${fixed(crop.w)}:ih*${fixed(crop.h)}:iw*${fixed(crop.x)}:ih*${fixed(crop.y)}`);
  }

  if (input.kind === 'image' && photoMotion) {
    // Лёгкий наезд на фото: статичный кадр на несколько секунд выглядит как зависший.
    // Работаем на удвоенном размере, иначе zoompan заметно мылит картинку.
    const frames = Math.max(1, Math.round(durationSec * TIMELINE_FPS));
    stages.push(`scale=${box.w * 2}:${box.h * 2}:force_original_aspect_ratio=increase`);
    stages.push(`crop=${box.w * 2}:${box.h * 2}`);
    stages.push(
      `zoompan=z='min(zoom+0.0009,1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${box.w}x${box.h}:fps=${TIMELINE_FPS}`,
    );
  } else if (input.layer.fit === 'cover') {
    stages.push(`scale=${box.w}:${box.h}:force_original_aspect_ratio=increase`);
    stages.push(`crop=${box.w}:${box.h}`);
  } else {
    stages.push(`scale=${box.w}:${box.h}:force_original_aspect_ratio=decrease`);
  }

  stages.push('setsar=1', `fps=${TIMELINE_FPS}`, 'format=rgba');

  if (input.layer.rotation !== 0) {
    const radians = (input.layer.rotation * Math.PI) / 180;
    // ow/oh расширяют холст под повёрнутый кадр, c=none@0 — прозрачные углы.
    stages.push(`rotate=${radians.toFixed(4)}:ow=rotw(${radians.toFixed(4)}):oh=roth(${radians.toFixed(4)}):c=none@0`);
  }
  if (input.layer.opacity < 1) {
    stages.push(`colorchannelmixer=aa=${fixed(input.layer.opacity, 2)}`);
  }
  return stages.join(',');
}

/** Окно видимости слоя внутри сцены. Пусто — слой виден всю сцену. */
function enableExpr(startSec: number | undefined, endSec: number | undefined, durationSec: number): string {
  const start = Math.max(0, startSec ?? 0);
  const end = Math.min(durationSec, endSec ?? durationSec);
  if (start <= 0 && end >= durationSec) return '';
  return `:enable='between(t,${fixed(start)},${fixed(end)})'`;
}

/**
 * Команда сборки одной сцены: подложка, слои поверх неё, титры и звук.
 *
 * Сцена больше не «один файл»: слои накладываются снизу вверх, каждый в своей рамке.
 * Титры выжигаются здесь же — их время задано относительно сцены, а на стыке переход
 * красиво уводит титр вместе с кадром.
 */
export function planScene(input: {
  scene: TimelineScene;
  layers: LayerInput[];
  overlays: SceneOverlayFile[];
  width: number;
  height: number;
  index: number;
  outputName: string;
  photoMotion: boolean;
  quality: EncodeQuality;
}): ScenePlan {
  const { scene, layers, overlays, width, height, index, outputName, quality } = input;
  const durationSec = sceneDurationSec(scene);
  const background = scene.background ?? '#000000';
  const args: string[] = ['-y'];

  // Вход 0 — подложка на весь кадр. Она даёт стабильную основу нужного размера,
  // поэтому слоям не нужно ничем добивать кадр до целого.
  args.push('-f', 'lavfi', '-t', fixed(durationSec), '-i', `color=c=${background}:s=${width}x${height}:r=${TIMELINE_FPS}`);

  const layerIndexes: number[] = [];
  for (const item of layers) {
    layerIndexes.push(args.filter((arg) => arg === '-i').length);
    if (item.kind === 'video') {
      const trimStart = item.layer.trimStartSec ?? 0;
      if (trimStart > 0) args.push('-ss', fixed(trimStart));
      args.push('-t', fixed(durationSec), '-i', item.path ?? '');
    } else if (item.kind === 'image') {
      args.push('-loop', '1', '-t', fixed(durationSec), '-i', item.path ?? '');
    } else {
      args.push('-f', 'lavfi', '-t', fixed(durationSec), '-i', `color=c=${item.color ?? '#000000'}:s=${width}x${height}:r=${TIMELINE_FPS}`);
    }
  }

  const overlayIndexes: number[] = [];
  for (const overlay of overlays) {
    overlayIndexes.push(args.filter((arg) => arg === '-i').length);
    args.push('-i', overlay.path);
  }

  const audioLayers = layers
    .map((item, position) => ({ item, inputIndex: layerIndexes[position] }))
    .filter(({ item }) => item.kind === 'video' && item.hasAudio && !item.layer.muted && item.layer.volume > 0);

  const silenceIndex = args.filter((arg) => arg === '-i').length;
  args.push('-f', 'lavfi', '-t', fixed(durationSec), '-i', 'anullsrc=r=48000:cl=stereo');

  const chain: string[] = [];
  chain.push(`[0:v]format=rgba,fps=${TIMELINE_FPS},setsar=1[base]`);

  let videoLabel = 'base';
  layers.forEach((item, position) => {
    const box = boxRect(item.layer, width, height);
    const singleFullFrame = layers.length === 1 && item.layer.box.w >= 0.999 && item.layer.box.h >= 0.999;
    const prepared = `l${position}`;
    chain.push(
      `[${layerIndexes[position]}:v]${layerFilter(item, box, durationSec, input.photoMotion && item.kind === 'image' && singleFullFrame)}[${prepared}]`,
    );
    // contain оставляет кадр меньше рамки, поэтому кладём его по центру рамки.
    const x = item.layer.fit === 'cover' ? String(box.x) : `${box.x}+(${box.w}-overlay_w)/2`;
    const y = item.layer.fit === 'cover' ? String(box.y) : `${box.y}+(${box.h}-overlay_h)/2`;
    const next = `v${position}`;
    chain.push(
      `[${videoLabel}][${prepared}]overlay=${x}:${y}${enableExpr(item.layer.startSec, item.layer.endSec, durationSec)}[${next}]`,
    );
    videoLabel = next;
  });

  overlays.forEach((overlay, position) => {
    const next = `t${position}`;
    chain.push(
      `[${videoLabel}][${overlayIndexes[position]}:v]overlay=0:0:enable='between(t,${fixed(overlay.startSec)},${fixed(overlay.endSec)})'[${next}]`,
    );
    videoLabel = next;
  });

  chain.push(`[${videoLabel}]format=yuv420p[vout]`);

  if (audioLayers.length === 0) {
    chain.push(`[${silenceIndex}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`);
  } else {
    const labels: string[] = [];
    audioLayers.forEach(({ item, inputIndex }, position) => {
      const label = `la${position}`;
      chain.push(
        `[${inputIndex}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${fixed(item.layer.volume, 2)}[${label}]`,
      );
      labels.push(label);
    });
    if (labels.length === 1) {
      chain.push(`[${labels[0]}]anull[aout]`);
    } else {
      // normalize=0 — иначе два слоя со звуком зазвучали бы вдвое тише каждого.
      chain.push(`${labels.map((label) => `[${label}]`).join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[aout]`);
    }
  }

  const encode = ENCODE_PRESETS[quality] ?? ENCODE_PRESETS.balanced;
  args.push(
    '-filter_complex', chain.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', encode.preset,
    '-crf', encode.crf,
    '-pix_fmt', 'yuv420p',
    '-r', String(TIMELINE_FPS),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-t', fixed(durationSec),
    outputName,
  );

  return { index, sceneId: scene.id, durationSec, outputName, args };
}

export type FinalPlanInput = {
  timeline: Timeline;
  scenePaths: string[];
  musicPath?: string;
  voiceoverPath?: string;
  outputPath: string;
  quality: EncodeQuality;
};

/**
 * Финальная склейка: переходы по видео, микс звука по всем сценам плюс музыка и озвучка.
 *
 * Стык «встык» делается concat, а не xfade нулевой длины: xfade требует положительной
 * длительности и сдвинул бы весь дальнейший тайминг относительно расчётного.
 */
/**
 * Обрезка начала аудиофайла.
 *
 * asetpts обязателен: без него отрезанный кусок сохраняет исходные метки времени и
 * вступает в ролике позже, чем просили, — а поверх ещё ляжет adelay, и звук уедет.
 */
function trimStages(trimStartSec?: number): string[] {
  if (!trimStartSec || trimStartSec <= 0) return [];
  return [`atrim=start=${fixed(trimStartSec)}`, 'asetpts=PTS-STARTPTS'];
}

export function planFinal(input: FinalPlanInput): FinalPlan {
  const { timeline, scenePaths, musicPath, voiceoverPath, outputPath, quality } = input;
  const timings = timelineTimings(timeline);
  const totalDurationSec = timelineDurationSec(timeline);
  const args: string[] = ['-y'];

  for (const scenePath of scenePaths) {
    args.push('-i', scenePath);
  }

  let musicIndex = -1;
  if (musicPath && timeline.music) {
    if (timeline.music.loop) args.push('-stream_loop', '-1');
    args.push('-i', musicPath);
    musicIndex = scenePaths.length;
  }

  let voiceIndex = -1;
  if (voiceoverPath && timeline.voiceover) {
    args.push('-i', voiceoverPath);
    voiceIndex = musicIndex >= 0 ? musicIndex + 1 : scenePaths.length;
  }

  const chain: string[] = [];

  // Видео: накопительная цепочка слева направо.
  let videoLabel = '0:v';
  for (let i = 1; i < scenePaths.length; i += 1) {
    const previous = timings[i - 1];
    const label = `vx${i}`;
    if (previous.transitionOutSec <= 0) {
      chain.push(`[${videoLabel}][${i}:v]concat=n=2:v=1:a=0[${label}]`);
    } else {
      const transition = XFADE_BY_TRANSITION[previous.scene.transition as Exclude<TimelineTransition, 'cut'>] ?? 'fade';
      chain.push(
        `[${videoLabel}][${i}:v]xfade=transition=${transition}:duration=${fixed(previous.transitionOutSec)}:offset=${fixed(timings[i].startSec)}[${label}]`,
      );
    }
    videoLabel = label;
  }

  // Звук: каждая сцена сдвигается на своё место в ролике, затем всё смешивается.
  // На стыках с переходом дорожки просто накладываются — это звучит как кроссфейд
  // и не требует зеркалить всю цепочку xfade ещё и в аудио.
  const audioLabels: string[] = [];
  timings.forEach((timing, index) => {
    const label = `a${index}`;
    const delayMs = Math.round(timing.startSec * 1000);
    const stages = [`adelay=${delayMs}|${delayMs}`, 'aformat=sample_fmts=fltp:channel_layouts=stereo'];
    chain.push(`[${index}:a]${stages.join(',')}[${label}]`);
    audioLabels.push(label);
  });

  const hasVoice = voiceIndex >= 0;
  if (musicIndex >= 0 && timeline.music) {
    const music = timeline.music;
    // Под озвучку музыка уводится в фон фиксированным коэффициентом. Это грубее
    // сайдчейн-компрессии, но предсказуемо и не зависит от версии ffmpeg.
    const volume = hasVoice ? music.volume * 0.35 : music.volume;
    const stages = [...trimStages(music.trimStartSec), `volume=${fixed(volume, 3)}`];
    if (music.startAtSec > 0) {
      const delayMs = Math.round(music.startAtSec * 1000);
      stages.push(`adelay=${delayMs}|${delayMs}`);
    }
    if (music.fadeInSec > 0) {
      stages.push(`afade=t=in:st=${fixed(music.startAtSec)}:d=${fixed(music.fadeInSec)}`);
    }
    if (music.fadeOutSec > 0) {
      stages.push(`afade=t=out:st=${fixed(Math.max(0, totalDurationSec - music.fadeOutSec))}:d=${fixed(music.fadeOutSec)}`);
    }
    stages.push('aformat=sample_fmts=fltp:channel_layouts=stereo');
    chain.push(`[${musicIndex}:a]${stages.join(',')}[amusic]`);
    audioLabels.push('amusic');
  }

  if (hasVoice && timeline.voiceover) {
    const voice = timeline.voiceover;
    const stages = [...trimStages(voice.trimStartSec), `volume=${fixed(voice.volume, 3)}`];
    if (voice.startAtSec > 0) {
      const delayMs = Math.round(voice.startAtSec * 1000);
      stages.push(`adelay=${delayMs}|${delayMs}`);
    }
    stages.push('aformat=sample_fmts=fltp:channel_layouts=stereo');
    chain.push(`[${voiceIndex}:a]${stages.join(',')}[avoice]`);
    audioLabels.push('avoice');
  }

  // normalize=0 — иначе amix делит громкость на число входов и ролик из десяти сцен
  // звучит в десять раз тише.
  chain.push(`${audioLabels.map((label) => `[${label}]`).join('')}amix=inputs=${audioLabels.length}:normalize=0:dropout_transition=0[aout]`);

  const encode = ENCODE_PRESETS[quality] ?? ENCODE_PRESETS.balanced;
  args.push(
    '-filter_complex', chain.join(';'),
    '-map', videoLabel.startsWith('vx') ? `[${videoLabel}]` : `${videoLabel}`,
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', encode.preset,
    '-crf', encode.crf,
    '-pix_fmt', 'yuv420p',
    '-r', String(TIMELINE_FPS),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-t', fixed(totalDurationSec),
    '-movflags', '+faststart',
    outputPath,
  );

  return { args, totalDurationSec };
}

/** Размер кадра и общая длительность — то, что нужно знать до запуска ffmpeg. */
export function timelineRenderShape(timeline: Timeline) {
  const { width, height } = timelineResolution(timeline.aspect);
  return { width, height, totalDurationSec: timelineDurationSec(timeline) };
}
