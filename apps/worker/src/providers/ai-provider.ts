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

  imageEdit(input: {
    imageUrl?: string;
    prompt: string;
    model: string;
    negativePrompt?: string;
    strength?: number;
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

  textToVideo(input: {
    prompt: string;
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

  motionTransfer(input: {
    inputImageUrl: string;
    drivingVideoUrl?: string;
    prompt?: string;
    durationSec: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult>;

  videoEffect(input: {
    imageUrl: string;
    effectId?: string;
    prompt?: string;
    durationSec: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult>;

  removeWatermark(input: {
    videoUrl: string;
    durationSec?: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult>;
}
