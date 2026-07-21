import {
  buildLessonPackages,
  lessonPackagePriceRub,
  resolveCancellation,
  teacherEarningRub,
} from '../academy/booking';

describe('lesson package pricing', () => {
  it('matches the published price grid', () => {
    // 25 минут
    expect(lessonPackagePriceRub(25, 1)).toBe(1000);
    expect(lessonPackagePriceRub(25, 4)).toBe(3880);
    expect(lessonPackagePriceRub(25, 8)).toBe(7440);
    expect(lessonPackagePriceRub(25, 16)).toBe(14080);
    // 45 минут
    expect(lessonPackagePriceRub(45, 1)).toBe(1500);
    expect(lessonPackagePriceRub(45, 4)).toBe(5820);
    expect(lessonPackagePriceRub(45, 8)).toBe(11160);
    expect(lessonPackagePriceRub(45, 16)).toBe(21120);
  });

  it('builds a catalog for both durations × all sizes', () => {
    const packages = buildLessonPackages();
    expect(packages).toHaveLength(8);
    expect(packages.every((p) => p.pricePerLessonRub > 0)).toBe(true);
  });
});

describe('teacher earning', () => {
  it('is 30% of the lesson price', () => {
    expect(teacherEarningRub(1000)).toBe(300);
    expect(teacherEarningRub(1500)).toBe(450);
  });
});

describe('cancellation rules', () => {
  const now = new Date('2026-07-21T10:00:00Z');

  it('refunds a parent cancellation made 8+ hours before', () => {
    const out = resolveCancellation({ by: 'parent', status: 'BOOKED', startsAt: '2026-07-21T20:00:00Z', now });
    expect(out).toEqual({ allowed: true, refundCredit: true });
  });

  it('forfeits a parent cancellation made too late', () => {
    const out = resolveCancellation({ by: 'parent', status: 'BOOKED', startsAt: '2026-07-21T15:00:00Z', now });
    expect(out.allowed).toBe(true);
    expect(out.refundCredit).toBe(false);
  });

  it('always refunds a teacher cancellation', () => {
    const out = resolveCancellation({ by: 'teacher', status: 'BOOKED', startsAt: '2026-07-21T10:30:00Z', now });
    expect(out.refundCredit).toBe(true);
  });

  it('rejects cancelling a lesson that already ran', () => {
    const out = resolveCancellation({ by: 'parent', status: 'COMPLETED', startsAt: '2026-07-20T10:00:00Z', now });
    expect(out.allowed).toBe(false);
  });
});
