import type { Metadata } from 'next';
import { BadgeCheck, Mail, Phone, Send, Timer } from 'lucide-react';
import { ContactForm } from '@/components/pages/ContactForm';
import { merchantInfo } from '@/lib/merchant';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Контакты',
  description: 'Связаться с Allvision Academy по вопросам занятий, расписания, оплаты и защиты данных ребёнка.',
  path: '/contacts',
});

export default function ContactsPage() {
  return (
    <section className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Контакты</p>
        <h1 className="mt-3 text-4xl font-bold md:text-6xl">Напишите нам</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Поможем выбрать длительность занятия, разобраться с расписанием и оплатой или решить техническую проблему в кабинете.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[0.75fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-5 dark:border-slate-800">
            <Send className="h-5 w-5 text-indigo-500" />
            <div className="mt-3 font-semibold">Telegram</div>
            <a href="https://t.me/allvision_support" className="mt-1 block text-muted-foreground hover:text-foreground">
              {merchantInfo.supportTelegram}
            </a>
          </div>
          <div className="rounded-lg border bg-card p-5 dark:border-slate-800">
            <Mail className="h-5 w-5 text-amber-500" />
            <div className="mt-3 font-semibold">Email</div>
            <a href={`mailto:${merchantInfo.email}`} className="mt-1 block text-muted-foreground hover:text-foreground">
              {merchantInfo.email}
            </a>
          </div>
          <div className="rounded-lg border bg-card p-5 dark:border-slate-800">
            <Phone className="h-5 w-5 text-sky-500" />
            <div className="mt-3 font-semibold">Телефон</div>
            <a href={`tel:${merchantInfo.phone.replace(/[^\d+]/g, '')}`} className="mt-1 block text-muted-foreground hover:text-foreground">
              {merchantInfo.phone}
            </a>
          </div>
          <div className="rounded-lg border bg-card p-5 dark:border-slate-800">
            <Timer className="h-5 w-5 text-emerald-500" />
            <div className="mt-3 font-semibold">Время работы</div>
            <p className="mt-1 text-muted-foreground">{merchantInfo.workingHours}</p>
          </div>
          <div className="rounded-lg border bg-card p-5 dark:border-slate-800">
            <BadgeCheck className="h-5 w-5 text-violet-500" />
            <div className="mt-3 font-semibold">Реквизиты</div>
            <p className="mt-1 text-muted-foreground">{merchantInfo.legalName}</p>
            <p className="text-muted-foreground">ИНН {merchantInfo.inn}</p>
            <p className="text-muted-foreground">{merchantInfo.taxStatus}</p>
            <p className="text-muted-foreground">Регион: {merchantInfo.activityRegion}</p>
          </div>
        </div>
        <ContactForm />
      </div>
    </section>
  );
}
