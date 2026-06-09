import {
  collectProjectStorageKeys,
  storageKeyFromTemporaryUrl,
} from '../services/generation-delete-service';

describe('generation delete storage keys', () => {
  it('extracts temporary generation files only', () => {
    expect(storageKeyFromTemporaryUrl('https://allvision-pulse.ru/static/outputs/user-1/project-1/step_1/result.jpg', 'user-1'))
      .toBe('outputs/user-1/project-1/step_1/result.jpg');
    expect(storageKeyFromTemporaryUrl('/static/user-inputs/user-1/project-1/input.png', 'user-1'))
      .toBe('user-inputs/user-1/project-1/input.png');
    expect(storageKeyFromTemporaryUrl('chat:user-uploads/chat/user-1/source.mp4', 'user-1'))
      .toBe('user-uploads/chat/user-1/source.mp4');

    expect(storageKeyFromTemporaryUrl('/static/media-assets/user-avatar/keep.jpg', 'user-1')).toBeNull();
    expect(storageKeyFromTemporaryUrl('/static/user-uploads/library/user-1/keep.jpg', 'user-1')).toBeNull();
    expect(storageKeyFromTemporaryUrl('/static/user-uploads/profile/user-1/avatar.jpg', 'user-1')).toBeNull();
  });

  it('walks project metadata without collecting saved studio assets', () => {
    const keys = collectProjectStorageKeys({
      id: 'project-1',
      userId: 'user-1',
      mode: 'service',
      aiProviderLogs: { output: '/static/outputs/user-1/project-1/provider/result.jpg' },
      inputImages: ['/static/user-inputs/user-1/project-1/input.jpg'],
      resultImage: '/static/outputs/user-1/project-1/step_1/result.jpg',
      resultVideo: null,
      resultThumbnail: null,
      resultAssets: [
        { type: 'image', url: '/static/results/project-1/slide-1.png' },
        { type: 'video', url: '/static/outputs/user-1/project-1/step_2/result.mp4' },
        { type: 'image', url: '/static/media-assets/preview-image/keep.png' },
      ],
      userInputs: {
        savedAsset: 'asset:avatar-1',
        savedUrl: '/static/user-uploads/library/user-1/keep.png',
      },
      stepProgress: [
        { output: { preview: 'chat:user-uploads/chat/user-1/upload.jpg' } },
      ],
    } as any);

    expect(keys.sort()).toEqual([
      'outputs/user-1/project-1/provider/result.jpg',
      'outputs/user-1/project-1/step_1/result.jpg',
      'outputs/user-1/project-1/step_2/result.mp4',
      'results/project-1/slide-1.png',
      'user-inputs/user-1/project-1/input.jpg',
      'user-uploads/chat/user-1/upload.jpg',
    ]);
  });
});
