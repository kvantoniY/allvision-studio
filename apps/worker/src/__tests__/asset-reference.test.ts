import { replaceAssetReferences } from '../pipeline-runner';

describe('asset reference resolution', () => {
  it('replaces asset:id values recursively with public URLs', () => {
    const resolved = replaceAssetReferences(
      [
        {
          id: 'step_1',
          input: 'asset:image-1',
          params: {
            video_url: 'asset:video-1',
            nested: ['asset:image-1', '{{user.photo}}'],
          },
        },
      ],
      new Map([
        ['image-1', 'https://cdn.test/image.jpg'],
        ['video-1', 'https://cdn.test/video.mp4'],
      ]),
    );

    expect(resolved).toEqual([
      {
        id: 'step_1',
        input: 'https://cdn.test/image.jpg',
        params: {
          video_url: 'https://cdn.test/video.mp4',
          nested: ['https://cdn.test/image.jpg', '{{user.photo}}'],
        },
      },
    ]);
  });

  it('keeps unknown asset refs unchanged for worker fallback compatibility', () => {
    expect(replaceAssetReferences('asset:missing', new Map())).toBe('asset:missing');
  });
});
