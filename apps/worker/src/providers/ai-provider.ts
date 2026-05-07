export type ProviderName = 'piapi' | 'mock' | 'stub';

export interface ProviderRunContext {
  projectId: string;
  userId?: string;
  blockSlug: string;
  stepId: string;
  reportProgress?: (percent: number) => Promise<void>;
}

export interface ProviderResult {
  outputUrl: string;
  costUsd: number;
  durationMs: number;
  meta?: Record<string, unknown>;
}

export interface AIProvider {
  name: ProviderName;

  imageRestore(input: {
    imageUrl: string;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult>;

  imageToVideo(input: {
    imageUrl: string;
    prompt?: string;
    durationSec: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult>;

  faceSwapVideo(input: {
    swapImageUrl: string;
    targetVideoUrl: string;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult>;
}
