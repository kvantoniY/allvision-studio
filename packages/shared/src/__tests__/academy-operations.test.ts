import {
  lessonReportSchema,
  payoutPeriodSchema,
  payoutRejectSchema,
  threadMessageSchema,
} from '../academy';

describe('academy A10 operation contracts', () => {
  it('normalizes a lesson report and defaults its result assets', () => {
    expect(lessonReportSchema.parse({
      summary: '  Прошли тему занятия.  ',
      successes: 'Ученик справился самостоятельно.',
      recommendation: 'Повторить материал дома.',
    })).toEqual({
      summary: 'Прошли тему занятия.',
      successes: 'Ученик справился самостоятельно.',
      recommendation: 'Повторить материал дома.',
      resultAssetIds: [],
    });
  });

  it('accepts an attachment-only message but rejects oversized text', () => {
    expect(threadMessageSchema.parse({})).toEqual({});
    expect(threadMessageSchema.safeParse({ body: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('requires a chronological payout period', () => {
    expect(payoutPeriodSchema.safeParse({ periodStart: '2026-07-01', periodEnd: '2026-07-31' }).success).toBe(true);
    expect(payoutPeriodSchema.safeParse({ periodStart: '2026-08-01', periodEnd: '2026-07-31' }).success).toBe(false);
  });

  it('requires a meaningful payout correction reason', () => {
    expect(payoutRejectSchema.safeParse({ reason: 'Нет' }).success).toBe(true);
    expect(payoutRejectSchema.safeParse({ reason: 'x' }).success).toBe(false);
  });
});
