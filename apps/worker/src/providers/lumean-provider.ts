import { prisma } from '@allvision/database';
import type { StorageProvider } from '@allvision/shared';
import { ProviderError } from './provider-errors';
import type { ProviderResult, ProviderRunContext } from './ai-provider';

/**
 * Lumean — озвучка текста голосами ElevenLabs через их публичный API.
 *
 * Модель работы у Lumean своя: голос задаётся не полем заказа, а «шаблоном». Заводить шаблон
 * на каждый запрос — значит замусорить кабинет владельца сотнями одноразовых записей, поэтому
 * шаблон создаётся ОДИН раз и переиспользуется, а голос и настройки едут в `config_override`
 * конкретного заказа. Идентификатор шаблона храним в Setting: воркер перезапускается часто,
 * и держать его только в памяти значило бы плодить шаблоны после каждого выката.
 *
 * Заказ обрабатывается асинхронно: создаём, опрашиваем до `completed`, затем меняем путь файла
 * на временную ссылку через `/storage/url` и скачиваем к себе. Ссылка живёт около часа, а сам
 * файл — до ретенции заказа (неделя), поэтому забираем сразу.
 */

const BASE_URL = process.env.LUMEAN_BASE_URL ?? 'https://api.lumean.app/api/public';
const TEMPLATE_SETTING_KEY = 'LUMEAN_TEMPLATE_ID';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/** Модель ElevenLabs по умолчанию: многоязычная, ровно звучит на русском. */
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
/** Голос по умолчанию — если услуга или пользователь не выбрали свой. */
const DEFAULT_VOICE_ID = process.env.LUMEAN_DEFAULT_VOICE_ID ?? '2OdNfs9Z4GCMvoFiCavC';

type LumeanEnvelope<T> = { success: boolean; message?: string; data?: T; errors?: Record<string, string[]> };

type LumeanOrder = {
  id: string;
  status: string;
  progress_percent?: number | null;
  total_tokens?: number | null;
  price_units?: number | null;
  result?: { files?: string[] | null; service_files?: string[] | null } | null;
};

export type LumeanVoice = {
  voiceId: string;
  name: string;
  gender: string | null;
  language: string | null;
  accent: string | null;
  previewUrl: string | null;
  description: string | null;
};

export class LumeanProvider {
  private templateId: string | null = null;

  constructor(private deps: {
    apiKey: string;
    storage: StorageProvider;
    logger: { info: (m: string) => void; warn: (m: string, e?: unknown) => void; error: (m: string, e?: unknown) => void };
  }) {}

  private async request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'X-API-KEY': this.deps.apiKey,
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    });

    const text = await response.text();
    let parsed: LumeanEnvelope<T> | undefined;
    try {
      parsed = text ? (JSON.parse(text) as LumeanEnvelope<T>) : undefined;
    } catch {
      parsed = undefined;
    }

    if (!response.ok) {
      // 422 у них приходит в формате Laravel — без success, зато с полями. Достаём первую
      // причину: «Ошибка валидации» без подробностей ничего не объясняет.
      const fieldError = parsed?.errors ? Object.values(parsed.errors)[0]?.[0] : undefined;
      const message = fieldError ?? parsed?.message ?? `HTTP ${response.status}`;
      if (response.status === 429) {
        throw new ProviderError('LUMEAN_RATE_LIMIT', `Lumean: превышен лимит запросов — ${message}`);
      }
      if (response.status === 402) {
        throw new ProviderError('LUMEAN_BALANCE', 'На балансе Lumean не хватает средств для озвучки.');
      }
      throw new ProviderError('LUMEAN_ERROR', `Lumean ${response.status}: ${message}`);
    }

    if (parsed && parsed.success === false) {
      throw new ProviderError('LUMEAN_ERROR', `Lumean: ${parsed.message ?? 'запрос отклонён'}`);
    }
    return (parsed?.data ?? (parsed as unknown)) as T;
  }

  /**
   * Каталог голосов ElevenLabs. Нумерация страниц у Lumean с нуля — в отличие от остальных
   * их списков, где счёт с единицы.
   */
  async listVoices(query: {
    search?: string;
    gender?: 'male' | 'female';
    language?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ voices: LumeanVoice[]; total: number; hasMore: boolean }> {
    const params = new URLSearchParams();
    params.set('page', String(Math.max(0, query.page ?? 0)));
    params.set('page_size', String(Math.min(100, Math.max(1, query.pageSize ?? 30))));
    if (query.search) params.set('search', query.search);
    if (query.gender) params.set('gender', query.gender);
    if (query.language) params.set('required_languages', query.language);

    const data = await this.request<{
      voices?: Array<Record<string, unknown>>;
      total?: number;
      has_more?: boolean;
    }>(`/voices/elevenlabs/library?${params.toString()}`);

    const voices = (data.voices ?? []).map((raw) => ({
      voiceId: String(raw.voice_id ?? ''),
      name: String(raw.name ?? 'Без имени'),
      gender: typeof raw.gender === 'string' ? raw.gender : null,
      language: typeof raw.language === 'string' ? raw.language : null,
      accent: typeof raw.accent === 'string' ? raw.accent : null,
      previewUrl: typeof raw.preview_url === 'string' ? raw.preview_url : null,
      description: typeof raw.description === 'string' ? raw.description : null,
    })).filter((voice) => voice.voiceId.length > 0);

    return { voices, total: Number(data.total ?? voices.length), hasMore: Boolean(data.has_more) };
  }

  /** Шаблон-носитель: создаётся один раз на аккаунт, голос переопределяется в каждом заказе. */
  private async ensureTemplate(): Promise<string> {
    if (this.templateId) return this.templateId;

    const stored = await prisma.setting.findUnique({ where: { key: TEMPLATE_SETTING_KEY } });
    if (stored?.value) {
      this.templateId = stored.value;
      return stored.value;
    }

    const created = await this.request<{ id: string }>('/templates', {
      method: 'POST',
      body: {
        service_key: 'elevenlabs',
        name: 'Allvision Studio',
        config: {
          tts_settings: {
            mode: 'mode_v1',
            model_id: DEFAULT_MODEL_ID,
            voice_id: DEFAULT_VOICE_ID,
            advanced_voice_settings: true,
            voice_settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true, speed: 1 },
          },
          output_settings: { audio_format: 'mp3', audio_quality: 'high', sample_rate: 44100 },
        },
      },
    });

    await prisma.setting.upsert({
      where: { key: TEMPLATE_SETTING_KEY },
      update: { value: created.id },
      create: { key: TEMPLATE_SETTING_KEY, value: created.id },
    });
    this.templateId = created.id;
    this.deps.logger.info(`[lumean] создан шаблон озвучки ${created.id}`);
    return created.id;
  }

  async textToSpeech(input: {
    text: string;
    voice?: string;
    speed?: number;
    language?: string;
    params?: Record<string, unknown>;
    context: ProviderRunContext;
  }): Promise<ProviderResult> {
    const startedAt = Date.now();
    const templateId = await this.ensureTemplate();

    const read = (key: string) => {
      const value = input.params?.[key];
      return typeof value === 'number' ? value : undefined;
    };
    // Тонкие настройки голоса работают только вместе с этим флагом: без него Lumean молча
    // проигнорирует similarity_boost, style и speaker boost — звук не изменится, ошибки не будет.
    const voiceSettings: Record<string, unknown> = {
      stability: read('stability') ?? 0.5,
      similarity_boost: read('similarity_boost') ?? 0.75,
      style: read('style') ?? 0,
      use_speaker_boost: input.params?.use_speaker_boost !== false,
      // Диапазон скорости у ElevenLabs узкий; выход за него — отказ валидации.
      speed: Math.min(1.2, Math.max(0.7, input.speed ?? 1)),
    };

    const order = await this.request<LumeanOrder>('/orders', {
      method: 'POST',
      body: {
        template_id: templateId,
        input_text: input.text,
        name: `Allvision · ${input.context.projectId.slice(0, 8)}`,
        config_override: {
          tts_settings: {
            voice_id: input.voice || DEFAULT_VOICE_ID,
            model_id: (input.params?.model_id as string) || DEFAULT_MODEL_ID,
            advanced_voice_settings: true,
            voice_settings: voiceSettings,
            ...(input.language ? { language_code: input.language } : {}),
          },
        },
      },
    });

    const finished = await this.waitForOrder(order.id);
    const path = finished.result?.files?.[0];
    if (!path) {
      throw new ProviderError('LUMEAN_NO_RESULT', 'Lumean завершил заказ без файла озвучки.');
    }

    const link = await this.request<{ url: string }>('/storage/url', { method: 'POST', body: { path } });
    const response = await fetch(link.url);
    if (!response.ok) {
      throw new ProviderError('LUMEAN_DOWNLOAD_FAILED', `Не удалось скачать озвучку: HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const key = `outputs/${input.context.userId ?? 'unknown'}/${input.context.projectId}/${input.context.stepId}/voice.mp3`;
    const stored = await this.deps.storage.upload({ key, body: buffer, contentType: 'audio/mpeg' });

    return {
      outputUrl: stored.url,
      durationMs: Date.now() - startedAt,
      // Lumean считает в собственных токенах и списывает со своего баланса, а не в долларах.
      // Ставить сюда выдуманный курс нельзя — пишем ноль, а факт кладём в metadata.
      costUsd: 0,
      meta: {
        provider: 'lumean',
        lumeanOrderId: finished.id,
        lumeanTokens: finished.total_tokens ?? null,
        voiceId: input.voice || DEFAULT_VOICE_ID,
        subtitles: finished.result?.service_files ?? null,
      },
    };
  }

  private async waitForOrder(orderId: string): Promise<LumeanOrder> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const order = await this.request<LumeanOrder>(`/orders/${orderId}`);

      if (order.status === 'completed' || order.status === 'result_delivered') return order;
      // Частично готовый заказ тоже отдаём: одна озвученная дорожка лучше, чем ничего,
      // а чинить отдельные куски человеку в нашем интерфейсе нечем.
      if (order.status === 'partially_completed' && order.result?.files?.length) return order;
      if (['failed', 'cancelled', 'compensated'].includes(order.status)) {
        throw new ProviderError('LUMEAN_FAILED', `Lumean не смог озвучить текст (статус ${order.status}).`);
      }
    }

    throw new ProviderError('LUMEAN_TIMEOUT', 'Lumean не ответил за десять минут — попробуйте ещё раз.');
  }
}
