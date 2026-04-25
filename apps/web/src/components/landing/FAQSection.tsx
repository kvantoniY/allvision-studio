'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { landingFaqs } from '@/lib/public-content';
import { Reveal } from './Reveal';

export function FAQSection() {
  return (
    <section className="border-y bg-slate-50 py-20 dark:border-slate-800 dark:bg-slate-950/60">
      <div className="container">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">FAQ</p>
          <h2 className="mt-3 text-3xl font-bold md:text-5xl">Частые вопросы</h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            Собрали ответы на самые частые вопросы про токены, безопасность, сроки и возвраты.
          </p>
        </Reveal>

        <Reveal className="mx-auto mt-10 max-w-4xl rounded-lg border bg-card px-5 dark:border-slate-800">
          <Accordion type="single" collapsible>
            {landingFaqs.map((item, index) => (
              <AccordionItem key={item.question} value={`faq-${index}`}>
                <AccordionTrigger className="text-left text-base">{item.question}</AccordionTrigger>
                <AccordionContent className="text-base leading-7 text-muted-foreground">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
