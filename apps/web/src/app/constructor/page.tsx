'use client';

import { useState } from 'react';
import { Blocks, Loader2, Plus, Trash2 } from 'lucide-react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { SceneEditor } from '@/components/academy/constructor/SceneEditor';
import {
  useCreateTemplateMutation,
  useDeleteTemplateMutation,
  useListTemplatesQuery,
} from '@/store/api/academy-lesson-templates-api';

function TemplateList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading } = useListTemplatesQuery();
  const [createTemplate, { isLoading: creating }] = useCreateTemplateMutation();
  const [deleteTemplate] = useDeleteTemplateMutation();
  const [title, setTitle] = useState('');
  const items = data?.items ?? [];

  const create = async () => {
    if (!title.trim()) return;
    try {
      const res = await createTemplate({ title: title.trim() }).unwrap();
      setTitle('');
      onOpen(res.template.id);
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось создать', description: msg, variant: 'destructive' });
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          <Blocks className="h-3.5 w-3.5" /> Конструктор сцен
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Шаблоны уроков</h1>
        <p className="mt-2 text-muted-foreground">Собирайте интерактивные сцены: слои, элементы, правила «событие → условие → действие».</p>
      </div>

      <div className="mb-6 flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название нового урока" onKeyDown={(e) => e.key === 'Enter' && create()} />
        <Button onClick={create} disabled={creating || !title.trim()}>
          {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Создать
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : items.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Пока нет шаблонов. Создайте первый урок выше.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(t.id)}>
                <p className="truncate font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t.status === 'published' ? 'Опубликован' : 'Черновик'} · изменён {new Date(t.updatedAt).toLocaleDateString('ru-RU')}
                </p>
              </button>
              <Button variant="outline" size="sm" onClick={() => onOpen(t.id)}>Открыть</Button>
              <button
                type="button"
                aria-label="Удалить"
                className="text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  if (!window.confirm(`Удалить шаблон «${t.title}»?`)) return;
                  await deleteTemplate(t.id).unwrap().catch(() => undefined);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConstructorPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <AuthGuard>
      <div className="academy-theme min-h-screen">
        {openId ? (
          <div className="p-4">
            <SceneEditor templateId={openId} onBack={() => setOpenId(null)} />
          </div>
        ) : (
          <TemplateList onOpen={setOpenId} />
        )}
      </div>
    </AuthGuard>
  );
}
