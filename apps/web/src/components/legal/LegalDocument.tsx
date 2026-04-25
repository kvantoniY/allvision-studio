import { AlertTriangle } from 'lucide-react';
import { legalNotice } from '@/lib/public-content';

type LegalSection = {
  title: string;
  paragraphs: string[];
};

type LegalDocumentProps = {
  title: string;
  description: string;
  sections: LegalSection[];
};

export function LegalDocument({ title, description, sections }: LegalDocumentProps) {
  return (
    <section className="container py-14 md:py-20">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6 text-amber-900 dark:text-amber-100">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {legalNotice}
        </div>

        <div className="mt-10">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">Документ</p>
          <h1 className="mt-3 text-4xl font-bold md:text-6xl">{title}</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">{description}</p>
        </div>

        <div className="mt-10 space-y-8">
          {sections.map((section, index) => (
            <article key={section.title} className="rounded-lg border bg-card p-6 dark:border-slate-800">
              <h2 className="text-2xl font-semibold">
                {index + 1}. {section.title}
              </h2>
              <div className="mt-4 space-y-4 leading-7 text-muted-foreground">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
