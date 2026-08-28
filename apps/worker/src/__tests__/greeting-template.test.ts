import { parseTimeline, timelineDurationSec } from '@allvision/shared';
import { normaliseTimelineInput } from '../blocks/timeline-render';

/**
 * Шаблон поздравления собирает таймлайн из строки JSON с плейсхолдерами, поэтому проверяем
 * именно ту часть, что превращает результат подстановки в валидный таймлайн.
 */

const TEMPLATE_TIMELINE = JSON.stringify({
  aspect: '9:16',
  scenes: [
    {
      id: 'intro',
      source: { kind: 'color', color: '#0b1020' },
      durationSec: 2.5,
      transition: 'dissolve',
      transitionDurationSec: 0.7,
      overlays: [{ id: 'intro_title', text: '{{user.title}}', subtext: '{{user.subtitle}}', style: 'bold', position: 'center' }],
    },
    { id: 'scene', source: { kind: 'batch' }, transition: 'dissolve', transitionDurationSec: 0.6, muted: true },
  ],
  music: { url: '{{user.music}}', volume: 0.7, fadeInSec: 1.5, fadeOutSec: 2.5, loop: true },
});

function withValues(values: { title?: string; subtitle?: string; music?: string }) {
  return TEMPLATE_TIMELINE
    .replace('{{user.title}}', values.title ?? '')
    .replace('{{user.subtitle}}', values.subtitle ?? '')
    .replace('{{user.music}}', values.music ?? '');
}

const CLIPS = ['https://cdn.test/1.mp4', 'https://cdn.test/2.mp4', 'https://cdn.test/3.mp4'];

describe('greeting template timeline', () => {
  it('expands the batch scene into one scene per generated clip', () => {
    const timeline = parseTimeline(
      normaliseTimelineInput(withValues({ title: 'С юбилеем!', music: 'https://cdn.test/track.mp3' }), { clips: CLIPS }),
    );

    // Титульная карточка плюс по сцене на каждый клип.
    expect(timeline.scenes).toHaveLength(1 + CLIPS.length);
    expect(timeline.scenes.slice(1).map((scene) => scene.source.url)).toEqual(CLIPS);
    // Оформление служебной сцены наследуется всеми развёрнутыми.
    expect(timeline.scenes[1].transition).toBe('dissolve');
    expect(timeline.scenes[1].muted).toBe(true);
    expect(timeline.scenes.map((scene) => scene.id)).toEqual(
      expect.arrayContaining(['intro', 'scene-1', 'scene-2', 'scene-3']),
    );
  });

  it('drops the title card when the user left the heading empty', () => {
    const timeline = parseTimeline(normaliseTimelineInput(withValues({}), { clips: CLIPS }));

    // Заливка без титра — чёрный кадр, его показывать незачем.
    expect(timeline.scenes).toHaveLength(CLIPS.length);
    expect(timeline.scenes.every((scene) => scene.source.kind === 'video')).toBe(true);
  });

  it('keeps the heading but drops an empty subtitle', () => {
    const timeline = parseTimeline(normaliseTimelineInput(withValues({ title: 'С днём рождения' }), { clips: CLIPS }));
    const intro = timeline.scenes[0];
    expect(intro.overlays[0].text).toBe('С днём рождения');
    expect(intro.overlays[0].subtext).toBeUndefined();
  });

  it('renders without music when none was picked', () => {
    const timeline = parseTimeline(normaliseTimelineInput(withValues({ title: 'Привет' }), { clips: CLIPS }));
    expect(timeline.music).toBeUndefined();
  });

  it('takes music and voiceover from separate params', () => {
    const timeline = parseTimeline(
      normaliseTimelineInput(withValues({ title: 'Привет' }), {
        clips: CLIPS,
        music: 'https://cdn.test/track.mp3',
        voiceover: 'https://cdn.test/voice.mp3',
      }),
    );
    expect(timeline.music?.url).toBe('https://cdn.test/track.mp3');
    expect(timeline.voiceover?.url).toBe('https://cdn.test/voice.mp3');
  });

  it('produces a video of a sane length for a ten-photo order', () => {
    const clips = Array.from({ length: 10 }, (_, index) => `https://cdn.test/${index}.mp4`);
    const timeline = parseTimeline(
      normaliseTimelineInput(withValues({ title: 'С юбилеем!' }), { clips }),
    );
    // Клипы по 5 секунд ещё не измерены ffprobe, поэтому здесь важно другое:
    // сцены сложились и ролик не превысил лимит.
    expect(timeline.scenes).toHaveLength(11);
    expect(timelineDurationSec(timeline)).toBeLessThanOrEqual(180);
  });

  it('ignores a batch placeholder that never resolved', () => {
    const timeline = normaliseTimelineInput(withValues({ title: 'Привет' }), { clips: '{{step_1.output.metadata.clips}}' });
    const scenes = (timeline as { scenes: unknown[] }).scenes;
    // Остаётся только титульная карточка — падать из-за нерешённого плейсхолдера нельзя.
    expect(scenes).toHaveLength(1);
  });
});

describe('сцены из редактора', () => {
  it('не выбрасывает сцену, записанную слоями', () => {
    // Сцена редактора не имеет поля source. Пока фильтр смотрел только на него, из
    // ролика уходили все сцены разом и экспорт падал на «нет ни одной сцены».
    const normalised = normaliseTimelineInput({
      aspect: '9:16',
      scenes: [
        {
          id: 'scene_1',
          layers: [{ id: 'layer_a', kind: 'media', source: { kind: 'image', url: '/static/a.jpg' } }],
          durationSec: 4,
        },
      ],
    }) as { scenes: unknown[] };

    expect(normalised.scenes).toHaveLength(1);
  });

  it('всё ещё выбрасывает пустую заливку без титра', () => {
    const normalised = normaliseTimelineInput({
      scenes: [
        { id: 'blank', source: { kind: 'color', color: '#000000' }, overlays: [] },
        { id: 'kept', source: { kind: 'image', url: '/static/a.jpg' } },
      ],
    }) as { scenes: Array<{ id: string }> };

    expect(normalised.scenes.map((scene) => scene.id)).toEqual(['kept']);
  });
});
