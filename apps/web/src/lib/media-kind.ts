/**
 * Определение вида медиа по адресу файла.
 *
 * Нужно потому, что у звука в контракте таймлайна нет своего типа вывода: озвучка
 * приезжает тем же полем, что и видео (`resultVideo`). Отдельный тип потянул бы за
 * собой `Project`, DTO и весь интерфейс ради промежуточного артефакта, поэтому вид
 * определяется по расширению — единственному признаку, который есть на клиенте.
 *
 * Запрос вида `?token=...` отбрасываем: в подписанных ссылках расширение стоит до него.
 */
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;

export function isAudioUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const withoutQuery = url.split(/[?#]/)[0];
  return AUDIO_EXTENSIONS.test(withoutQuery);
}
