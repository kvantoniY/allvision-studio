import { VIDEO_TRANSCODE_FILTER } from '../services/media-asset-service';

describe('media asset service', () => {
  it('keeps video transcode dimensions compatible with libx264', () => {
    expect(VIDEO_TRANSCODE_FILTER).toContain('force_original_aspect_ratio=decrease');
    expect(VIDEO_TRANSCODE_FILTER).toContain('force_divisible_by=2');
  });
});
