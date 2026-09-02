import { collageBoxes, mediaLayerSchema, parseTimeline, timelineResolution } from '@allvision/shared';
import { planFinal, planScene, timelineRenderShape, type LayerInput } from '../blocks/timeline-plan';

const { width, height } = timelineResolution('9:16');

function videoScene(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scene_1',
    source: { kind: 'video', url: 'https://cdn.test/clip.mp4' },
    durationSec: 5,
    ...overrides,
  };
}

/** Слой с файлом на диске — то, что планировщик получает после материализации. */
function layerInput(overrides: Record<string, unknown> = {}, extra: Partial<LayerInput> = {}): LayerInput {
  const layer = mediaLayerSchema.parse({
    id: 'l1',
    kind: 'media',
    source: { kind: 'video', url: 'https://cdn.test/clip.mp4' },
    ...overrides,
  });
  return { layer, kind: 'video', path: '/tmp/clip.mp4', hasAudio: true, ...extra };
}

/** Значение аргумента, идущего сразу за флагом. */
function argAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function filterGraph(args: string[]): string {
  return argAfter(args, '-filter_complex') ?? '';
}

function scenePlan(layers: LayerInput[], sceneOverrides: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  const timeline = parseTimeline({ scenes: [videoScene(sceneOverrides)] });
  return planScene({
    scene: timeline.scenes[0],
    layers,
    overlays: [],
    width,
    height,
    index: 0,
    outputName: '/tmp/scene-0.mp4',
    photoMotion: true,
    quality: 'balanced',
    ...options,
  });
}

describe('planScene: скорость слоя', () => {
  it('ускоренный слой читает из файла пропорционально больше и сжимает метки времени', () => {
    const plan = scenePlan([layerInput({ speed: 2, trimStartSec: 1 })], { durationSec: 4 });
    // Первый -t принадлежит подложке, поэтому смотрим тот, что стоит у самого файла.
    const fileIndex = plan.args.indexOf('/tmp/clip.mp4');
    // Четыре секунды экрана при двойной скорости — восемь секунд записи.
    expect(plan.args[fileIndex - 2]).toBe('8.000');
    expect(argAfter(plan.args, '-ss')).toBe('1.000');
    expect(filterGraph(plan.args)).toContain('setpts=0.50000*PTS');
  });

  it('звук ускоряется вместе с картинкой, иначе разъедется с губами', () => {
    const graph = filterGraph(scenePlan([layerInput({ speed: 2 })]).args);
    expect(graph).toContain('atempo=2.0000');
  });

  it('крайняя скорость набирается двумя ступенями atempo', () => {
    const graph = filterGraph(scenePlan([layerInput({ speed: 0.25 })]).args);
    expect(graph.match(/atempo=0.5/g)?.length).toBe(2);
  });

  it('обычный слой команду не меняет', () => {
    const graph = filterGraph(scenePlan([layerInput()]).args);
    expect(graph).not.toContain('setpts=');
    expect(graph).not.toContain('atempo=');
  });
});

describe('planScene', () => {
  it('always starts from a full-frame background so layers have a stable base', () => {
    const plan = scenePlan([layerInput()]);
    expect(plan.args.join(' ')).toContain(`color=c=#000000:s=${width}x${height}`);
    expect(filterGraph(plan.args)).toContain('[base]');
  });

  it('trims video with -ss before the input so the seek stays fast', () => {
    const plan = scenePlan([layerInput({ trimStartSec: 3, trimEndSec: 7 })], { trimStartSec: 3, trimEndSec: 7 });
    expect(argAfter(plan.args, '-ss')).toBe('3.000');
    // -ss должен стоять перед входом СВОЕГО слоя (нулевой вход — подложка).
    const ssIndex = plan.args.indexOf('-ss');
    const nextInput = plan.args.indexOf('-i', ssIndex);
    expect(plan.args[nextInput + 1]).toBe('/tmp/clip.mp4');
  });

  it('composites several layers bottom-up, each into its own box', () => {
    const [left, right] = collageBoxes('side-by-side');
    const plan = scenePlan([
      layerInput({ id: 'a', box: left, fit: 'cover' }),
      layerInput({ id: 'b', box: right, fit: 'cover' }, { path: '/tmp/b.mp4' }),
    ]);
    const graph = filterGraph(plan.args);

    // Первый слой ложится на подложку, второй — поверх первого.
    expect(graph).toContain('[base][l0]overlay=0:0');
    expect(graph).toContain('[v0][l1]overlay=');
    // Правый кадр начинается примерно с середины кадра.
    const rightX = Math.round(right.x * width);
    expect(graph).toContain(`[v0][l1]overlay=${rightX}:0`);
  });

  it('centres a contain layer inside its box instead of pinning it to the corner', () => {
    const graph = filterGraph(scenePlan([layerInput({ fit: 'contain' })]).args);
    expect(graph).toContain('overlay=0+(1080-overlay_w)/2');
  });

  it('crops the source rect before scaling when the user cropped the layer', () => {
    const graph = filterGraph(
      scenePlan([layerInput({ crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } })]).args,
    );
    expect(graph).toContain('crop=iw*0.500:ih*0.600:iw*0.100:ih*0.200');
  });

  it('rotates a layer with transparent corners', () => {
    const graph = filterGraph(scenePlan([layerInput({ rotation: 15 })]).args);
    expect(graph).toContain('rotate=');
    expect(graph).toContain('c=none@0');
  });

  it('adds silence when no layer carries audio, so every scene has a track to mix', () => {
    const plan = scenePlan([layerInput({}, {})], {}, {});
    expect(plan.args.join(' ')).toContain('anullsrc');

    const silent = scenePlan([layerInput({ muted: true })]);
    expect(filterGraph(silent.args)).toContain('aformat=sample_fmts=fltp:channel_layouts=stereo[aout]');
  });

  it('mixes audio of two sounding layers at full volume', () => {
    const graph = filterGraph(
      scenePlan([
        layerInput({ id: 'a' }),
        layerInput({ id: 'b' }, { path: '/tmp/b.mp4' }),
      ]).args,
    );
    // normalize=0 — иначе два слоя со звуком зазвучали бы вдвое тише каждого.
    expect(graph).toContain('amix=inputs=2:normalize=0');
  });

  it('gives a single full-frame photo a slow zoom, but leaves collage tiles still', () => {
    const photo = layerInput({ source: { kind: 'image', url: 'https://cdn.test/a.jpg' } }, {
      kind: 'image',
      path: '/tmp/a.jpg',
      hasAudio: false,
    });
    expect(filterGraph(scenePlan([photo]).args)).toContain('zoompan');

    const [left, right] = collageBoxes('side-by-side');
    const tiles = filterGraph(
      scenePlan([
        layerInput({ id: 'a', box: left, source: { kind: 'image', url: 'https://cdn.test/a.jpg' } }, { kind: 'image', path: '/tmp/a.jpg', hasAudio: false }),
        layerInput({ id: 'b', box: right, source: { kind: 'image', url: 'https://cdn.test/b.jpg' } }, { kind: 'image', path: '/tmp/b.jpg', hasAudio: false }),
      ]).args,
    );
    // Наезд на каждую плитку коллажа выглядел бы дёргано, поэтому его там нет.
    expect(tiles).not.toContain('zoompan');
  });

  it('limits a layer to its own visibility window', () => {
    const graph = filterGraph(scenePlan([layerInput({ startSec: 1, endSec: 3 })]).args);
    expect(graph).toContain("enable='between(t,1.000,3.000)'");
  });

  it('burns titles with their scene-relative timing', () => {
    const timeline = parseTimeline({ scenes: [videoScene()] });
    const plan = planScene({
      scene: timeline.scenes[0],
      layers: [layerInput()],
      overlays: [{ path: '/tmp/o1.png', startSec: 1, endSec: 4 }],
      width,
      height,
      index: 0,
      outputName: '/tmp/scene-0.mp4',
      photoMotion: true,
      quality: 'balanced',
    });
    expect(filterGraph(plan.args)).toContain("overlay=0:0:enable='between(t,1.000,4.000)'");
  });
});

describe('planFinal', () => {
  it('joins cuts with concat and transitions with xfade at the computed offset', () => {
    const timeline = parseTimeline({
      scenes: [
        videoScene({ id: 'a' }),
        videoScene({ id: 'b', transition: 'dissolve', transitionDurationSec: 1 }),
        videoScene({ id: 'c' }),
      ],
    });
    const final = planFinal({
      timeline,
      scenePaths: ['/tmp/0.mp4', '/tmp/1.mp4', '/tmp/2.mp4'],
      outputPath: '/tmp/out.mp4',
      quality: 'balanced',
    });
    const graph = filterGraph(final.args);

    expect(graph).toContain('[0:v][1:v]concat=n=2:v=1:a=0[vx1]');
    // Вторая сцена уходит в третью через растворение, начиная с её позиции в ролике.
    expect(graph).toContain('xfade=transition=fade:duration=1.000:offset=9.000');
    expect(final.totalDurationSec).toBe(14);
  });

  it('places each scene audio at its own second and keeps the mix at full volume', () => {
    const timeline = parseTimeline({ scenes: [videoScene({ id: 'a' }), videoScene({ id: 'b' })] });
    const graph = filterGraph(planFinal({
      timeline,
      scenePaths: ['/tmp/0.mp4', '/tmp/1.mp4'],
      outputPath: '/tmp/out.mp4',
      quality: 'balanced',
    }).args);

    expect(graph).toContain('[0:a]adelay=0|0');
    expect(graph).toContain('[1:a]adelay=5000|5000');
    // normalize=0 — иначе ролик из нескольких сцен звучал бы во столько же раз тише.
    expect(graph).toContain('amix=inputs=2:normalize=0');
  });

  it('loops music and fades it out at the end of the video', () => {
    const timeline = parseTimeline({
      scenes: [videoScene()],
      music: { url: 'https://cdn.test/track.mp3', volume: 0.6, fadeOutSec: 2, loop: true },
    });
    const final = planFinal({
      timeline,
      scenePaths: ['/tmp/0.mp4'],
      audioPaths: ['/tmp/track.mp3'],
      outputPath: '/tmp/out.mp4',
      quality: 'balanced',
    });

    expect(final.args).toContain('-stream_loop');
    const graph = filterGraph(final.args);
    expect(graph).toContain('volume=0.600');
    expect(graph).toContain('afade=t=out:st=3.000:d=2.000');
  });

  it('mixes several music and voice tracks at once', () => {
    // Одна реплика на ролик была ограничением, а не замыслом: теперь дорожек может быть
    // сколько угодно, и каждая получает свою задержку и громкость.
    const timeline = parseTimeline({
      scenes: [videoScene()],
      audio: [
        { id: 'm1', kind: 'music', url: 'https://cdn.test/a.mp3', volume: 0.5, loop: false, fadeInSec: 0, fadeOutSec: 0 },
        { id: 'v1', kind: 'voice', url: 'https://cdn.test/v1.mp3', volume: 1, startAtSec: 1, loop: false, fadeInSec: 0, fadeOutSec: 0 },
        { id: 'v2', kind: 'voice', url: 'https://cdn.test/v2.mp3', volume: 1, startAtSec: 3, loop: false, fadeInSec: 0, fadeOutSec: 0 },
      ],
    });
    const graph = filterGraph(planFinal({
      timeline,
      scenePaths: ['/tmp/0.mp4'],
      audioPaths: ['/tmp/a.mp3', '/tmp/v1.mp3', '/tmp/v2.mp3'],
      outputPath: '/tmp/out.mp4',
      quality: 'balanced',
    }).args);

    // Сцена плюс три дорожки.
    expect(graph).toContain('amix=inputs=4:normalize=0');
    expect(graph).toContain('adelay=1000|1000');
    expect(graph).toContain('adelay=3000|3000');
    // Музыка уходит в фон, потому что в ролике есть голос.
    expect(graph).toContain('volume=0.175');
  });

  it('skips a track whose file could not be downloaded', () => {
    // Ролик без одной дорожки лучше, чем упавший рендер: остальное уже собрано.
    const timeline = parseTimeline({
      scenes: [videoScene()],
      audio: [
        { id: 'm1', kind: 'music', url: 'https://cdn.test/a.mp3', volume: 0.5, loop: false, fadeInSec: 0, fadeOutSec: 0 },
        { id: 'm2', kind: 'music', url: 'https://cdn.test/b.mp3', volume: 0.5, loop: false, fadeInSec: 0, fadeOutSec: 0 },
      ],
    });
    const graph = filterGraph(planFinal({
      timeline,
      scenePaths: ['/tmp/0.mp4'],
      audioPaths: ['/tmp/a.mp3', ''],
      outputPath: '/tmp/out.mp4',
      quality: 'balanced',
    }).args);

    expect(graph).toContain('amix=inputs=2:normalize=0');
  });

  it('ducks the music under a voiceover', () => {
    const timeline = parseTimeline({
      scenes: [videoScene()],
      music: { url: 'https://cdn.test/track.mp3', volume: 0.8 },
      voiceover: { url: 'https://cdn.test/voice.mp3', volume: 1 },
    });
    const graph = filterGraph(planFinal({
      timeline,
      scenePaths: ['/tmp/0.mp4'],
      audioPaths: ['/tmp/track.mp3', '/tmp/voice.mp3'],
      outputPath: '/tmp/out.mp4',
      quality: 'balanced',
    }).args);

    // 0.8 * 0.35 — голос должен быть слышен на телефонном динамике.
    expect(graph).toContain('volume=0.280');
    expect(graph).toContain('[atrack1]');
    expect(graph).toContain('amix=inputs=3:normalize=0');
  });
});

describe('timelineRenderShape', () => {
  it('reports the target frame and total duration before ffmpeg runs', () => {
    const timeline = parseTimeline({ aspect: '1:1', scenes: [videoScene(), videoScene({ id: 'b' })] });
    expect(timelineRenderShape(timeline)).toEqual({ width: 1080, height: 1080, totalDurationSec: 10 });
  });
});

/**
 * Ролик, собранный дорожками, доходит до ffmpeg через ту же цепочку, что и ролик из сцен:
 * дорожки раскладываются в сцены на чтении. Проверяем именно стык — что планировщик видит
 * разложенные клипы, а не пустой список.
 */
describe('ролик на дорожках', () => {
  function trackTimeline() {
    return parseTimeline({
      aspect: '9:16',
      scenes: [],
      tracks: [
        {
          id: 'main',
          clips: [
            {
              id: 'c1',
              startSec: 0,
              durationSec: 4,
              transition: 'dissolve',
              layer: { id: 'c1_l', kind: 'media', source: { kind: 'image', url: 'https://cdn.test/1.jpg' } },
            },
            {
              id: 'c2',
              startSec: 3.5,
              durationSec: 4,
              layer: { id: 'c2_l', kind: 'media', source: { kind: 'image', url: 'https://cdn.test/2.jpg' } },
            },
          ],
        },
      ],
    });
  }

  it('длительность считается по позициям клипов, а не по сумме длин', () => {
    // 4 + 4 с наложением 0.5 = 7.5, а не 8.
    expect(timelineRenderShape(trackTimeline()).totalDurationSec).toBeCloseTo(7.5, 3);
  });

  it('склейка получает переход на той же секунде, где стоит клип', () => {
    const graph = filterGraph(planFinal({
      timeline: trackTimeline(),
      scenePaths: ['/tmp/s0.mp4', '/tmp/s1.mp4'],
      outputPath: '/tmp/out.mp4',
      quality: 'balanced',
    }).args);
    expect(graph).toContain('xfade=transition=fade:duration=0.500:offset=3.500');
  });
});
