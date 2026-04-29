'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, Clock, Coins, Film, Image as ImageIcon, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TEMPLATE_CATEGORY_LABEL } from '@/components/studio/v3-labels';
import { useAuth } from '@/hooks/use-auth';
import { useGetPublicScenarioTemplateQuery } from '@/store/api/public-scenario-templates-api';

function categoryLabel(category: string) {
  return TEMPLATE_CATEGORY_LABEL[category] ?? category;
}

function isVideo(url: string | null | undefined) {
  return !!url && /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

export default function ScenarioDetailPage() {
  const params = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { data, isLoading } = useGetPublicScenarioTemplateQuery(params.slug);
  const template = data?.template;

  if (isLoading) {
    return (
      <main className="container py-12">
        <Skeleton className="h-[520px] rounded-lg" />
      </main>
    );
  }

  if (!template) {
    return (
      <main className="container py-12">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
          Сценарий не найден.
        </div>
      </main>
    );
  }

  const createHref = `/dashboard/episodes/new?templateId=${template.id}`;
  const loginHref = `/login?redirect=${encodeURIComponent(`/scenarios/${template.slug}`)}`;

  return (
    <main>
      <section className="relative min-h-[560px] overflow-hidden">
        <div className="absolute inset-0 bg-slate-950">
          {isVideo(template.previewVideo) ? (
            <video
              src={template.previewVideo ?? undefined}
              poster={template.previewImage ?? undefined}
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full object-cover opacity-65"
            />
          ) : template.previewImage ? (
            <Image src={template.previewImage} alt={template.title} fill priority className="object-cover opacity-65" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-950/20" />
        </div>
        <div className="container relative flex min-h-[560px] flex-col justify-end pb-12 pt-24">
          <div className="max-w-3xl">
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge className="bg-violet-600 text-white">{categoryLabel(template.category)}</Badge>
              {template.needsScene && <Badge className="bg-sky-600 text-white">Нужна сцена</Badge>}
              {template.isFeatured && <Badge className="bg-amber-400 text-slate-950">Featured</Badge>}
            </div>
            <h1 className="text-4xl font-bold md:text-6xl">{template.title}</h1>
            <p className="mt-5 text-lg leading-8 text-slate-200">{template.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={user ? createHref : loginHref}>{user ? 'Создать эпизод по этому сценарию' : 'Войти и создать'}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/scenarios">К каталогу</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-10">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">Роли персонажей</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {template.characterRoles.map((role, index) => (
                  <div key={`${role.role}-${index}`} className="rounded-md border border-slate-800 bg-slate-950 p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-md bg-violet-500/10 text-violet-300">
                        <Users className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="font-medium">{role.label}</div>
                        <div className="text-xs text-slate-500">{role.role}</div>
                      </div>
                    </div>
                    <Badge className="mt-3 bg-slate-800 text-slate-200">
                      {role.required ? 'Обязательная роль' : 'Опционально'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">Сценарная основа</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-400">{template.shortDesc}</p>
            </div>
          </div>

          <aside className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <span className="flex items-center gap-2 text-sm text-slate-400">
                <Coins className="h-4 w-4 text-amber-400" />
                Цена
              </span>
              <span className="font-semibold">{template.priceTokens} токенов</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <span className="flex items-center gap-2 text-sm text-slate-400">
                <Clock className="h-4 w-4 text-sky-400" />
                Длительность
              </span>
              <span className="font-semibold">{template.recommendedDuration} сек</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <span className="flex items-center gap-2 text-sm text-slate-400">
                <Film className="h-4 w-4 text-violet-400" />
                Стиль
              </span>
              <span className="font-semibold">{template.defaultStyle}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-slate-400">
                <ImageIcon className="h-4 w-4 text-emerald-400" />
                Сцена
              </span>
              <span className="font-semibold">{template.needsScene ? 'Нужна' : 'Не нужна'}</span>
            </div>
            <div className="pt-4">
              <Button asChild className="w-full">
                <Link href={user ? createHref : loginHref}>
                  <CheckCircle2 className="h-4 w-4" />
                  {user ? 'Создать эпизод' : 'Войти и создать'}
                </Link>
              </Button>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
