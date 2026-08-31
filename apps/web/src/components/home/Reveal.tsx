'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Появление блока при скролле.
 *
 * Сделано на IntersectionObserver, а не на слушателе скролла: обработчик, который считает
 * позиции на каждый кадр, — первый источник тормозов на длинной странице. Наблюдатель
 * отключается сразу после появления, поэтому после первого прохода страница не стоит
 * ничего.
 *
 * Анимируем только opacity и transform — их браузер делает на видеокарте, без пересчёта
 * раскладки. Тем, кто отключил анимации в системе, показываем блок сразу.
 */
export function Reveal({
  children,
  className,
  /** Задержка в миллисекундах: соседние карточки появляются лесенкой, а не разом. */
  delayMs = 0,
  as: Tag = 'div',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  as?: 'div' | 'section' | 'li' | 'article';
  /**
   * Остальные атрибуты уходят на сам элемент. Это не удобство ради удобства: по
   * `data-home-section` редактор главной находит блоки, и молча проглоченный атрибут
   * сломал бы подсветку при редактировании.
   */
  [key: `data-${string}`]: string | undefined;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Уважаем системную настройку: для кого-то движение на экране — не украшение, а помеха.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      // Небольшой отрицательный отступ снизу: блок проявляется, когда он уже заметно вошёл
      // в кадр, а не в момент касания краем.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      {...rest}
      ref={ref as never}
      style={visible && delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={cn(
        'transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
