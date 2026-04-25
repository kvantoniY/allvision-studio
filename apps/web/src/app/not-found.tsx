import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <section className="container flex min-h-[70vh] items-center py-14">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[0.85fr_1fr] md:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-indigo-500">404</p>
          <h1 className="mt-3 text-4xl font-bold md:text-6xl">Такой страницы не существует</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Возможно, ссылка устарела, страница переехала или адрес набран с ошибкой. Каталог услуг и главная страница точно на месте.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
              <Link href="/">На главную</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/services">Все услуги</Link>
            </Button>
          </div>
        </div>

        <svg viewBox="0 0 520 420" role="img" aria-label="Иллюстрация потерянной страницы" className="w-full">
          <rect x="70" y="72" width="380" height="270" rx="18" fill="#0f172a" />
          <rect x="92" y="96" width="336" height="198" rx="12" fill="#1e293b" />
          <path d="M135 273c48-63 85-75 123-36 28 28 52 28 80 0 20-20 38-27 59-12v69H135v-21Z" fill="#6366f1" opacity="0.85" />
          <circle cx="175" cy="142" r="24" fill="#f59e0b" />
          <path d="M154 196c19-27 41-27 60 0M294 196c19-27 41-27 60 0" stroke="#cbd5e1" strokeWidth="10" strokeLinecap="round" fill="none" />
          <path d="M216 242c26 22 62 22 88 0" stroke="#f8fafc" strokeWidth="10" strokeLinecap="round" fill="none" />
          <rect x="146" y="322" width="228" height="18" rx="9" fill="#312e81" />
          <circle cx="91" cy="74" r="16" fill="#a855f7" />
          <circle cx="430" cy="338" r="18" fill="#f59e0b" />
          <path d="M410 60h42M431 39v42" stroke="#818cf8" strokeWidth="8" strokeLinecap="round" />
        </svg>
      </div>
    </section>
  );
}
