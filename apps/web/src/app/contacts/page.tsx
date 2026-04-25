import type { Metadata } from 'next';
import { Mail, Send, Timer } from 'lucide-react';
import { ContactForm } from '@/components/pages/ContactForm';

export const metadata: Metadata = {
  title: 'Контакты',
  description: 'Контакты Allvision Studio: Telegram поддержки, email и форма обратной связи.',
};

export default function ContactsPage() {
  return (
    <section className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">Контакты</p>
        <h1 className="mt-3 text-4xl font-bold md:text-6xl">Напишите нам</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Поможем выбрать услугу, разобраться с токенами, оценить заказной ролик или проверить техническую проблему.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[0.75fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-5 dark:border-slate-800">
            <Send className="h-5 w-5 text-indigo-500" />
            <div className="mt-3 font-semibold">Telegram</div>
            <a href="https://t.me/allvision_support" className="mt-1 block text-muted-foreground hover:text-foreground">
              @allvision_support
            </a>
          </div>
          <div className="rounded-lg border bg-card p-5 dark:border-slate-800">
            <Mail className="h-5 w-5 text-amber-500" />
            <div className="mt-3 font-semibold">Email</div>
            <a href="mailto:hello@allvision.studio" className="mt-1 block text-muted-foreground hover:text-foreground">
              hello@allvision.studio
            </a>
          </div>
          <div className="rounded-lg border bg-card p-5 dark:border-slate-800">
            <Timer className="h-5 w-5 text-emerald-500" />
            <div className="mt-3 font-semibold">Время работы</div>
            <p className="mt-1 text-muted-foreground">ежедневно с 9:00 до 22:00 МСК</p>
          </div>
        </div>
        <ContactForm />
      </div>
    </section>
  );
}
