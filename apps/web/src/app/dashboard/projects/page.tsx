'use client';

import { useState } from 'react';
import { Image as ImageIcon, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import type { Project, ProjectStatus } from '@allvision/shared';
import { cn } from '@/lib/utils';
import { useListProjectsQuery } from '@/store/api/projects-api';

const FILTERS: { value: 'ALL' | ProjectStatus; label: string }[] = [
  { value: 'ALL', label: 'Все' },
  { value: 'PROCESSING', label: 'В обработке' },
  { value: 'COMPLETED', label: 'Готово' },
  { value: 'FAILED', label: 'С ошибкой' },
];

export default function ProjectsPage() {
  const [filter, setFilter] = useState<'ALL' | ProjectStatus>('ALL');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useListProjectsQuery({
    page: 1,
    limit: 20,
    status: filter === 'ALL' ? undefined : filter,
  });
  const projects: Project[] = data?.items ?? [];

  const visible = projects
    .filter((p) => filter === 'ALL' || p.status === filter)
    .filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Мои проекты</h1>
          <p className="mt-1 text-sm text-slate-400">Автоматические услуги: фото-реставрация, анимация, тренды.</p>
        </div>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? 'default' : 'outline'}
                onClick={() => setFilter(f.value)}
                className={cn(filter === f.value && 'bg-violet-600 hover:bg-violet-500')}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию"
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="h-64 bg-slate-900 border-slate-800" />
          ))}
        </div>
      ) : (data?.total ?? 0) === 0 ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6">
            <EmptyState
              size="lg"
              icon={<ImageIcon className="h-full w-full" />}
              title="У вас пока нет проектов"
              description="Создайте первый проект, выбрав услугу из каталога"
              actions={[
                { label: 'Улучшить фото', href: '/services/photo-restore' },
                { label: 'Оживить фото', href: '/services/photo-animate', variant: 'outline' },
                { label: 'Все услуги', href: '/services', variant: 'outline' },
              ]}
            />
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6">
            <EmptyState
              size="lg"
              icon={<Search className="h-full w-full" />}
              title="Ничего не найдено"
              description="Попробуйте изменить поиск или фильтр статуса"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
