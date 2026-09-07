import { resolveBlockProvider } from '../blocks/provider-routing';

describe('resolveBlockProvider', () => {
  it('в режиме fal отправляет на fal блок, которого нет в FAL_BLOCKS', () => {
    // Ровно тот случай, ради которого правило перевёрнуто: прод-env отстал от каталога.
    expect(resolveBlockProvider('scene-batch', { mode: 'fal', falBlocks: ['image-edit'] })).toBe('fal');
    expect(resolveBlockProvider('product-card', { mode: 'fal', falBlocks: [] })).toBe('fal');
  });

  it('на PiAPI остаются только блоки, не реализованные на fal', () => {
    expect(resolveBlockProvider('video-effect', { mode: 'fal', falBlocks: [] })).toBe('piapi');
    expect(resolveBlockProvider('video-upscale', { mode: 'fal', falBlocks: [] })).toBe('piapi');
    expect(resolveBlockProvider('video-watermark-remove', { mode: 'fal', falBlocks: [] })).toBe('piapi');
  });

  it('список из env может добавить блок на fal, но не увести с него', () => {
    expect(resolveBlockProvider('video-effect', { mode: 'fal', falBlocks: ['video-effect'] })).toBe('fal');
  });

  it('блоки без внешнего провайдера остаются на заглушке в любом режиме', () => {
    expect(resolveBlockProvider('timeline-render', { mode: 'fal', falBlocks: [] })).toBe('mock');
    expect(resolveBlockProvider('image-upscale', { mode: 'piapi', falBlocks: [] })).toBe('mock');
  });

  it('режим piapi отправляет обычные блоки на PiAPI', () => {
    expect(resolveBlockProvider('image-edit', { mode: 'piapi', falBlocks: [] })).toBe('piapi');
  });

  it('mock-режим и отсутствие блока дают заглушку', () => {
    expect(resolveBlockProvider('image-edit', { mode: 'mock' })).toBe('mock');
    expect(resolveBlockProvider(undefined, { mode: 'fal' })).toBe('mock');
  });
});
