import { runPricesRecompute } from '../prices-recompute';

jest.mock('@allvision/shared', () => {
  const actual = jest.requireActual('../../../shared/src/blocks/pricing');
  return actual;
});

describe('prices recompute CLI', () => {
  function fakePrisma() {
    const services = [
      {
        id: 'service-1',
        slug: 'revive',
        title: 'Revive',
        pipelineConfig: [
          { id: 'step_1', blockSlug: 'image-edit', params: { model: { standard: 'nano-banana', pro: 'nano-banana' }, prompt: 'restore', resolution: '1K' } },
          { id: 'step_2', blockSlug: 'image-to-video', params: { model: { standard: 'kling-std', pro: 'kling-pro' }, duration: 5 } },
        ],
        priceCoinsStandard: 20,
        priceCoinsPro: 30,
        priceTokens: 20,
      },
    ];
    return {
      service: {
        findMany: jest.fn(async () => services),
        update: jest.fn(async () => undefined),
      },
    };
  }

  it('runs dry-run without updating services', async () => {
    const client = fakePrisma();
    const log = jest.fn();
    const result = await runPricesRecompute({
      apply: false,
      margin: 0.8,
      usdToRub: 80,
      log,
      prismaClient: client as never,
    });

    expect(result.changes[0].changed).toBe(true);
    expect(client.service.update).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toContain('[prices:diff] revive');
  });

  it('applies recalculated prices with --apply behavior', async () => {
    const client = fakePrisma();
    await runPricesRecompute({
      apply: true,
      margin: 0.8,
      usdToRub: 80,
      log: jest.fn(),
      prismaClient: client as never,
    });

    expect(client.service.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'service-1' },
      data: expect.objectContaining({
        priceCoinsStandard: expect.any(Number),
        priceCoinsPro: expect.any(Number),
        priceTokens: expect.any(Number),
      }),
    }));
  });
});
