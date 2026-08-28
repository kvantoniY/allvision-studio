import {
  TIMELINE_HISTORY_LIMIT,
  createTimelineHistory,
  parseTimeline,
  pushTimelineHistory,
  redoTimeline,
  undoTimeline,
  type Timeline,
} from '../timeline';

function timelineWith(color: string): Timeline {
  return parseTimeline({
    scenes: [{ id: 'scene_1', source: { kind: 'color', color }, durationSec: 4 }],
  });
}

const A = timelineWith('#000000');
const B = timelineWith('#111111');
const C = timelineWith('#222222');

describe('timeline history', () => {
  it('returns the state before the change', () => {
    const history = pushTimelineHistory(createTimelineHistory(), A, 1000);
    const undone = undoTimeline(history, B);

    expect(undone?.timeline).toBe(A);
    expect(undone?.history.past).toHaveLength(0);
    // Текущее состояние ушло в ветку повтора — вернуться к нему можно.
    expect(redoTimeline(undone!.history, A)?.timeline).toBe(B);
  });

  it('has nothing to undo on a fresh editor', () => {
    expect(undoTimeline(createTimelineHistory(), A)).toBeNull();
    expect(redoTimeline(createTimelineHistory(), A)).toBeNull();
  });

  it('glues rapid changes into one step', () => {
    // Набор текста даёт правку на символ: без склейки отмена стирала бы по букве.
    let history = pushTimelineHistory(createTimelineHistory(), A, 1000);
    history = pushTimelineHistory(history, B, 1100);
    history = pushTimelineHistory(history, C, 1200);

    expect(history.past).toHaveLength(1);
    expect(undoTimeline(history, C)?.timeline).toBe(A);
  });

  it('keeps a pause between edits as a separate step', () => {
    let history = pushTimelineHistory(createTimelineHistory(), A, 1000);
    history = pushTimelineHistory(history, B, 5000);

    expect(history.past).toEqual([A, B]);
  });

  it('drops the redo branch as soon as the user edits again', () => {
    const history = pushTimelineHistory(createTimelineHistory(), A, 1000);
    const undone = undoTimeline(history, B)!;
    const edited = pushTimelineHistory(undone.history, A, 9000);

    expect(edited.future).toHaveLength(0);
    expect(redoTimeline(edited, C)).toBeNull();
  });

  it('forgets the oldest steps instead of growing without bound', () => {
    let history = createTimelineHistory();
    for (let i = 0; i < TIMELINE_HISTORY_LIMIT + 10; i += 1) {
      history = pushTimelineHistory(history, timelineWith('#000000'), i * 1000);
    }
    expect(history.past).toHaveLength(TIMELINE_HISTORY_LIMIT);
  });
});
