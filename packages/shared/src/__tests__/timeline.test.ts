import {
  TIMELINE_LIMITS,
  applyGeneratedSource,
  markLayerGeneration,
  parseTimeline,
  primaryMediaLayer,
  renderOverlaySvg,
  sceneAtTime,
  sceneLayers,
  sourceTimeAt,
  sceneDurationSec,
  timelineDurationSec,
  timelineOverlayTimings,
  timelineResolution,
  timelineTimings,
  transitionDurationSec,
  validateTimeline,
  voiceoverPriceCoins,
  wrapText,
} from '../timeline';
import { pipelineStepSchema } from '../schemas/admin-services';

function scene(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scene_1',
    source: { kind: 'video', url: 'https://cdn.test/clip.mp4' },
    durationSec: 5,
    ...overrides,
  };
}

describe('timeline layout', () => {
  it('keeps vertical video as the default frame', () => {
    expect(timelineResolution('9:16')).toEqual({ width: 1080, height: 1920 });
    expect(timelineResolution('16:9')).toEqual({ width: 1920, height: 1080 });
  });

  it('derives scene duration from trim when it is set', () => {
    const parsed = parseTimeline({
      scenes: [scene({ trimStartSec: 2, trimEndSec: 6, durationSec: 30 })],
    });
    // Обрезка важнее явной длительности: пользователь двигал ручки именно здесь.
    expect(sceneDurationSec(parsed.scenes[0])).toBe(4);
  });

  it('overlaps scenes by the transition so the total is shorter than the sum', () => {
    const parsed = parseTimeline({
      scenes: [
        scene({ id: 'a', transition: 'dissolve', transitionDurationSec: 1 }),
        scene({ id: 'b' }),
      ],
    });
    const timings = timelineTimings(parsed);
    expect(timings[0].startSec).toBe(0);
    expect(timings[1].startSec).toBe(4);
    expect(timelineDurationSec(parsed)).toBe(9);
  });

  it('does not overlap on a cut', () => {
    const parsed = parseTimeline({ scenes: [scene({ id: 'a' }), scene({ id: 'b' })] });
    expect(timelineTimings(parsed)[1].startSec).toBe(5);
    expect(timelineDurationSec(parsed)).toBe(10);
  });

  it('clamps a transition longer than half of the shortest neighbour', () => {
    const parsed = parseTimeline({
      scenes: [
        scene({ id: 'a', durationSec: 1, transition: 'dissolve', transitionDurationSec: 2 }),
        scene({ id: 'b', durationSec: 5 }),
      ],
    });
    // Иначе короткая сцена исчезла бы в переходе целиком.
    expect(transitionDurationSec(parsed.scenes[0], parsed.scenes[1])).toBe(0.5);
  });

  it('converts overlay timing to absolute seconds of the finished video', () => {
    const parsed = parseTimeline({
      scenes: [
        scene({ id: 'a' }),
        scene({
          id: 'b',
          overlays: [{ id: 'o1', text: 'С юбилеем!', startSec: 1, endSec: 3 }],
        }),
      ],
    });
    const timings = timelineOverlayTimings(parsed);
    expect(timings).toHaveLength(1);
    expect(timings[0].startSec).toBe(6);
    expect(timings[0].endSec).toBe(8);
  });

  it('reports problems that the schema alone cannot catch', () => {
    const parsed = parseTimeline({
      scenes: [
        scene({ id: 'dup' }),
        scene({ id: 'dup', source: { kind: 'image' } }),
        scene({ id: 'trim', trimStartSec: 5, trimEndSec: 2 }),
      ],
    });
    const codes = validateTimeline(parsed).map((issue) => issue.code);
    expect(codes).toContain('DUPLICATE_SCENE_ID');
    expect(codes).toContain('SOURCE_REQUIRED');
    expect(codes).toContain('INVALID_TRIM');
  });

  it('flags a video longer than the allowed limit', () => {
    const parsed = parseTimeline({
      scenes: Array.from({ length: 5 }, (_, index) => scene({ id: `s${index}`, durationSec: 60 })),
    });
    expect(timelineDurationSec(parsed)).toBeGreaterThan(TIMELINE_LIMITS.maxTotalDurationSec);
    expect(validateTimeline(parsed).map((issue) => issue.code)).toContain('TOO_LONG');
  });
});

describe('timeline titles', () => {
  it('wraps text the same way for any renderer', () => {
    const lines = wrapText('С днём рождения, дорогая бабушка Мария Ивановна', 64, 600);
    expect(lines.length).toBeGreaterThan(1);
    // Слова не рвутся, пока помещаются целиком.
    expect(lines.join(' ')).toBe('С днём рождения, дорогая бабушка Мария Ивановна');
  });

  it('breaks a single overlong word instead of running off the frame', () => {
    const lines = wrapText('Пооооооздравляяяяяем', 80, 200);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('escapes markup so text cannot break the svg', () => {
    const svg = renderOverlaySvg(
      { text: 'Маша & <Петя>', style: 'clean', position: 'bottom' },
      { width: 1080, height: 1920 },
    );
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&lt;');
    expect(svg).not.toContain('<Петя>');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('draws a plate for styles that need contrast', () => {
    const card = renderOverlaySvg(
      { text: 'С юбилеем', style: 'card', position: 'bottom' },
      { width: 1080, height: 1920 },
    );
    const clean = renderOverlaySvg(
      { text: 'С юбилеем', style: 'clean', position: 'bottom' },
      { width: 1080, height: 1920 },
    );
    expect(card).toContain('<rect');
    expect(clean).not.toContain('<rect');
  });
});

describe('playhead', () => {
  const timeline = parseTimeline({
    scenes: [
      { id: 'a', source: { kind: 'video', url: 'https://cdn.test/a.mp4' }, durationSec: 5, trimStartSec: 2, trimEndSec: 7, transition: 'dissolve', transitionDurationSec: 1 },
      { id: 'b', source: { kind: 'video', url: 'https://cdn.test/b.mp4' }, durationSec: 5 },
    ],
  });

  it('shows only the active scene outside a transition', () => {
    const frame = sceneAtTime(timeline, 1);
    expect(frame).toEqual({ activeIndex: 0, incomingIndex: null, mix: 0 });
  });

  it('blends both scenes inside the transition window', () => {
    // Переход начинается на 4-й секунде и длится одну.
    expect(sceneAtTime(timeline, 4)).toEqual({ activeIndex: 0, incomingIndex: 1, mix: 0 });
    expect(sceneAtTime(timeline, 4.5)).toEqual({ activeIndex: 0, incomingIndex: 1, mix: 0.5 });
    expect(sceneAtTime(timeline, 5)?.activeIndex).toBe(1);
  });

  it('maps timeline seconds back to a position inside the source file', () => {
    // Сцена обрезана с 2-й секунды исходника, поэтому её начало — это 2 секунды файла.
    expect(sourceTimeAt(timeline, 0, 0)).toBe(2);
    expect(sourceTimeAt(timeline, 0, 3)).toBe(5);
    // Вторая сцена начинается на 4-й секунде ролика и не обрезана.
    expect(sourceTimeAt(timeline, 1, 6)).toBe(2);
  });
});

describe('generation into a scene', () => {
  function withGeneration(projectId: string) {
    return parseTimeline({
      scenes: [
        { id: 'a', source: { kind: 'color', color: '#000000' }, durationSec: 3 },
        {
          id: 'b',
          source: { kind: 'image', url: 'https://cdn.test/old.jpg' },
          durationSec: 4,
          trimStartSec: 1,
          trimEndSec: 3,
          generationProjectId: projectId,
        },
      ],
    });
  }

  it('puts the result into the scene that was waiting for it', () => {
    const result = applyGeneratedSource(withGeneration('p1'), 'p1', {
      kind: 'video',
      url: 'https://cdn.test/new.mp4',
    });

    expect(result.changed).toBe(true);
    const target = primaryMediaLayer(result.timeline.scenes[1]);
    expect(target?.source).toEqual({ kind: 'video', url: 'https://cdn.test/new.mp4' });
    // Обрезка относилась к прежнему файлу и должна уйти вместе с ним.
    expect(target?.trimStartSec).toBeUndefined();
    expect(target?.trimEndSec).toBeUndefined();
    // Соседние сцены не трогаем.
    expect(primaryMediaLayer(result.timeline.scenes[0])?.source).toEqual({ kind: 'color', color: '#000000' });
  });

  it('finds the scene by its generation mark even after the user reordered scenes', () => {
    const timeline = withGeneration('p1');
    const reordered = { ...timeline, scenes: [timeline.scenes[1], timeline.scenes[0]] };
    const result = applyGeneratedSource(reordered, 'p1', { kind: 'image', url: 'https://cdn.test/new.jpg' });

    expect(result.changed).toBe(true);
    expect(primaryMediaLayer(result.timeline.scenes[0])?.source.url).toBe('https://cdn.test/new.jpg');
  });

  it('keeps the timeline untouched when nothing is waiting for that generation', () => {
    const timeline = withGeneration('p1');
    const result = applyGeneratedSource(timeline, 'other', { kind: 'video', url: 'https://cdn.test/new.mp4' });

    expect(result.changed).toBe(false);
    expect(result.timeline).toBe(timeline);
  });
});

describe('conditional pipeline steps', () => {
  it('accepts both an equality condition and a filled check', () => {
    const equality = pipelineStepSchema.parse({
      id: 'step_1',
      blockSlug: 'image-edit',
      when: { field: 'animate', value: 'true' },
    });
    expect(equality.when).toEqual({ field: 'animate', value: 'true' });

    const filled = pipelineStepSchema.parse({
      id: 'step_2',
      blockSlug: 'text-to-speech',
      when: { field: 'speech', filled: true },
    });
    expect(filled.when).toEqual({ field: 'speech', filled: true });
  });

  it('rejects a condition that says nothing', () => {
    // Пустое условие молча выключило бы шаг — лучше упасть на валидации.
    expect(() =>
      pipelineStepSchema.parse({ id: 'step_1', blockSlug: 'image-edit', when: { field: 'speech' } }),
    ).toThrow();
  });
});

describe('generation mark on a layer', () => {
  const layered = () =>
    parseTimeline({
      scenes: [
        {
          id: 'scene_1',
          layers: [
            { id: 'layer_a', kind: 'media', source: { kind: 'image', url: 'https://cdn.test/a.jpg' } },
            { id: 'layer_b', kind: 'media', source: { kind: 'color', color: '#0b1020' } },
          ],
          durationSec: 4,
        },
      ],
    });

  it('marks exactly the layer that is waiting, leaving the collage alone', () => {
    const result = markLayerGeneration(layered(), 'scene_1', 'layer_b', 'p1');

    expect(result.changed).toBe(true);
    const layers = sceneLayers(result.timeline.scenes[0]);
    expect(layers.find((layer) => layer.id === 'layer_b')).toMatchObject({
      generationProjectId: 'p1',
      origin: 'generated',
    });
    expect(layers.find((layer) => layer.id === 'layer_a')).not.toHaveProperty('generationProjectId');
  });

  it('lets the worker put the result into that same layer', () => {
    const marked = markLayerGeneration(layered(), 'scene_1', 'layer_b', 'p1');
    const applied = applyGeneratedSource(marked.timeline, 'p1', { kind: 'video', url: 'https://cdn.test/new.mp4' });

    expect(applied.changed).toBe(true);
    const layers = sceneLayers(applied.timeline.scenes[0]);
    expect(layers.find((layer) => layer.id === 'layer_b')).toMatchObject({
      source: { kind: 'video', url: 'https://cdn.test/new.mp4' },
    });
    // Соседний кадр коллажа остался прежним.
    expect(layers.find((layer) => layer.id === 'layer_a')).toMatchObject({
      source: { kind: 'image', url: 'https://cdn.test/a.jpg' },
    });
  });

  it('marks the derived layer of an old one-source scene', () => {
    const timeline = parseTimeline({ scenes: [scene()] });
    const derivedId = sceneLayers(timeline.scenes[0])[0].id;
    const result = markLayerGeneration(timeline, 'scene_1', derivedId, 'p1');

    expect(result.changed).toBe(true);
    // Прежняя запись переезжает на слои: два источника правды об одном кадре недопустимы.
    expect(result.timeline.scenes[0].source).toBeUndefined();
    expect(sceneLayers(result.timeline.scenes[0])[0]).toMatchObject({ generationProjectId: 'p1' });
  });

  it('changes nothing when the named layer is gone', () => {
    const result = markLayerGeneration(layered(), 'scene_1', 'layer_missing', 'p1');
    expect(result.changed).toBe(false);
  });
});

describe('voiceover pricing', () => {
  it('never charges less than the floor', () => {
    // Себестоимость синтеза копеечная, и без пола цена скатывалась бы к одному коину.
    expect(voiceoverPriceCoins('minimax-speech')).toBeGreaterThanOrEqual(5);
    // Неизвестная модель тарифицируется по ориентиру дешёвой, а не бесплатно.
    expect(voiceoverPriceCoins('unknown-model')).toBeGreaterThanOrEqual(5);
  });

  it('charges the pricier voice more', () => {
    expect(voiceoverPriceCoins('elevenlabs-tts')).toBeGreaterThan(voiceoverPriceCoins('minimax-speech'));
  });
});
