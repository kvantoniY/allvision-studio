export type ProviderName = 'piapi' | 'fal' | 'mock' | 'stub';

export interface ProviderRunContext {
  projectId: string;
  userId?: string;
  blockSlug: string;
  stepId: string;
  reportProgress?: (percent: number) => Promise<void>;
  // Человекочитаемый этап для админ-консоли (опционально).
  reportStage?: (stage: string) => Promise<void>;
  /**
   * Детский результат: не сохранять промежуточную копию в публичный uploads.
   * Провайдер возвращает временный внешний URL, а процессор сразу пишет байты в private-uploads.
   */
  privateOutput?: boolean;
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

  // Talking-avatar / lip-sync: a character image + an audio file -> video where the character
  // speaks that audio (mouth-sync). Models: OmniHuman 1.5, Kling lip-sync.
  talkingAvatar(input: {
    imageUrl: string;
    audioUrl: string;
    prompt?: string;
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

  videoUpscale(input: {
    videoUrl: string;
    durationSec?: number;
    model: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult>;

  // Обобщённый вызов ЛЮБОГО fal-endpoint'а: админ/юзер задаёт endpoint + функцию (image|video)
  // + готовый input. Используется блоком fal-generic (выбор любой модели fal без хардкода).
  falRaw(input: {
    endpoint: string;
    kind: 'image' | 'video';
    falInput: Record<string, unknown>;
    estimatedCostUsd?: number;
    context: ProviderRunContext;
  }): Promise<ProviderResult>;
}
