import Link from 'next/link';
import { Instagram, MessageCircle, Music2, Send, Youtube } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { merchantInfo } from '@/lib/merchant';
import { serviceLinks } from '@/lib/public-content';

const companyLinks = [
  { href: '/about', label: 'О проекте' },
  { href: '/contacts', label: 'Контакты' },
  { href: '/privacy', label: 'Политика конфиденциальности' },
  { href: '/terms', label: 'Пользовательское соглашение' },
  { href: '/offer', label: 'Публичная оферта' },
  { href: '/pd-consent', label: 'Согласие на обработку ПДн' },
];

const socials = [
  { label: 'Instagram', icon: Instagram, href: 'https://www.instagram.com/allvision_ai/' },
  { label: 'Telegram', icon: Send, href: 'https://t.me/allvision_ai' },
  { label: 'VK', icon: MessageCircle, href: 'https://vk.com/allvision_ai' },
  { label: 'YouTube', icon: Youtube, href: 'https://www.youtube.com/@AllvisionAI' },
  { label: 'TikTok', icon: Music2, href: 'https://vt.tiktok.com/ZSCAmxMvY/' },
];

export function Footer() {
  return (
    <footer className="border-t bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <div className="container grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <BrandLogo className="h-6 w-auto" />
            <span>Allvision Studio</span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
            AI-сервис для создания и обработки медиа: фото, видео, тренды, мультфильмы и персональные сказки.
          </p>
          <div className="mt-5 flex gap-2">
            {socials.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={item.label}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-muted-foreground transition hover:-translate-y-0.5 hover:bg-slate-800 hover:text-foreground"
              >
                <item.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <div className="font-semibold">Услуги</div>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {serviceLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="underline-offset-4 transition hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="font-semibold">Компания</div>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {companyLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="underline-offset-4 transition hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="font-semibold">Поддержка</div>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              Email:{' '}
              <a href={`mailto:${merchantInfo.email}`} className="underline-offset-4 transition hover:text-foreground hover:underline">
                {merchantInfo.email}
              </a>
            </li>
            <li>Телефон: {merchantInfo.phone}</li>
            <li>Время работы: {merchantInfo.workingHours}</li>
          </ul>
        </div>
      </div>

      <div className="border-t dark:border-slate-800">
        <div className="container flex flex-col gap-2 py-5 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>© 2026 {merchantInfo.brandName}. Все права защищены.</div>
          <div>{merchantInfo.legalName}, ИНН {merchantInfo.inn}, НПД</div>
        </div>
      </div>
    </footer>
  );
}
