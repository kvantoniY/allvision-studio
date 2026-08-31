import { formatTokens } from '@allvision/shared';
import { TokenIcon } from '@/components/ui/token-icon';
import { cn } from '@/lib/utils';

/**
 * Ценник: число и значок токена.
 *
 * Один компонент на все ценники, чтобы цифра и значок не расходились по размеру от
 * страницы к странице. Слово «токенов» здесь не пишется намеренно — оно осталось только
 * на странице покупки пакета.
 */
export function TokenPrice({
  value,
  className,
  iconClassName,
}: {
  value: number;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {formatTokens(value)}
      <TokenIcon className={cn('h-[1em] w-[1em]', iconClassName)} />
    </span>
  );
}
