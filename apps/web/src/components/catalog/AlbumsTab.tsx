'use client';

import { FormEvent, useState } from 'react';
import { BookOpen, Check, Images, Printer, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CaptchaField } from '@/components/security/CaptchaField';
import { useCaptchaToken } from '@/hooks/use-captcha-token';
import { useToast } from '@/hooks/use-toast';
import { useSendWaitlistMutation } from '@/store/api/public-api';

const PREVIEW_CARDS = [
  {
    icon: Images,
    title: 'Редактор разворотов',
    text: 'Перетаскиваете фото по страницам, подписываете, меняете раскладку. Обложка на выбор.',
  },
  {
    icon: Printer,
    title: 'Печать без брака',
    text: 'Плотная бумага, ламинация, цветопроба перед печатью. Предпросмотр покажет обрезку.',
  },
  {
    icon: Truck,
    title: 'Доставка к дате',
    text: 'Скажете, к какому празднику нужен альбом, — рассчитаем срок с запасом.',
  },
];

/**
 * Раздел ещё не построен, но заглушка не бесполезная: она показывает, что будет,
 * и собирает заявки. Это и проверка спроса до вложений в редактор разворотов.
 */
export function AlbumsTab() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [sendWaitlist, { isLoading }] = useSendWaitlistMutation();
  const captcha = useCaptchaToken();
  const { toast } = useToast();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await sendWaitlist({
        topic: 'albums',
        email,
        name: name.trim() || undefined,
        comment: comment.trim() || undefined,
        captchaToken: captcha.token || undefined,
      }).unwrap();
      captcha.reset();
      setSent(true);
    } catch {
      captcha.reset();
      toast({
        title: 'Не удалось отправить заявку',
        description: 'Проверьте адрес почты и попробуйте ещё раз.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-amber-400" />
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Фотоальбомы с печатью</h2>
        </div>
        <p className="mt-3 max-w-2xl leading-7 text-slate-400">
          Собираете альбом из своих фотографий и наших AI-кадров, а мы печатаем и привозим готовую книгу.
          Раздел в разработке — оставьте почту, напишем первым и дадим скидку на первый заказ.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {PREVIEW_CARDS.map((card) => (
            <div key={card.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <card.icon className="h-5 w-5 text-amber-300/80" />
              <h3 className="mt-3 font-semibold text-slate-100">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{card.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-xl">
        {sent ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
            <Check className="mx-auto h-6 w-6 text-emerald-400" />
            <h3 className="mt-3 font-semibold text-slate-100">Записали</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Напишем на {email}, как только альбомы заработают.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
            <div>
              <h3 className="font-semibold text-slate-100">Сообщить о запуске</h3>
              <p className="mt-1 text-sm text-slate-400">Пишем один раз — когда раздел откроется.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="waitlist-email">Email</Label>
              <Input
                id="waitlist-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="waitlist-name">Имя (необязательно)</Label>
              <Input id="waitlist-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="waitlist-comment">Какой альбом вам нужен? (необязательно)</Label>
              <Textarea
                id="waitlist-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Например: свадебный на 40 страниц или детский за первый год"
              />
            </div>
            <CaptchaField token={captcha.token} onTokenChange={captcha.setToken} resetKey={captcha.resetKey} />
            <Button type="submit" disabled={isLoading || !captcha.solved} className="w-full">
              {isLoading ? 'Отправляем...' : 'Сообщить о запуске'}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
