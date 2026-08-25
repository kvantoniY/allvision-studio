import {
  TIMELINE_LIMITS,
  parseTimeline,
  renderOverlaySvg,
  sceneDurationSec,
  timelineDurationSec,
  timelineOverlayTimings,
  timelineResolution,
  timelineTimings,
  transitionDurationSec,
  validateTimeline,
  wrapText,
} from '../timeline';

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
      { id: 'o', text: 'Маша & <Петя>', style: 'clean', position: 'bottom' },
      { width: 1080, height: 1920 },
    );
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&lt;');
    expect(svg).not.toContain('<Петя>');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('draws a plate for styles that need contrast', () => {
    const card = renderOverlaySvg(
      { id: 'o', text: 'С юбилеем', style: 'card', position: 'bottom' },
      { width: 1080, height: 1920 },
    );
    const clean = renderOverlaySvg(
      { id: 'o', text: 'С юбилеем', style: 'clean', position: 'bottom' },
      { width: 1080, height: 1920 },
    );
    expect(card).toContain('<rect');
    expect(clean).not.toContain('<rect');
  });
});
