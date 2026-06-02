import type { FilePublisher } from './file-publisher';
import { expiresAt } from './file-publisher';

export class NoopPublisher implements FilePublisher {
  async publishImageUrl(imageUrl: string, ttlHours: number) {
    return {
      publicUrl: imageUrl,
      expiresAt: expiresAt(ttlHours),
    };
  }

  async publishFileUrl(fileUrl: string, ttlHours: number) {
    return {
      publicUrl: fileUrl,
      expiresAt: expiresAt(ttlHours),
    };
  }
}
