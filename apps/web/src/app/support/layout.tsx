import type { Metadata } from 'next';

/*
 * Раздел личного кабинета: в выдаче ему делать нечего. Без своих метаданных страница
 * наследовала canonical корневого layout и объявляла себя копией главной — это и
 * закрывается здесь, вместе с прямым noindex.
 */
export const metadata: Metadata = {
  title: 'Поддержка',
  description: 'Поддержка Allvision Studio.',
  robots: { index: false, follow: false },
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
