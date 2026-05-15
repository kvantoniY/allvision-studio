import { formatMoney, formatRub, usdToRub } from '../utils';

describe('formatMoney', () => {
  it('formats USD with RUB secondary', () => {
    expect(formatMoney({ usd: 2.33 }, { primary: 'usd', showAll: true, usdToRub: 80 })).toBe('$2.33 · ~186 ₽');
  });

  it('formats coins with RUB secondary', () => {
    expect(formatMoney({ coins: 40 }, { primary: 'coins', showAll: true })).toBe('40 токенов · ~40 ₽');
  });

  it('handles singular coin forms and missing amounts', () => {
    expect(formatMoney({ coins: 1 }, { primary: 'coins', showAll: false })).toBe('1 токен');
    expect(formatMoney({}, { primary: 'usd', showAll: true })).toBe('—');
  });

  it('formats explicit rub and conversion helpers', () => {
    expect(usdToRub(25.64, 80)).toBe(2051);
    expect(formatRub(2051)).toBe('2 051 ₽');
    expect(formatMoney({ rub: 1234 }, { primary: 'rub' })).toBe('~1 234 ₽');
  });
});
