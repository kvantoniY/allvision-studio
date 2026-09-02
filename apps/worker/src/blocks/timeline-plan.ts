import {
  TIMELINE_FPS,
  audioTrackEndSec,
  sceneDurationSec,
  timelineResolution,
  timelineAudioTracks,
  timelineTimings,
  timelineDurationSec,
  layerRect,
  layerSpeed,
  type MediaLayer,
  type Timeline,
  type TimelineNamedAudioTrack,
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
 * Ускорение звука.
 *
 * atempo меняет темп не больше чем вдвое за проход, поэтому крайние значения набираются
 * двумя ступенями. Именно из этого взяты границы скорости 0.25–4: дальше пришлось бы
 * городить третью ступень, а голос к тому моменту уже перестаёт быть голосом.
 */
function atempoStages(speed: number): string[] {
  if (Math.abs(speed - 1) < 0.001) return [];
  const stages: string[] = [];
  let rest = speed;
  while (rest > 2.001) {
    stages.push('atempo=2.0');
    rest /= 2;
  }
  while (rest < 0.499) {
    stages.push('atempo=0.5');
    rest *= 2;
  }
  stages.push(`atempo=${fixed(rest, 4)}`);
  return stages;
}

/**
 * Цепочка подготовки одного слоя: обрезка источника, вписывание в рамку, поворот.
 *
 * cover заполняет рамку и срезает лишнее, contain вписывает целиком — то же различие,
 * что у object-fit в браузере, чтобы предпросмотр и экспорт понимали слой одинаково.
 */
function layerFilter(input: LayerInput, box: { w: number; h: number }, durationSec: number, photoMotion: boolean): string {
  const stages: string[] = [];
  const speed = layerSpeed(input.layer);
  if (input.kind === 'video' && Math.abs(speed - 1) >= 0.001) {
    // Кадры не выбрасываем и не дублируем — только пересчитываем метки времени;
    // ровный fps ниже приводит результат к частоте ролика.
    stages.push(`setpts=${fixed(1 / speed, 5)}*PTS`);
  }
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
      args.push('-t', fixed(durationSec * layerSpeed(item.layer)), '-i', item.path ?? '');
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
      const stages = [
        'aresample=48000',
        'aformat=sample_fmts=fltp:channel_layouts=stereo',
        ...atempoStages(layerSpeed(item.layer)),
        `volume=${fixed(item.layer.volume, 2)}`,
      ];
      chain.push(`[${inputIndex}:a]${stages.join(',')}[${label}]`);
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
  /**
   * Файлы звуковых дорожек в порядке timelineAudioTracks(). Пустая строка — дорожку не
   * удалось скачать, её пропускаем: ролик без одного трека лучше, чем упавший рендер.
   */
  audioPaths?: string[];
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
 * Кусок аудиофайла: с какой секунды и сколько.
 *
 * asetpts обязателен: без него отрезанный кусок сохраняет исходные метки времени и
 * вступает в ролике позже, чем просили, — а поверх ещё ляжет adelay, и звук уедет.
 *
 * Верхняя граница нужна разрезанным дорожкам: без неё второй фрагмент звучал бы поверх
 * первого до конца ролика. Для зацикленного трека она же обрывает бесконечный вход.
 */
function trimStages(trimStartSec?: number, durationSec?: number): string[] {
  const start = trimStartSec && trimStartSec > 0 ? trimStartSec : 0;
  const hasEnd = typeof durationSec === 'number' && durationSec > 0;
  if (start <= 0 && !hasEnd) return [];
  const spec = [`start=${fixed(start)}`];
  if (hasEnd) spec.push(`end=${fixed(start + durationSec)}`);
  return [`atrim=${spec.join(':')}`, 'asetpts=PTS-STARTPTS'];
}

export function planFinal(input: FinalPlanInput): FinalPlan {
  const { timeline, scenePaths, audioPaths = [], outputPath, quality } = input;
  const tracks = timelineAudioTracks(timeline)
    .map((track, index) => ({ track, path: audioPaths[index] }))
    .filter((item): item is { track: TimelineNamedAudioTrack; path: string } => Boolean(item.path));
  const hasVoice = tracks.some((item) => item.track.kind === 'voice');
  const timings = timelineTimings(timeline);
  const totalDurationSec = timelineDurationSec(timeline);
  const args: string[] = ['-y'];

  for (const scenePath of scenePaths) {
    args.push('-i', scenePath);
  }

  const trackInputs = tracks.map((item, order) => {
    // Зацикливание объявляется ПЕРЕД входом, поэтому собираем аргументы здесь же.
    if (item.track.loop) args.push('-stream_loop', '-1');
    args.push('-i', item.path);
    return { ...item, inputIndex: scenePaths.length + order };
  });

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

  trackInputs.forEach((item, order) => {
    const { track, inputIndex } = item;
    // Под голос музыка уводится в фон фиксированным коэффициентом. Это грубее
    // сайдчейн-компрессии, но предсказуемо и не зависит от версии ffmpeg.
    const volume = track.kind === 'music' && hasVoice ? track.volume * 0.35 : track.volume;
    const stages = [...trimStages(track.trimStartSec, track.durationSec), `volume=${fixed(volume, 3)}`];
    if (track.startAtSec > 0) {
      const delayMs = Math.round(track.startAtSec * 1000);
      stages.push(`adelay=${delayMs}|${delayMs}`);
    }
    if (track.fadeInSec > 0) {
      stages.push(`afade=t=in:st=${fixed(track.startAtSec)}:d=${fixed(track.fadeInSec)}`);
    }
    if (track.fadeOutSec > 0) {
      // Затухание привязано к концу САМОЙ дорожки: у фрагмента он раньше конца ролика,
      // и общий хвост увёл бы в тишину не тот кусок.
      const endSec = audioTrackEndSec(track, totalDurationSec);
      stages.push(`afade=t=out:st=${fixed(Math.max(0, endSec - track.fadeOutSec))}:d=${fixed(track.fadeOutSec)}`);
    }
    stages.push('aformat=sample_fmts=fltp:channel_layouts=stereo');
    const label = `atrack${order}`;
    chain.push(`[${inputIndex}:a]${stages.join(',')}[${label}]`);
    audioLabels.push(label);
  });

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
