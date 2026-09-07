/**
 * Куда уходит блок при заданном режиме провайдера.
 *
 * Правило вынесено в shared, потому что ответ на него нужен в двух местах: воркер по нему
 * выбирает провайдера на самом деле, а админ-мониторинг показывает владельцу, какие услуги
 * ещё не на fal. Разъехавшиеся копии этого правила означали бы, что мониторинг спокойно
 * рапортует «всё на fal», пока генерация уходит на PiAPI.
 */

/** Блоки без внешнего провайдера: локальный ffmpeg или демо-заглушка. */
export const MOCK_ONLY_BLOCKS = ['image-restore', 'image-upscale', 'timeline-render'] as const;

/**
 * Блоки, которых на fal физически нет: соответствующие методы FalProvider бросают
 * FAL_NOT_IMPLEMENTED. Только они остаются на PiAPI в режиме fal — и только пока не будут
 * перенесены или выключены.
 */
export const FAL_UNSUPPORTED_BLOCKS = ['video-effect', 'video-watermark-remove', 'video-upscale'] as const;

export type BlockProvider = 'fal' | 'piapi' | 'mock';

/**
 * Блок идёт на fal, если режим fal и блок не входит в список нереализованных. Обратное
 * правило («на fal только то, что перечислено в FAL_BLOCKS») было опасным: прод переопределяет
 * FAL_BLOCKS через env, список отставал от каталога, и каждый новый блок молча уходил на
 * PiAPI — с чужим ключом, чужим балансом и другой ценой. Список из env остаётся, но теперь он
 * может только ДОБАВИТЬ блок на fal, а не увести его оттуда.
 */
export function resolveBlockProvider(
  blockSlug: string | undefined,
  options: { mode: 'fal' | 'piapi' | 'mock' | 'stub'; falBlocks?: readonly string[] },
): BlockProvider {
  if (options.mode === 'mock' || options.mode === 'stub') return 'mock';
  if (!blockSlug) return 'mock';
  if ((MOCK_ONLY_BLOCKS as readonly string[]).includes(blockSlug)) return 'mock';
  if (options.mode === 'piapi') return 'piapi';
  if (options.falBlocks?.includes(blockSlug)) return 'fal';
  if ((FAL_UNSUPPORTED_BLOCKS as readonly string[]).includes(blockSlug)) return 'piapi';
  return 'fal';
}
