import type { Metadata } from 'next';
import { isCatalogSection } from '@allvision/shared';
import { ServicesCatalog } from '@/components/pages/ServicesCatalog';
import { pageMetadata } from '@/lib/seo';

type ServicesPageProps = {
  searchParams?: {
    tab?: string;
    category?: string;
    occasion?: string;
  };
};

const SECTION_METADATA: Record<string, { title: string; description: string; keywords: string[] }> = {
  popular: {
    title: 'AI-подарки: видео-поздравления, оживление фото, аватары',
    description:
      'Популярные подарки Allvision Studio: видео-поздравления, оживление старых фотографий, аватары и трендовые ролики. Готовый результат за несколько минут.',
    keywords: ['подарок на день рождения', 'необычный подарок', 'видео поздравление', 'подарок своими руками онлайн'],
  },
  services: {
    title: 'AI-услуги: оживить фото, перенос в фильм, трендовые видео',
    description:
      'Каталог AI-услуг: реставрация и оживление старых фото, перенос себя в фильм или мультфильм, трендовые видео, карусели для соцсетей и карточки товара.',
    keywords: ['оживить старое фото', 'реставрация фото нейросеть', 'я в фильме нейросеть', 'трендовое видео ИИ'],
  },
  greetings: {
    title: 'Видео-поздравления на заказ: шаблоны и редактор',
    description:
      'Готовые шаблоны видео-поздравлений на день рождения, юбилей и Новый год: загрузите фото и получите смонтированный ролик с музыкой, титрами и переходами.',
    keywords: [
      'видео поздравление на день рождения',
      'видео открытка',
      'поздравление с юбилеем видео',
      'новогоднее видео поздравление',
    ],
  },
  albums: {
    title: 'Фотоальбомы с печатью — скоро в Allvision Studio',
    description:
      'Редактор фотоальбомов с печатью и доставкой: соберите книгу из своих фотографий и AI-кадров. Раздел готовится к запуску.',
    keywords: ['фотокнига на заказ', 'фотоальбом с печатью', 'напечатать фотоальбом'],
  },
};

export function generateMetadata({ searchParams }: ServicesPageProps): Metadata {
  const tab = isCatalogSection(searchParams?.tab) ? searchParams.tab : 'popular';
  const meta = SECTION_METADATA[tab] ?? SECTION_METADATA.popular;
  return pageMetadata({
    title: meta.title,
    description: meta.description,
    // Вкладки — это фильтр одной витрины, поэтому canonical у всех один:
    // так поисковик не дробит вес страницы между четырьмя почти одинаковыми адресами.
    path: '/services',
    keywords: meta.keywords,
  });
}

export default function ServicesPage({ searchParams }: ServicesPageProps) {
  const tab = isCatalogSection(searchParams?.tab) ? searchParams.tab : 'popular';

  return (
    <ServicesCatalog
      initialTab={tab}
      initialCategory={searchParams?.category}
      initialOccasion={searchParams?.occasion}
    />
  );
}
