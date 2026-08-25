import { parseTimeline, timelineResolution } from '@allvision/shared';
import { planFinal, planScene, timelineRenderShape } from '../blocks/timeline-plan';

const { width, height } = timelineResolution('9:16');

function videoScene(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scene_1',
    source: { kind: 'video', url: 'https://cdn.test/clip.mp4' },
    durationSec: 5,
    ...overrides,
  };
}

/** Значение аргумента, идущего сразу за флагом. */
function argAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function filterGraph(args: string[]): string {
  return argAfter(args, '-filter_complex') ?? '';
}

describe('planScene', () => {
  it('trims video with -ss before the input so the seek stays fast', () => {
    const timeline = parseTimeline({ scenes: [videoScene({ trimStartSec: 3, trimEndSec: 7 })] });
    const plan = planScene({
      scene: timeline.scenes[0],
      source: { kind: 'video', path: '/tmp/clip.mp4', trimStartSec: 3, hasAudio: true },
      overlays: [],
      width,
      height,
      index: 0,
      outputName: '/tmp/scene-0.mp4',
      photoMotion: true,
      quality: 'balanced',
    });

    expect(plan.durationSec).toBe(4);
    expect(plan.args.indexOf('-ss')).toBeLessThan(plan.args.indexOf('-i'));
    expect(argAfter(plan.args, '-ss')).toBe('3.000');
    expect(argAfter(plan.args, '-t')).toBe('4.000');
  });

  it('adds silence when the clip has no audio so every scene has a track to mix', () => {
    const timeline = parseTimeline({ scenes: [videoScene()] });
    const plan = planScene({
      scene: timeline.scenes[0],
      source: { kind: 'video', path: '/tmp/clip.mp4', trimStartSec: 0, hasAudio: false },
      overlays: [],
      width,
      height,
      index: 0,
      outputName: '/tmp/scene-0.mp4',
      photoMotion: true,
      quality: 'balanced',
    });
    expect(plan.args.join(' ')).toContain('anullsrc');
  });

  it('mutes the source instead of dropping the track when the scene is muted', () => {
    const timeline = parseTimeline({ scenes: [videoScene({ muted: true })] });
    const plan = planScene({
      scene: timeline.scenes[0],
      source: { kind: 'video', path: '/tmp/clip.mp4', trimStartSec: 0, hasAudio: true },
      overlays: [],
      width,
      height,
      index: 0,
      outputName: '/tmp/scene-0.mp4',
      photoMotion: true,
      quality: 'balanced',
    });
    expect(plan.args.join(' ')).toContain('anullsrc');
  });

  it('gives photos a slow zoom, and leaves video alone', () => {
    const photo = parseTimeline({
      scenes: [{ id: 'p', source: { kind: 'image', url: 'https://cdn.test/a.jpg' }, durationSec: 4 }],
    });
    const photoPlan = planScene({
      scene: photo.scenes[0],
      source: { kind: 'image', path: '/tmp/a.jpg' },
      overlays: [],
      width,
      height,
      index: 0,
      outputName: '/tmp/scene-0.mp4',
      photoMotion: true,
      quality: 'balanced',
    });
    expect(filterGraph(photoPlan.args)).toContain('zoompan');

    const stillPlan = planScene({
      scene: photo.scenes[0],
      source: { kind: 'image', path: '/tmp/a.jpg' },
      overlays: [],
      width,
      height,
      index: 0,
      outputName: '/tmp/scene-0.mp4',
      photoMotion: false,
      quality: 'balanced',
    });
    expect(filterGraph(stillPlan.args)).not.toContain('zoompan');
  });

  it('burns titles with their scene-relative timing', () => {
    const timeline = parseTimeline({
      scenes: [videoScene({ overlays: [{ id: 'o1', text: 'С юбилеем' }] })],
    });
    const plan = planScene({
      scene: timeline.scenes[0],
      source: { kind: 'video', path: '/tmp/clip.mp4', trimStartSec: 0, hasAudio: true },
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
      musicPath: '/tmp/track.mp3',
      outputPath: '/tmp/out.mp4',
      quality: 'balanced',
    });

    expect(final.args).toContain('-stream_loop');
    const graph = filterGraph(final.args);
    expect(graph).toContain('volume=0.600');
    expect(graph).toContain('afade=t=out:st=3.000:d=2.000');
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
      musicPath: '/tmp/track.mp3',
      voiceoverPath: '/tmp/voice.mp3',
      outputPath: '/tmp/out.mp4',
      quality: 'balanced',
    }).args);

    // 0.8 * 0.35 — голос должен быть слышен на телефонном динамике.
    expect(graph).toContain('volume=0.280');
    expect(graph).toContain('[avoice]');
    expect(graph).toContain('amix=inputs=3:normalize=0');
  });
});

describe('timelineRenderShape', () => {
  it('reports the target frame and total duration before ffmpeg runs', () => {
    const timeline = parseTimeline({ aspect: '1:1', scenes: [videoScene(), videoScene({ id: 'b' })] });
    expect(timelineRenderShape(timeline)).toEqual({ width: 1080, height: 1080, totalDurationSec: 10 });
  });
});
