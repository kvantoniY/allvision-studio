'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, LifeBuoy, MessageSquarePlus, Paperclip } from 'lucide-react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { SupportConversation } from '@/components/support/SupportConversation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  type SupportTicket,
  type SupportTicketStatus,
  useAddSupportMessageMutation,
  useCreateSupportTicketMutation,
  useGetSupportTicketQuery,
  useListSupportTicketsQuery,
  useResolveSupportTicketMutation,
} from '@/store/api/support-api';
import { cn } from '@/lib/utils';

type Filter = 'all' | SupportTicketStatus;

function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: SupportTicketStatus) {
  return status === 'RESOLVED' ? 'Выполнен' : 'Открыт';
}

function latestText(ticket: SupportTicket) {
  const message = ticket.messages[0];
  if (!message) return 'Сообщений пока нет';
  if (message.body) return message.body;
  return `${message.attachments.length} файл(ов)`;
}

function appendFiles(formData: FormData, files: File[]) {
  files.slice(0, 5).forEach((file) => formData.append('files', file));
}

export default function SupportPage() {
  return (
    <AuthGuard>
      <div className="container py-6 md:py-8">
        <SupportContent />
      </div>
    </AuthGuard>
  );
}

function SupportContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tickets = useListSupportTicketsQuery(
    { page: 1, limit: 40, status: filter === 'all' ? undefined : filter },
    { pollingInterval: 15000 },
  );
  const selectedTicket = useGetSupportTicketQuery(selectedId!, {
    skip: !selectedId,
    pollingInterval: 10000,
  });
  const [createTicket, createState] = useCreateSupportTicketMutation();
  const [addMessage, addState] = useAddSupportMessageMutation();
  const [resolveTicket, resolveState] = useResolveSupportTicketMutation();
  const items = useMemo(() => tickets.data?.items ?? [], [tickets.data?.items]);

  useEffect(() => {
    if (!selectedId && items[0]) {
      setSelectedId(items[0].id);
    }
    if (selectedId && items.length > 0 && !items.some((ticket) => ticket.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  const ticket = selectedTicket.data?.ticket ?? items.find((item) => item.id === selectedId) ?? null;

  const onCreate = async (formData: FormData) => {
    try {
      const result = await createTicket(formData).unwrap();
      setSelectedId(result.ticket.id);
      toast({ title: 'Тикет создан' });
    } catch (error) {
      toast({
        title: 'Не удалось создать тикет',
        description: (error as { data?: { error?: { message?: string } } })?.data?.error?.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const onSend = async (body: string, files: File[]) => {
    if (!selectedId) return;
    const formData = new FormData();
    formData.set('body', body);
    appendFiles(formData, files);
    try {
      await addMessage({ id: selectedId, body: formData }).unwrap();
      toast({ title: 'Сообщение отправлено' });
    } catch (error) {
      toast({
        title: 'Не удалось отправить сообщение',
        description: (error as { data?: { error?: { message?: string } } })?.data?.error?.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const onResolve = async () => {
    if (!selectedId) return;
    try {
      await resolveTicket(selectedId).unwrap();
      toast({ title: 'Тикет завершён' });
    } catch (error) {
      toast({
        title: 'Не удалось завершить тикет',
        description: (error as { data?: { error?: { message?: string } } })?.data?.error?.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-violet-300">
            <LifeBuoy className="h-4 w-4" />
            Поддержка
          </div>
          <h1 className="mt-2 text-3xl font-bold text-white">Техническая поддержка</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Создайте тикет, приложите скриншоты или файлы и продолжайте переписку с администратором.
          </p>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <NewTicketForm loading={createState.isLoading} onCreate={onCreate} />

          <div className="rounded-md border border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="font-semibold text-white">Ваши тикеты</div>
              <div className="flex gap-1">
                {(['all', 'OPEN', 'RESOLVED'] as Filter[]).map((item) => (
                  <Button
                    key={item}
                    size="sm"
                    variant={filter === item ? 'default' : 'outline'}
                    className={cn(filter === item && 'bg-violet-600 hover:bg-violet-500')}
                    onClick={() => {
                      setFilter(item);
                      setSelectedId(null);
                    }}
                  >
                    {item === 'all' ? 'Все' : item === 'OPEN' ? 'Открытые' : 'Готовые'}
                  </Button>
                ))}
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto p-2">
              {tickets.isLoading && <Skeleton className="h-24" />}
              {!tickets.isLoading && items.length === 0 && (
                <div className="p-6 text-center text-sm text-slate-500">Тикетов пока нет</div>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'mb-2 block w-full rounded-md border p-3 text-left transition',
                    selectedId === item.id
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-slate-800 bg-slate-950/70 hover:border-slate-600',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{item.subject}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-400">{latestText(item)}</div>
                    </div>
                    <span className={cn('shrink-0 rounded-md px-2 py-1 text-xs', item.status === 'OPEN' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300')}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{formatDate(item.updatedAt)}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <SupportConversation
          ticket={ticket}
          currentUserId={user?.id}
          onSend={onSend}
          onResolve={onResolve}
          sending={addState.isLoading}
          resolving={resolveState.isLoading}
        />
      </div>
    </div>
  );
}

function NewTicketForm({
  loading,
  onCreate,
}: {
  loading?: boolean;
  onCreate: (formData: FormData) => Promise<void>;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canSubmit = subject.trim().length >= 3 && (!!body.trim() || files.length > 0) && !loading;
  const fileLabel = useMemo(() => files.map((file) => file.name).join(', '), [files]);

  const submit = async () => {
    if (!canSubmit) return;
    const formData = new FormData();
    formData.set('subject', subject.trim());
    formData.set('body', body.trim());
    appendFiles(formData, files);
    try {
      await onCreate(formData);
      setSubject('');
      setBody('');
      setFiles([]);
      setFileInputKey((value) => value + 1);
    } catch {
      // Parent shows the error toast.
    }
  };

  return (
    <section className="rounded-md border border-violet-500/25 bg-violet-500/10 p-4">
      <div className="flex items-center gap-2 font-semibold text-white">
        <MessageSquarePlus className="h-4 w-4 text-violet-300" />
        Новый тикет
      </div>
      <div className="mt-4 space-y-3">
        <Input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Тема обращения"
          className="border-slate-700 bg-slate-950"
        />
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Опишите проблему"
          className="min-h-[112px] resize-none border-slate-700 bg-slate-950"
        />
        <input
          key={fileInputKey}
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip"
          className="hidden"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="mr-2 h-4 w-4" />
              Прикрепить
            </Button>
            {fileLabel && <div className="mt-2 truncate text-xs text-slate-400">{fileLabel}</div>}
          </div>
          <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {loading ? 'Создаём...' : 'Создать'}
          </Button>
        </div>
      </div>
    </section>
  );
}
