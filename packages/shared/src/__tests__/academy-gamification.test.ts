import {
  levelFromXp,
  levelProgressFromXp,
  updateLessonStreak,
  xpForLevel,
} from '../academy/gamification';

describe('academy gamification levels', () => {
  it('uses quadratic cumulative thresholds', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(400);
    expect(xpForLevel(4)).toBe(900);
  });

  it('maps total XP to a level and progress', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(399)).toBe(2);
    expect(levelFromXp(400)).toBe(3);
    expect(levelProgressFromXp(250)).toEqual({
      level: 2,
      levelStartXp: 100,
      nextLevelXp: 400,
      xpIntoLevel: 150,
      xpNeeded: 150,
      percent: 50,
    });
  });
});

describe('academy lesson streak', () => {
  it('starts at one and keeps the initial freeze', () => {
    expect(updateLessonStreak({
      previousActivityAt: null,
      currentActivityAt: '2026-07-20T12:00:00Z',
      streakCount: 0,
      streakFreezes: 1,
    })).toEqual({ streakCount: 1, streakFreezes: 1, usedFreeze: false, changed: true });
  });

  it('counts days in Moscow and does not double-count the same day', () => {
    expect(updateLessonStreak({
      previousActivityAt: '2026-07-20T20:30:00Z', // 23:30 Moscow
      currentActivityAt: '2026-07-20T21:30:00Z', // 00:30 next Moscow day
      streakCount: 2,
      streakFreezes: 1,
    }).streakCount).toBe(3);
    expect(updateLessonStreak({
      previousActivityAt: '2026-07-20T08:00:00Z',
      currentActivityAt: '2026-07-20T18:00:00Z',
      streakCount: 3,
      streakFreezes: 1,
    })).toEqual({ streakCount: 3, streakFreezes: 1, usedFreeze: false, changed: false });
  });

  it('spends one freeze for exactly one missed day', () => {
    expect(updateLessonStreak({
      previousActivityAt: '2026-07-20T10:00:00Z',
      currentActivityAt: '2026-07-22T10:00:00Z',
      streakCount: 4,
      streakFreezes: 1,
    })).toEqual({ streakCount: 5, streakFreezes: 0, usedFreeze: true, changed: true });
  });

  it('resets after a longer gap or when the freeze is gone', () => {
    expect(updateLessonStreak({
      previousActivityAt: '2026-07-20T10:00:00Z',
      currentActivityAt: '2026-07-22T10:00:00Z',
      streakCount: 4,
      streakFreezes: 0,
    }).streakCount).toBe(1);
    expect(updateLessonStreak({
      previousActivityAt: '2026-07-20T10:00:00Z',
      currentActivityAt: '2026-07-24T10:00:00Z',
      streakCount: 8,
      streakFreezes: 1,
    }).streakCount).toBe(1);
  });
});
