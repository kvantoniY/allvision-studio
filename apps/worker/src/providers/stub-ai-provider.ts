import type { AIProvider, ProviderResult } from './ai-provider';
import type { ProviderRunContext } from './ai-provider';

function result(url: string, meta: Record<string, unknown> = {}): ProviderResult {
  return {
    outputUrl: url,
    costUsd: 0,
    durationMs: 1,
    meta: { provider: 'stub', ...meta },
  };
}

export class StubAIProvider implements AIProvider {
  name = 'stub' as const;

  async imageRestore(input: {
    imageUrl: string;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    return result(input.imageUrl, { type: 'image' });
  }

  async imageToVideo(_input: {
    imageUrl: string;
    prompt?: string;
    durationSec: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    return result('stub://result.mp4', { type: 'video' });
  }

  async faceSwapVideo(_input: {
    swapImageUrl: string;
    targetVideoUrl: string;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    return result('stub://face-swap.mp4', { type: 'video' });
  }
}
