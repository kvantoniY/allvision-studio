import type { GenerationKind } from '../types/generation';

export interface AIProvider {
  name: string;

  createGeneration(params: {
    generationId: string;
    kind: GenerationKind;
    mode: string;
    prompt?: string | null;
    inputImages?: string[];
    inputVideo?: string | null;
    inputAudio?: string | null;
    config?: Record<string, unknown> | null;
  }): Promise<AIJobHandle>;

  checkNSFW(inputUrl: string): Promise<NSFWCheckResult>;

  getJobStatus(handle: AIJobHandle): Promise<AIJobStatus>;
}

export interface NSFWCheckResult {
  safe: boolean;
  score: number;
  reason?: string;
}

export interface AIJobHandle {
  providerJobId: string;
  metadata?: Record<string, unknown>;
}

export interface AIJobStatus {
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  resultText?: string;
  resultUrl?: string;
  resultType?: 'text' | 'audio' | 'image' | 'video';
  errorMessage?: string;
}
