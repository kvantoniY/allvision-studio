'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Loader2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  type UserMediaKind,
  useSaveProjectToStudioMutation,
} from '@/store/api/user-media-assets-api';
import { cn } from '@/lib/utils';

type SaveToStudioButtonProps = {
  projectId: string;
  defaultTitle?: string;
  className?: string;
};

function errorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось сохранить результат';
}

function splitTags(value: string) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

export function SaveToStudioButton({ projectId, defaultTitle, className }: SaveToStudioButtonProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<UserMediaKind>('user-avatar');
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [save, state] = useSaveProjectToStudioMutation();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save({
        projectId,
        kind,
        title: title.trim() || defaultTitle || 'Результат генерации',
        tags: splitTags(tags),
        description: description.trim() || undefined,
      }).unwrap();
      toast({
        title: 'Сохранено в Студию',
        description: 'Откройте Студию, чтобы использовать результат как референс.',
      });
      setOpen(false);
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <>
      <Button type="button" variant="outline" className={cn('border-slate-700 bg-slate-900', className)} onClick={() => setOpen(true)}>
        <Save className="h-4 w-4" />
        Сохранить в Студию
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <form onSubmit={submit} className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Сохранить в Студию</h2>
                <p className="mt-1 text-sm text-slate-400">Результат будет скопирован в вашу личную библиотеку.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'user-avatar' as const, label: 'Аватар' },
                  { value: 'user-location' as const, label: 'Локация' },
                ].map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    variant={kind === item.value ? 'default' : 'outline'}
                    onClick={() => setKind(item.value)}
                    className={cn(kind === item.value && 'bg-violet-600 hover:bg-violet-500')}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="studio-title">Название</Label>
                <Input id="studio-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, аватар для трендов" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="studio-tags">Теги</Label>
                <Input id="studio-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="портрет, тренд, семья" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="studio-description">Описание</Label>
                <Textarea id="studio-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button asChild variant="outline">
                <Link href="/studio">Открыть Студию</Link>
              </Button>
              <Button type="submit" disabled={state.isLoading} className="bg-violet-600 hover:bg-violet-500">
                {state.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Сохранить
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
