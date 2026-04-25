import type { Readable } from 'stream';

export interface StorageProvider {
  upload(params: {
    key: string;
    body: Buffer | Readable;
    contentType: string;
  }): Promise<{ url: string; key: string }>;

  getSignedUrl(key: string, expiresInSec: number): Promise<string>;

  delete(key: string): Promise<void>;
}
