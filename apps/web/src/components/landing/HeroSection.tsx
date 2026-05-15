'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Gift, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-[linear-gradient(130deg,rgba(124,58,237,0.34),rgba(15,23,42,0.92)_48%,rgba(2,6,23,1)_100%)]" />
      <div className="absolute -left-28 top-16 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl" />
      <div className="absolute -right-24 top-28 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="container relative grid min-h-[calc(100vh-80px)] items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: 'easeOut' }}
          className="max-w-3xl text-white"
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm text-indigo-100 backdrop-blur">
            <Gift className="h-4 w-4 text-amber-300" />
            Цифровые подарки для семейных историй и важных дат
          </div>
          <h1 className="text-5xl font-black leading-none tracking-tight md:text-7xl">
            Выберите повод, а мы соберём подарок за несколько минут
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-indigo-100 md:text-xl">
            Оживите свадебное фото бабушки, отправьте лицо в трендовое видео или сделайте ребёнка героем доброго мультика. Никаких промптов — только формат, фото и готовый результат.
          </p>
          <div className="mt-9 grid gap-3 sm:inline-grid sm:grid-cols-[260px_260px] sm:items-start">
            <Button asChild size="lg" className="h-14 w-full bg-amber-500 text-slate-950 hover:bg-amber-400">
              <Link href="/services">
                Посмотреть подарки
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-14 w-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <Link href="/register">Создать первый бесплатно</Link>
            </Button>
          </div>
          <div className="mt-3 text-sm font-semibold text-amber-100">25 токенов после регистрации</div>

          <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-indigo-100">
            <span>2–5 минут на готовое решение</span>
            <span className="text-violet-300">·</span>
            <span>Standard и Pro качество</span>
            <span className="text-violet-300">·</span>
            <span>4 категории подарков</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease: 'easeOut' }}
          className="relative"
        >
          <div className="rounded-xl border border-white/15 bg-white/10 p-3 shadow-2xl shadow-violet-950/50 backdrop-blur">
            <div className="overflow-hidden rounded-lg">
              <Image
                src="https://picsum.photos/seed/allvision-gift-family/1200/800"
                alt="Семейный цифровой подарок Allvision Studio"
                width={1200}
                height={800}
                priority
                className="h-72 w-full object-cover sm:h-[480px]"
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-indigo-100">
              <div className="rounded-md bg-slate-950/70 p-3">Ностальгия</div>
              <div className="rounded-md bg-slate-950/70 p-3">Дети-герои</div>
              <div className="rounded-md bg-slate-950/70 p-3">Особые поводы</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
