'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileText, ImageIcon, Paperclip, SendHorizontal } from 'lucide-react';
import type { SupportAttachment, SupportTicket } from '@/store/api/support-api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function attachmentIcon(attachment: SupportAttachment) {
  if (attachment.kind === 'IMAGE') return <ImageIcon className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function AttachmentPreview({ attachment }: { attachment: SupportAttachment }) {
  if (attachment.kind === 'IMAGE') {
    return (
      <a href={attachment.publicUrl} target="_blank" rel="noreferrer" className="group block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.publicUrl}
          alt={attachment.fileName}
          className="h-36 w-full max-w-xs rounded-md border border-slate-700 object-cover transition group-hover:border-violet-400"
        />
        <div className="mt-1 truncate text-xs text-slate-400">{attachment.fileName}</div>
      </a>
    );
  }

  return (
    <a
      href={attachment.publicUrl}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-center gap-2 rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-violet-400 hover:text-white"
    >
      {attachmentIcon(attachment)}
      <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
      <span className="shrink-0 text-xs text-slate-500">{formatBytes(attachment.fileSize)}</span>
    </a>
  );
}

export function SupportConversation({
  ticket,
  currentUserId,
  onSend,
  onResolve,
  sending,
  resolving,
  adminView,
}: {
  ticket: SupportTicket | null;
  currentUserId?: string;
  onSend: (body: string, files: File[]) => Promise<void>;
  onResolve: () => Promise<void>;
  sending?: boolean;
  resolving?: boolean;
  adminView?: boolean;
}) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isResolved = ticket?.status === 'RESOLVED';
  const canSend = !!ticket && !isResolved && (!!body.trim() || files.length > 0) && !sending;
  const fileSummary = useMemo(() => files.map((file) => `${file.name} (${formatBytes(file.size)})`).join(', '), [files]);

  const submit = async () => {
    if (!canSend) return;
    try {
      await onSend(body.trim(), files);
      setBody('');
      setFiles([]);
      setFileInputKey((value) => value + 1);
    } catch {
      // Parent surfaces the error with a toast.
    }
  };

  if (!ticket) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-md border border-slate-800 bg-slate-900/60 p-8 text-center">
        <div>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-slate-800 text-slate-300">
            <Paperclip className="h-5 w-5" />
          </div>
          <div className="mt-4 font-semibold text-white">Выберите тикет</div>
          <div className="mt-2 text-sm text-slate-400">История переписки появится здесь.</div>
        </div>
      </div>
    );
  }

  return (
    <section className="flex min-h-[620px] flex-col rounded-md border border-slate-800 bg-slate-900">
      <header className="border-b border-slate-800 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-white">{ticket.subject}</h2>
              <span
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium',
                  isResolved ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300',
                )}
              >
                {isResolved ? 'Выполнен' : 'Открыт'}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              #{ticket.id.slice(0, 8)} · обновлён {formatDateTime(ticket.updatedAt)}
              {adminView && ` · ${ticket.user.email}`}
            </div>
          </div>
          {!isResolved && (
            <Button type="button" variant="outline" size="sm" disabled={resolving} onClick={() => void onResolve()}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {resolving ? 'Завершаем...' : 'Завершить'}
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {ticket.messages.map((message) => {
          const own = currentUserId ? message.authorId === currentUserId : message.author.role === 'ADMIN';
          const authorLabel = message.author.role === 'ADMIN'
            ? 'Поддержка'
            : message.author.name ?? message.author.email;
          return (
            <article key={message.id} className={cn('flex', own ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[min(620px,100%)]', own ? 'text-right' : 'text-left')}>
                <div className="mb-1 text-xs text-slate-500">
                  {authorLabel} · {formatDateTime(message.createdAt)}
                </div>
                <div
                  className={cn(
                    'rounded-md px-4 py-3 text-sm leading-6 shadow-sm',
                    own ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-100',
                  )}
                >
                  {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                  {message.attachments.length > 0 && (
                    <div className={cn('grid gap-2', message.body && 'mt-3')}>
                      {message.attachments.map((attachment) => (
                        <AttachmentPreview key={attachment.id} attachment={attachment} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="border-t border-slate-800 p-4">
        {isResolved ? (
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Тикет завершён. Для новой проблемы создайте отдельное обращение.
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Напишите ответ..."
              className="min-h-[96px] resize-none border-slate-700 bg-slate-950"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <input
                  key={fileInputKey}
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip"
                  className="hidden"
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="mr-2 h-4 w-4" />
                  Файлы
                </Button>
                {fileSummary && <div className="mt-2 truncate text-xs text-slate-400">{fileSummary}</div>}
              </div>
              <Button type="button" disabled={!canSend} onClick={() => void submit()}>
                <SendHorizontal className="mr-2 h-4 w-4" />
                {sending ? 'Отправляем...' : 'Отправить'}
              </Button>
            </div>
          </div>
        )}
      </footer>
    </section>
  );
}
