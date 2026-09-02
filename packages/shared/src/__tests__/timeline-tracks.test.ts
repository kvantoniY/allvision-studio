import {
  applyGeneratedSource,
  clipTransitionSec,
  flattenTracks,
  markLayerGeneration,
  parseTimeline,
  sceneLayers,
  timelineDurationSec,
  timelineScenes,
  timelineTimings,
  timelineTracks,
  tracksFromScenes,
  validateTracks,
  type MediaLayer,
  type TimelineClip,
  type TimelineTrack,
} from '../index';

/**
 * Дорожки проверяются по одному правилу: секунда на шкале и секунда в готовом файле —
 * одно и то же число. Всё остальное (паузы, наложения, переходы) — следствия.
 */

function clip(id: string, startSec: number, durationSec: number, extra?: Partial<TimelineClip>): TimelineClip {
  return {
    id,
    startSec,
    durationSec,
    transition: 'cut',
    layer: {
      id: `${id}_layer`,
      kind: 'media',
      source: { kind: 'image', url: `https://example.ru/${id}.jpg` },
      box: { x: 0, y: 0, w: 1, h: 1 },
      rotation: 0,
      opacity: 1,
      locked: false,
      fit: 'cover',
      muted: false,
      volume: 1,
      cornerRadius: 0,
    },
    ...extra,
  } as TimelineClip;
}

function track(id: string, clips: TimelineClip[], extra?: Partial<TimelineTrack>): TimelineTrack {
  return { id, clips, hidden: false, muted: false, ...extra };
}

describe('flattenTracks', () => {
  it('раскладывает клипы основной дорожки по их секундам', () => {
    const scenes = flattenTracks([track('main', [clip('a', 0, 3), clip('b', 3, 2)])]);
    expect(scenes.map((scene) => scene.id)).toEqual(['a', 'b']);
    expect(scenes.map((scene) => scene.durationSec)).toEqual([3, 2]);
  });

  it('превращает паузу между клипами в заливку, а не пропускает её', () => {
    const scenes = flattenTracks([track('main', [clip('a', 0, 2), clip('b', 5, 2)])]);
    expect(scenes.map((scene) => scene.id)).toEqual(['a', 'gap_2', 'b']);
    expect(scenes[1].durationSec).toBe(3);
    const gapLayers = sceneLayers(scenes[1]);
    expect(gapLayers).toHaveLength(1);
    expect((gapLayers[0] as MediaLayer).source.kind).toBe('color');
  });

  it('наложение клипов с переходом сохраняет позиции: шкала и файл совпадают', () => {
    // Второй клип начинается за полсекунды до конца первого — это и есть переход.
    const tracks = [track('main', [clip('a', 0, 3, { transition: 'dissolve' }), clip('b', 2.5, 3)])];
    const scenes = flattenTracks(tracks);
    expect(scenes[0].transitionDurationSec).toBeCloseTo(0.5, 3);

    const timings = timelineTimings(parseTimeline({ aspect: '9:16', scenes }));
    // Начало второй сцены в собранном ролике — ровно та секунда, на которой клип стоит.
    expect(timings[1].startSec).toBeCloseTo(2.5, 3);
    expect(timelineDurationSec(parseTimeline({ aspect: '9:16', scenes }))).toBeCloseTo(5.5, 3);
  });

  it('наложение без перехода обрезает предыдущий клип, а не сдвигает следующий', () => {
    const scenes = flattenTracks([track('main', [clip('a', 0, 3), clip('b', 2, 2)])]);
    expect(scenes[0].durationSec).toBeCloseTo(2, 3);
    expect(scenes[0].transitionDurationSec).toBeUndefined();
    const timings = timelineTimings(parseTimeline({ aspect: '9:16', scenes }));
    expect(timings[1].startSec).toBeCloseTo(2, 3);
  });

  it('клип верхней дорожки становится слоем с окном видимости', () => {
    const scenes = flattenTracks([
      track('main', [clip('a', 0, 6)]),
      track('over', [clip('badge', 2, 2)]),
    ]);
    expect(scenes).toHaveLength(1);
    const layers = sceneLayers(scenes[0]);
    expect(layers).toHaveLength(2);
    expect(layers[1].startSec).toBeCloseTo(2, 3);
    expect(layers[1].endSec).toBeCloseTo(4, 3);
  });

  it('наложение через стык режется по сценам и не отматывает видео назад', () => {
    const video: TimelineClip = clip('over', 1, 4, {
      layer: {
        id: 'over_layer',
        kind: 'media',
        source: { kind: 'video', url: 'https://example.ru/over.mp4' },
        box: { x: 0, y: 0, w: 0.5, h: 0.5 },
        rotation: 0,
        opacity: 1,
        locked: false,
        fit: 'cover',
        muted: false,
        volume: 1,
        cornerRadius: 0,
        trimStartSec: 10,
      },
    } as Partial<TimelineClip>);

    const scenes = flattenTracks([
      track('main', [clip('a', 0, 3), clip('b', 3, 3)]),
      track('over', [video]),
    ]);
    const first = sceneLayers(scenes[0])[1] as MediaLayer;
    const second = sceneLayers(scenes[1])[1] as MediaLayer;
    // Первая половина берёт 10..12 секунды файла, вторая обязана продолжить с 12-й.
    expect(first.trimStartSec).toBeCloseTo(10, 3);
    expect(first.trimEndSec).toBeCloseTo(12, 3);
    expect(second.trimStartSec).toBeCloseTo(12, 3);
  });

  it('скрытая дорожка не попадает в сцены', () => {
    const scenes = flattenTracks([
      track('main', [clip('a', 0, 3)]),
      track('over', [clip('badge', 0, 3)], { hidden: true }),
    ]);
    expect(sceneLayers(scenes[0])).toHaveLength(1);
  });
});

describe('скорость клипа', () => {
  function videoClip(id: string, startSec: number, durationSec: number, speed: number, trimStartSec = 0): TimelineClip {
    const base = clip(id, startSec, durationSec);
    return {
      ...base,
      layer: {
        ...(base.layer as MediaLayer),
        source: { kind: 'video', url: `https://example.ru/${id}.mp4` },
        speed,
        trimStartSec,
        trimEndSec: trimStartSec + durationSec * speed,
      },
    } as TimelineClip;
  }

  it('ускоренный клип занимает на дорожке столько, сколько поставили', () => {
    const scenes = flattenTracks([track('main', [videoClip('a', 0, 4, 2)])]);
    expect(scenes[0].durationSec).toBe(4);
    // Четыре секунды экрана при двойной скорости — восемь секунд записи.
    const layer = sceneLayers(scenes[0])[0] as MediaLayer;
    expect(layer.trimEndSec! - layer.trimStartSec!).toBeCloseTo(8, 3);
  });

  it('разрез ускоренного клипа приходится на нужную секунду файла', () => {
    // Клип поверх стыка основной дорожки режется на две сцены; вторая обязана продолжить
    // файл с той секунды, где кончилась первая, — с поправкой на скорость.
    const scenes = flattenTracks([
      track('main', [clip('a', 0, 2), clip('b', 2, 2)]),
      track('over', [videoClip('v', 0, 4, 2)]),
    ]);
    const first = sceneLayers(scenes[0]).find((layer) => layer.id === 'v_layer') as MediaLayer;
    const second = sceneLayers(scenes[1]).find((layer) => layer.id === 'v_layer') as MediaLayer;
    expect(first.trimEndSec).toBeCloseTo(4, 3);
    expect(second.trimStartSec).toBeCloseTo(4, 3);
    expect(second.trimEndSec).toBeCloseTo(8, 3);
  });

  it('замедленный клип растягивает тот же кусок записи', () => {
    const scenes = flattenTracks([track('main', [videoClip('a', 0, 6, 0.5)])]);
    const layer = sceneLayers(scenes[0])[0] as MediaLayer;
    expect(scenes[0].durationSec).toBe(6);
    expect(layer.trimEndSec! - layer.trimStartSec!).toBeCloseTo(3, 3);
  });

  it('ролик из ускоренных клипов считает длительность по шкале, а не по файлу', () => {
    const timeline = parseTimeline({
      version: 1,
      aspect: '9:16',
      tracks: [track('main', [videoClip('a', 0, 4, 2), videoClip('b', 4, 4, 0.5)])],
    });
    expect(timelineDurationSec(timeline)).toBeCloseTo(8, 3);
  });
});

describe('clipTransitionSec', () => {
  it('без наложения перехода нет', () => {
    expect(clipTransitionSec(clip('a', 0, 3, { transition: 'dissolve' }), clip('b', 3, 3))).toBe(0);
  });

  it('переход не длиннее половины короткого клипа', () => {
    const a = clip('a', 0, 4, { transition: 'dissolve' });
    const b = clip('b', 1, 1);
    expect(clipTransitionSec(a, b)).toBeCloseTo(0.5, 3);
  });
});

describe('timelineScenes', () => {
  it('читает и прежнюю запись, и дорожки', () => {
    const legacy = parseTimeline({
      aspect: '9:16',
      scenes: [{ id: 's1', source: { kind: 'image', url: 'https://example.ru/1.jpg' }, durationSec: 3 }],
    });
    expect(timelineScenes(legacy)).toHaveLength(1);

    const modern = parseTimeline({
      aspect: '9:16',
      scenes: [],
      tracks: [track('main', [clip('a', 0, 3), clip('b', 3, 3)])],
    });
    expect(timelineScenes(modern).map((scene) => scene.id)).toEqual(['a', 'b']);
  });

  it('пустой ролик не проходит схему', () => {
    expect(() => parseTimeline({ aspect: '9:16', scenes: [] })).toThrow();
  });

  it('битая дорожка отбрасывается и не роняет ролик', () => {
    const timeline = parseTimeline({
      aspect: '9:16',
      scenes: [{ id: 's1', source: { kind: 'image', url: 'https://example.ru/1.jpg' }, durationSec: 3 }],
      tracks: [{ nonsense: true }],
    });
    expect(timelineTracks(timeline)).toHaveLength(0);
    expect(timelineScenes(timeline).map((scene) => scene.id)).toEqual(['s1']);
  });
});

describe('tracksFromScenes', () => {
  it('переводит ролик из сцен в дорожки без потери слоёв', () => {
    const timeline = parseTimeline({
      aspect: '9:16',
      scenes: [
        {
          id: 's1',
          durationSec: 4,
          layers: [
            {
              id: 'l1',
              kind: 'media',
              source: { kind: 'image', url: 'https://example.ru/1.jpg' },
            },
            { id: 'l2', kind: 'text', text: 'С днём рождения' },
          ],
        },
        { id: 's2', durationSec: 3, source: { kind: 'image', url: 'https://example.ru/2.jpg' } },
      ],
    });

    const tracks = tracksFromScenes(timelineScenes(timeline), timelineTimings(timeline));
    expect(tracks).toHaveLength(2);
    expect(tracks[0].clips.map((item) => item.id)).toEqual(['s1', 's2']);
    expect(tracks[0].clips[1].startSec).toBeCloseTo(4, 3);
    expect(tracks[1].clips[0].layer.kind).toBe('text');
    expect(tracks[1].clips[0].startSec).toBeCloseTo(0, 3);
    expect(tracks[1].clips[0].durationSec).toBeCloseTo(4, 3);
  });

  it('обратный перевод даёт ту же длительность', () => {
    const timeline = parseTimeline({
      aspect: '9:16',
      scenes: [
        { id: 's1', durationSec: 4, source: { kind: 'image', url: 'https://example.ru/1.jpg' }, transition: 'dissolve', transitionDurationSec: 1 },
        { id: 's2', durationSec: 3, source: { kind: 'image', url: 'https://example.ru/2.jpg' } },
      ],
    });
    const before = timelineDurationSec(timeline);
    const tracks = tracksFromScenes(timelineScenes(timeline), timelineTimings(timeline));
    const after = parseTimeline({ aspect: '9:16', scenes: [], tracks });
    expect(timelineDurationSec(after)).toBeCloseTo(before, 2);
  });
});

describe('генерация в клип', () => {
  const timeline = parseTimeline({
    aspect: '9:16',
    scenes: [],
    tracks: [track('main', [clip('a', 0, 3), clip('b', 3, 3)])],
  });

  it('метка ставится в клип и ролик остаётся на дорожках', () => {
    const marked = markLayerGeneration(timeline, 'b', 'b_layer', 'proj-1');
    expect(marked.changed).toBe(true);
    expect(marked.timeline.tracks).toBeDefined();
    expect(marked.timeline.scenes).toHaveLength(0);
    const clips = timelineTracks(marked.timeline)[0].clips;
    expect((clips[1].layer as MediaLayer).generationProjectId).toBe('proj-1');
  });

  it('результат встаёт в помеченный клип и снимает метку', () => {
    const marked = markLayerGeneration(timeline, 'b', 'b_layer', 'proj-1').timeline;
    const applied = applyGeneratedSource(marked, 'proj-1', { kind: 'video', url: 'https://example.ru/out.mp4' });
    expect(applied.changed).toBe(true);
    const layer = timelineTracks(applied.timeline)[0].clips[1].layer as MediaLayer;
    expect(layer.source.url).toBe('https://example.ru/out.mp4');
    expect(layer.generationProjectId).toBeUndefined();
  });

  it('чужой проект ничего не меняет', () => {
    const applied = applyGeneratedSource(timeline, 'proj-unknown', { kind: 'image', url: 'https://example.ru/x.jpg' });
    expect(applied.changed).toBe(false);
  });
});

describe('validateTracks', () => {
  it('ловит наложение, съедающее клип целиком', () => {
    const issues = validateTracks([track('main', [clip('a', 0, 4, { transition: 'dissolve' }), clip('b', 1, 4)])]);
    expect(issues.map((issue) => issue.code)).toContain('CLIPS_OVERLAP');
  });

  it('нормальная дорожка проходит без замечаний', () => {
    expect(validateTracks([track('main', [clip('a', 0, 3), clip('b', 3, 3)])])).toEqual([]);
  });
});
