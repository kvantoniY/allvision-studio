import { getBlockCatalogItem } from '../blocks/catalog';
import { PRICING_USD_TO_RUB_DEFAULT } from '../constants/pricing';

/**
 * Голоса, доступные в редакторе.
 *
 * Каталог блока знает больше параметров, но пользователю редактора нужен выбор из двух
 * понятных вариантов, а не список идентификаторов провайдера.
 */
export const VOICEOVER_MODELS = [
  // Голоса Lumean идут первыми: у них каталог из тысяч голосов и выбор конкретного диктора,
  // тогда как у моделей ниже голос один и заранее задан.
  {
    slug: 'lumean-eleven_multilingual_v2',
    title: 'Свой голос из каталога',
    description: 'Тысячи голосов ElevenLabs: выбираете диктора и настраиваете манеру речи.',
    language: 'Multilingual',
    supportsEmotion: false,
    /** У модели выбирается конкретный голос — интерфейс показывает каталог. */
    supportsVoiceCatalog: true,
  },
  {
    slug: 'lumean-eleven_v3',
    title: 'Свой голос · выразительный',
    description: 'Та же библиотека голосов, но модель заметно живее играет интонацией. Дороже.',
    language: 'Multilingual',
    supportsEmotion: false,
    supportsVoiceCatalog: true,
  },
  {
    slug: 'minimax-speech',
    title: 'Русский голос',
    description: 'MiniMax: чисто произносит русский текст и умеет эмоции.',
    language: 'Russian',
    supportsEmotion: true,
    supportsVoiceCatalog: false,
  },
  {
    slug: 'elevenlabs-tts',
    title: 'Английский голос',
    description: 'ElevenLabs: ровнее интонация, но на русском слышен акцент.',
    language: 'English',
    supportsEmotion: false,
    supportsVoiceCatalog: false,
  },
] as const;

export type VoiceoverModelSlug = (typeof VOICEOVER_MODELS)[number]['slug'];

export const VOICEOVER_EMOTIONS = [
  { code: 'happy', title: 'Радостно' },
  { code: 'neutral', title: 'Нейтрально' },
  { code: 'sad', title: 'Грустно' },
  { code: 'surprised', title: 'Удивлённо' },
] as const;

export const VOICEOVER_MAX_LENGTH = 1200;

/**
 * Цена озвучки: удвоенная себестоимость, но не меньше пяти токенов.
 *
 * Считаем от долларовой себестоимости, а не от `estimatedCostCoins` каталога: там осталась
 * старая конвертация (18 ₽ за токен), из-за которой обе модели синтеза стоят «1 токен» и
 * дороже́е ничем не отличается от дешёвой. Токен же ориентировочно равен рублю.
 *
 * Себестоимость синтеза зависит от длины текста, а каталог знает только ориентир, поэтому
 * цена плоская: на реплике в пару предложений расхождение копеечное, а посимвольный счёт
 * означал бы одну цену на экране до запуска и другую в списании после.
 *
 * Функция общая для сервера и редактора намеренно: цена, посчитанная в двух местах
 * по-разному, рано или поздно разъезжается, и человек видит не то, что с него спишут.
 */
export function voiceoverPriceCoins(slug: string): number {
  const model = getBlockCatalogItem('text-to-speech')?.supportedModels.find((item) => item.slug === slug);
  const costCoins = Math.ceil((model?.estimatedCostUsd ?? 0.06) * PRICING_USD_TO_RUB_DEFAULT);
  return Math.max(5, costCoins * 2);
}
