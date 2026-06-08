import {
  collectProjectStorageKeys,
  storageKeyFromTemporaryUrl,
} from '../services/generation-retention';

describe('generation retention storage keys', () => {
  it('extracts only temporary generation files', () => {
    expect(storageKeyFromTemporaryUrl('http://localhost:4000/static/results/project/a.png', 'user-1'))
      .toBe('results/project/a.png');
    expect(storageKeyFromTemporaryUrl('chat:user-uploads/chat/user-1/input.mp4', 'user-1'))
      .toBe('user-uploads/chat/user-1/input.mp4');
    expect(storageKeyFromTemporaryUrl('/static/user-inputs/user-1/project/ref.jpg', 'user-1'))
      .toBe('user-inputs/user-1/project/ref.jpg');
    expect(storageKeyFromTemporaryUrl('/static/user-uploads/user-1/2026-06/legacy.jpg', 'user-1'))
      .toBe('user-uploads/user-1/2026-06/legacy.jpg');

    expect(storageKeyFromTemporaryUrl('/static/media-assets/user-avatar/keep.jpg', 'user-1'))
      .toBeNull();
    expect(storageKeyFromTemporaryUrl('/static/user-uploads/library/user-1/keep.jpg', 'user-1'))
      .toBeNull();
    expect(storageKeyFromTemporaryUrl('/static/user-uploads/profile/user-1/avatar.jpg', 'user-1'))
      .toBeNull();
  });

  it('walks project result metadata without collecting studio assets', () => {
    const keys = collectProjectStorageKeys({
      id: 'project-1',
      userId: 'user-1',
      mode: 'service',
      inputImages: ['http://localhost:4000/static/user-inputs/user-1/project-1/input.jpg'],
      resultImage: 'http://localhost:4000/static/results/project-1/final.png',
      resultVideo: null,
      resultThumbnail: null,
      resultAssets: [
        { type: 'image', url: 'http://localhost:4000/static/results/project-1/slide-1.png' },
        { type: 'image', url: 'http://localhost:4000/static/media-assets/preview-image/keep.png' },
      ],
      userInputs: {
        savedAsset: 'asset:avatar-1',
        savedUrl: 'http://localhost:4000/static/user-uploads/library/user-1/keep.png',
      },
      stepProgress: [
        { output: { preview: 'chat:user-uploads/chat/user-1/upload.jpg' } },
      ],
    } as any);

    expect(keys.sort()).toEqual([
      'results/project-1/final.png',
      'results/project-1/slide-1.png',
      'user-inputs/user-1/project-1/input.jpg',
      'user-uploads/chat/user-1/upload.jpg',
    ]);
  });
});
