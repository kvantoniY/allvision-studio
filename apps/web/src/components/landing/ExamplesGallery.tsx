'use client';

import { X, ZoomIn } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { examples } from '@/lib/public-content';
import { Reveal } from './Reveal';

export function ExamplesGallery() {
  const [selected, setSelected] = useState<(typeof examples)[number] | null>(null);

  return (
    <section id="examples" className="container py-20">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">Галерея</p>
        <h2 className="mt-3 text-3xl font-bold md:text-5xl">Как выглядит готовый результат</h2>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Плейсхолдеры показывают настроение будущих демо: семейные архивы, детские сюжеты, тренды и поздравления.
        </p>
      </Reveal>

      <Reveal className="mt-10">
        <Carousel opts={{ align: 'start', loop: true }} className="mx-auto max-w-6xl">
          <CarouselContent>
            {examples.map((item) => (
              <CarouselItem key={item.title} className="sm:basis-1/2 lg:basis-1/3">
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className="group w-full overflow-hidden rounded-lg border bg-card text-left transition hover:-translate-y-1 hover:shadow-lg dark:border-slate-800"
                >
                  <div className="grid grid-cols-2">
                    <Image src={item.before} alt={`${item.title}: до`} width={800} height={600} className="h-52 w-full object-cover" />
                    <Image src={item.after} alt={`${item.title}: после`} width={800} height={600} className="h-52 w-full object-cover" />
                  </div>
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <div className="text-sm text-muted-foreground">{item.service}</div>
                      <div className="mt-1 font-semibold">{item.title}</div>
                    </div>
                    <span className="rounded-md bg-indigo-100 p-2 text-indigo-700 transition group-hover:bg-amber-500 group-hover:text-slate-950 dark:bg-indigo-950 dark:text-indigo-200">
                      <ZoomIn className="h-4 w-4" />
                    </span>
                  </div>
                </button>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-2 border-slate-300 bg-background/80 md:-left-4" />
          <CarouselNext className="right-2 border-slate-300 bg-background/80 md:-right-4" />
        </Carousel>
      </Reveal>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-5xl overflow-hidden rounded-lg border border-white/15 bg-background shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b p-4 dark:border-slate-800">
              <div>
                <div className="text-sm text-muted-foreground">{selected.service}</div>
                <h3 className="text-xl font-semibold">{selected.title}</h3>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelected(null)} aria-label="Закрыть">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <Image src={selected.before} alt={`${selected.title}: до`} width={800} height={600} className="max-h-[70vh] w-full rounded-md object-cover" />
              <Image src={selected.after} alt={`${selected.title}: после`} width={800} height={600} className="max-h-[70vh] w-full rounded-md object-cover" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
