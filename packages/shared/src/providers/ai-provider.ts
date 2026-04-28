export interface AIProvider {
  name: string;

  restorePhoto(params: {
    imageUrl: string;
    config: Record<string, any>;
  }): Promise<AIJobHandle>;

  animateImage(params: {
    imageUrl: string;
    config: Record<string, any>;
  }): Promise<AIJobHandle>;

  generateTrend(params: {
    imageUrl: string;
    trendPrompt: string;
    model: string;
    config: Record<string, any>;
  }): Promise<AIJobHandle>;

  /**
   * Синхронная генерация текстового сценария (услуга 6).
   * В отличие от видео-задач — возвращает результат сразу (10-15 сек).
   * Используется LLM (OpenAI / Anthropic / Mock).
   */
  generateFairyTaleScript(params: {
    childName: string;
    childAge: number;
    moralLesson: string;
    additionalDetails?: string;
    durationMinutes: number; // фикс 3 на старте, но параметризуем на будущее
  }): Promise<FairyTaleScript>;

  checkNSFW(imageUrl: string): Promise<NSFWCheckResult>;

  getJobStatus(handle: AIJobHandle): Promise<AIJobStatus>;
}

export interface NSFWCheckResult {
  safe: boolean;
  score: number;
  reason?: string;
}

export interface AIJobHandle {
  providerJobId: string;
  metadata?: Record<string, any>;
}

export interface AIJobStatus {
  status: 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  resultUrl?: string;
  resultType?: 'image' | 'video';
  errorMessage?: string;
}

/** Структурированный сценарий сказки */
export interface FairyTaleScript {
  title: string;
  moral: string;
  durationMinutes: number;
  scenes: FairyTaleScene[];
  tokensCost: number; // для логирования
}

export interface FairyTaleScene {
  number: number;
  description: string;   // что происходит в сцене (для админа-аниматора)
  dialogue?: string;     // реплики персонажей
  visualCues: string;    // визуальное описание (для админа и как промпт-подсказка)
}
