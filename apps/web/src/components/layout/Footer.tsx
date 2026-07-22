import Link from 'next/link';
import { Mail, Send } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { merchantInfo } from '@/lib/merchant';

const learningLinks = [
  { href: '/#directions', label: 'Направления' },
  { href: '/#lesson', label: 'Как проходит урок' },
  { href: '/#prices', label: 'Цены и пакеты' },
  { href: '/#faq', label: 'Частые вопросы' },
];

const companyLinks = [
  { href: '/about', label: 'О школе' },
  { href: '/contacts', label: 'Контакты' },
  { href: '/privacy', label: 'Политика конфиденциальности' },
  { href: '/terms', label: 'Пользовательское соглашение' },
  { href: '/offer', label: 'Публичная оферта' },
  { href: '/pd-consent', label: 'Согласие на обработку ПДн' },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-secondary/45">
      <div className="container grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <BrandLogo className="h-8 w-8" />
            <span>Allvision Academy</span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
            Персональная онлайн-школа: живой преподаватель, AI-персонаж ребёнка и интерактивный урок-приключение.
          </p>
        </div>

        <div>
          <div className="font-semibold">Обучение</div>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {learningLinks.map((item) => (
              <li key={item.href}><Link href={item.href} className="hover:text-foreground hover:underline">{item.label}</Link></li>
            ))}
          </ul>
        </div>

        <div>
          <div className="font-semibold">Документы</div>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {companyLinks.map((item) => (
              <li key={item.href}><Link href={item.href} className="hover:text-foreground hover:underline">{item.label}</Link></li>
            ))}
          </ul>
        </div>

        <div>
          <div className="font-semibold">Поддержка</div>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li><a href={`mailto:${merchantInfo.email}`} className="inline-flex items-center gap-2 hover:text-foreground"><Mail className="h-4 w-4" />{merchantInfo.email}</a></li>
            <li><a href={`https://t.me/${merchantInfo.supportTelegram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-foreground"><Send className="h-4 w-4" />{merchantInfo.supportTelegram}</a></li>
            <li>{merchantInfo.workingHours}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container flex flex-col gap-2 py-5 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>© 2026 {merchantInfo.brandName}. Все права защищены.</div>
          <div>{merchantInfo.legalName}, ИНН {merchantInfo.inn}, НПД</div>
        </div>
      </div>
    </footer>
  );
}
