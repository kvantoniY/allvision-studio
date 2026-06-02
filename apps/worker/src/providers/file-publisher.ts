export interface PublishedFile {
  publicUrl: string;
  expiresAt: Date;
  key?: string;
}

export interface FilePublisher {
  publishImageUrl(imageUrl: string, ttlHours: number): Promise<PublishedFile>;
  publishFileUrl(fileUrl: string, ttlHours: number, contentType?: string): Promise<PublishedFile>;
}

export function expiresAt(ttlHours: number) {
  return new Date(Date.now() + ttlHours * 60 * 60 * 1000);
}
