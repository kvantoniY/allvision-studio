'use client';

import { Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { testimonials } from '@/lib/public-content';
import { Reveal } from './Reveal';

export function TestimonialsSection() {
  return (
    <section className="border-y bg-slate-50 py-20 dark:border-slate-800 dark:bg-slate-950/60">
      <div className="container">
        <Reveal className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">Отзывы</p>
          <h2 className="mt-3 text-3xl font-bold md:text-5xl">Когда результат попадает в сердце</h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            Главная метрика Allvision — реакция человека, которому вы отправляете результат.
          </p>
        </Reveal>

        <Reveal className="mt-10">
          <Carousel opts={{ align: 'start', loop: true }} className="mx-auto max-w-6xl">
            <CarouselContent>
              {testimonials.map((item) => (
                <CarouselItem key={`${item.name}-${item.city}`} className="md:basis-1/2 lg:basis-1/3">
                  <Card className="relative h-full border-slate-200/70 bg-card/80 dark:border-slate-800">
                    <span className="absolute right-4 top-4 max-w-[11rem] text-right text-[11px] leading-4 text-muted-foreground">
                      * Отзывы собраны на этапе бета-тестирования
                    </span>
                    <CardContent className="flex h-full flex-col gap-5 p-6 pt-12">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={`https://picsum.photos/seed/avatar-${item.initials}-${item.city}/200/200`} alt={item.name} />
                          <AvatarFallback>{item.initials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold">{item.name}</div>
                          <div className="text-sm text-muted-foreground">{item.city}</div>
                        </div>
                      </div>
                      <div className="flex gap-1 text-amber-500">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={index} className="h-4 w-4 fill-current" />
                        ))}
                      </div>
                      <p className="flex-1 text-sm leading-7 text-muted-foreground">“{item.text}”</p>
                      <div className="rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                        {item.service}
                      </div>
                    </CardContent>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-2 border-slate-300 bg-background/80 md:-left-4" />
            <CarouselNext className="right-2 border-slate-300 bg-background/80 md:-right-4" />
          </Carousel>
        </Reveal>
      </div>
    </section>
  );
}
