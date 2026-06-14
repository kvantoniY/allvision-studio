'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from './Reveal';

export function CTASection() {
  return (
    <section className="container py-20">
      <Reveal className="overflow-hidden rounded-lg border bg-slate-950 p-8 text-white shadow-2xl shadow-indigo-950/20 md:p-12">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-indigo-100">
              <Sparkles className="h-4 w-4 text-amber-300" />
              25 токенов после регистрации
            </div>
            <h2 className="text-3xl font-bold md:text-5xl">Готовы создать результат, который не забудут?</h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-indigo-100">
              Начните с одного фото или имени: выберите категорию, формат и качество, а результат появится в кабинете.
            </p>
          </div>
          <Button asChild size="lg" className="bg-amber-500 text-slate-950 hover:bg-amber-400">
            <Link href="/register">
              Создать подарок
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
