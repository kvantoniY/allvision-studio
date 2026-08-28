import {
  ACTIVE_ORDER_STATUSES,
  CUSTOM_ORDER_STATUSES,
  canTransitionOrder,
  nextOrderStatuses,
  renderOrderEmail,
  validateBriefValues,
  type BriefField,
} from '../orders';

const FIELDS: BriefField[] = [
  { id: 'occasion', type: 'text', label: 'Повод', required: true },
  { id: 'details', type: 'textarea', label: 'Детали', required: false, maxLength: 20 },
  { id: 'style', type: 'select', label: 'Стиль', required: false, options: [{ value: 'warm', label: 'Тёплый' }] },
  { id: 'guests', type: 'number', label: 'Гостей', required: false },
];

describe('order status flow', () => {
  it('walks the happy path one step at a time', () => {
    expect(canTransitionOrder('NEW', 'QUOTED')).toBe(true);
    expect(canTransitionOrder('QUOTED', 'PAID')).toBe(true);
    expect(canTransitionOrder('PAID', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionOrder('IN_PROGRESS', 'DELIVERED')).toBe(true);
  });

  it('refuses to deliver an order that was never paid', () => {
    // Главное, ради чего переходы описаны явно: случайный клик не должен закрывать
    // заказ, за который не заплатили.
    expect(canTransitionOrder('NEW', 'DELIVERED')).toBe(false);
    // Взять в работу сразу после названной цены МОЖНО: с заказными работами платят и
    // мимо сайта. Запрет остаётся там, где он важен, — на выдаче результата.
    expect(canTransitionOrder('QUOTED', 'DELIVERED')).toBe(false);
    expect(canTransitionOrder('NEW', 'PAID')).toBe(false);
  });

  it('lets a quote be reworked but not a finished order', () => {
    expect(canTransitionOrder('QUOTED', 'NEW')).toBe(true);
    expect(nextOrderStatuses('DELIVERED')).toEqual([]);
    expect(nextOrderStatuses('CANCELLED')).toEqual([]);
  });

  it('allows cancelling from every working state', () => {
    for (const status of ACTIVE_ORDER_STATUSES) {
      expect(canTransitionOrder(status, 'CANCELLED')).toBe(true);
    }
  });

  it('keeps every status reachable from somewhere', () => {
    const reachable = new Set(CUSTOM_ORDER_STATUSES.flatMap((status) => nextOrderStatuses(status)));
    for (const status of CUSTOM_ORDER_STATUSES) {
      if (status === 'NEW') continue; // стартовое состояние
      expect(reachable.has(status)).toBe(true);
    }
  });
});

describe('brief validation', () => {
  it('reports every problem at once, not one per submit', () => {
    const issues = validateBriefValues(FIELDS, { details: 'x'.repeat(50), style: 'unknown' });
    expect(issues.map((issue) => issue.fieldId).sort()).toEqual(['details', 'occasion', 'style']);
  });

  it('accepts a filled brief', () => {
    expect(validateBriefValues(FIELDS, { occasion: 'Юбилей', style: 'warm', guests: '12' })).toEqual([]);
  });

  it('ignores empty optional fields', () => {
    expect(validateBriefValues(FIELDS, { occasion: 'Свадьба', details: '', style: '' })).toEqual([]);
  });

  it('catches a non-number in a number field', () => {
    const issues = validateBriefValues(FIELDS, { occasion: 'Юбилей', guests: 'много' });
    expect(issues).toHaveLength(1);
    expect(issues[0].fieldId).toBe('guests');
  });
});

describe('order emails', () => {
  const vars = {
    name: 'Ирина',
    orderTitle: 'Свадебный ролик',
    price: '4000 коинов',
    link: 'https://allvision-pulse.ru/orders/1',
    note: 'Уточните дату',
  };

  it('substitutes the values an admin can rely on', () => {
    const text = renderOrderEmail('Здравствуйте, {{name}}! По заказу «{{ orderTitle }}» цена {{price}}.', vars);
    expect(text).toBe('Здравствуйте, Ирина! По заказу «Свадебный ролик» цена 4000 коинов.');
  });

  it('leaves unknown placeholders alone instead of blanking them', () => {
    // Опечатка админа не должна превращаться в пустое место посреди письма.
    expect(renderOrderEmail('Привет, {{nmae}}', vars)).toBe('Привет, {{nmae}}');
  });
});

describe('заказ можно взять в работу сразу после названной цены', () => {
  it('разрешает QUOTED → IN_PROGRESS', () => {
    // С заказными работами часто договариваются с менеджером и платят мимо сайта:
    // требовать статус «оплачено» ради начала работы значило бы выдумывать процесс.
    expect(canTransitionOrder('QUOTED', 'IN_PROGRESS')).toBe(true);
    expect(nextOrderStatuses('QUOTED')).toContain('IN_PROGRESS');
  });

  it('но доставить неоплаченное мимо работы по-прежнему нельзя', () => {
    expect(canTransitionOrder('QUOTED', 'DELIVERED')).toBe(false);
    expect(canTransitionOrder('NEW', 'DELIVERED')).toBe(false);
  });
});
