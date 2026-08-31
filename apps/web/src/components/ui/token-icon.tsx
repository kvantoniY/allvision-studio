import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Значок токена.
 *
 * Картинка, а не рисованный svg: логотип задаёт владелец файлом, и подгонять его вручную
 * в коде пришлось бы при каждой правке. Размер по умолчанию тот же, что был у прежнего
 * значка, — ценники не должны поехать.
 *
 * `unoptimized` намеренно: файл маленький и лежит в public, а оптимизатор Next добавил бы
 * лишний запрос на каждый ценник, которых на странице каталога десятки.
 */
export function TokenIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/token_icon.png"
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      unoptimized
      className={cn('inline-block h-4 w-4 shrink-0 object-contain', className)}
    />
  );
}
