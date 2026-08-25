import {
  TIMELINE_FPS,
  sceneDurationSec,
  timelineResolution,
  timelineTimings,
  timelineDurationSec,
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

export type ScenePlanInput =
  | { kind: 'video'; path: string; trimStartSec: number; hasAudio: boolean }
  | { kind: 'image'; path: string }
  | { kind: 'color'; color: string };

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

/**
 * Кадр приводится к целевому размеру вписыванием с полями: обрезать чужое видео
 * по краям хуже, чем оставить поля — из кадра может уехать лицо.
 */
function fitFilter(width: number, height: number): string {
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
    `fps=${TIMELINE_FPS}`,
  ].join(',');
}

/**
 * Лёгкий наезд камеры на фотографии: статичное фото на 4 секунды выглядит как ошибка,
 * а не как сцена. Для видео не нужен — там движение уже есть.
 */
function photoMotionFilter(width: number, height: number, durationSec: number): string {
  const frames = Math.max(1, Math.round(durationSec * TIMELINE_FPS));
  // Работаем на удвоенном кадре: zoompan семплирует исходник до зума, и без запаса
  // по разрешению картинка заметно мылится.
  return [
    `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=decrease`,
    `pad=${width * 2}:${height * 2}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `zoompan=z='min(zoom+0.0009,1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${TIMELINE_FPS}`,
    'setsar=1',
  ].join(',');
}

export type SceneOverlayFile = {
  path: string;
  /** Секунды от начала сцены. */
  startSec: number;
  endSec: number;
};

/**
 * Команда нормализации одной сцены: обрезка, приведение к целевому кадру, титры и звук.
 *
 * Титры выжигаются здесь, а не в финальной склейке: их время задано относительно сцены,
 * а на стыке переход красиво уводит титр вместе с кадром.
 */
export function planScene(input: {
  scene: TimelineScene;
  source: ScenePlanInput;
  overlays: SceneOverlayFile[];
  width: number;
  height: number;
  index: number;
  outputName: string;
  photoMotion: boolean;
  quality: EncodeQuality;
}): ScenePlan {
  const { scene, source, overlays, width, height, index, outputName, quality } = input;
  const durationSec = sceneDurationSec(scene);
  const args: string[] = ['-y'];

  if (source.kind === 'video') {
    // -ss перед -i — быстрый поиск по ключевым кадрам; -t после него ограничивает длину.
    if (source.trimStartSec > 0) args.push('-ss', fixed(source.trimStartSec));
    args.push('-t', fixed(durationSec), '-i', source.path);
  } else if (source.kind === 'image') {
    args.push('-loop', '1', '-t', fixed(durationSec), '-i', source.path);
  } else {
    args.push('-f', 'lavfi', '-t', fixed(durationSec), '-i', `color=c=${source.color}:s=${width}x${height}:r=${TIMELINE_FPS}`);
  }

  for (const overlay of overlays) {
    args.push('-i', overlay.path);
  }

  const useSourceAudio = source.kind === 'video' && source.hasAudio && !scene.muted;
  const silenceIndex = 1 + overlays.length;
  if (!useSourceAudio) {
    args.push('-f', 'lavfi', '-t', fixed(durationSec), '-i', 'anullsrc=r=48000:cl=stereo');
  }

  const chain: string[] = [];
  const baseFilter = source.kind === 'image' && input.photoMotion
    ? photoMotionFilter(width, height, durationSec)
    : fitFilter(width, height);
  chain.push(`[0:v]${baseFilter},format=yuv420p[v0]`);

  let videoLabel = 'v0';
  overlays.forEach((overlay, overlayIndex) => {
    const next = `vo${overlayIndex}`;
    const enable = `enable='between(t,${fixed(overlay.startSec)},${fixed(overlay.endSec)})'`;
    chain.push(`[${videoLabel}][${overlayIndex + 1}:v]overlay=0:0:${enable}[${next}]`);
    videoLabel = next;
  });

  const volume = scene.muted ? 0 : scene.volume;
  if (useSourceAudio) {
    chain.push(`[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${fixed(volume, 2)}[aout]`);
  } else {
    chain.push(`[${silenceIndex}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`);
  }

  const encode = ENCODE_PRESETS[quality] ?? ENCODE_PRESETS.balanced;
  args.push(
    '-filter_complex', chain.join(';'),
    '-map', `[${videoLabel}]`,
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
    const stages = [`volume=${fixed(volume, 3)}`];
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
    const stages = [`volume=${fixed(voice.volume, 3)}`];
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
