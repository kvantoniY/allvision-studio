'use client';

/* eslint-disable @next/next/no-img-element -- private attachments require the browser auth cookie. */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, ImagePlus, Loader2, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { markThreadSeen } from '@/hooks/use-academy-badges';
import { cn } from '@/lib/utils';
import {
  useListThreadMessagesQuery,
  useListThreadsQuery,
  useSendThreadMessageMutation,
} from '@/store/api/academy-operations-api';

function errorMessage(error: unknown): string {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось отправить сообщение';
}

export default function MessagesPage() {
  const { user } = useAuth();
  const threadsQuery = useListThreadsQuery(undefined, { pollingInterval: 10_000 });
  const threads = useMemo(() => threadsQuery.data?.threads ?? [], [threadsQuery.data?.threads]);
  const [threadId, setThreadId] = useState('');
  const messagesQuery = useListThreadMessagesQuery(threadId, { skip: !threadId, pollingInterval: 5_000 });
  const [sendMessage, sendState] = useSendThreadMessageMutation();
  const [body, setBody] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!threadId && threads[0]) setThreadId(threads[0].id);
    if (threadId && threads.length > 0 && !threads.some((thread) => thread.id === threadId)) setThreadId(threads[0].id);
  }, [threadId, threads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messagesQuery.currentData?.messages.length]);

  // Открытый диалог считается прочитанным — бейдж в навигации гаснет.
  // ВАЖНО: currentData, а не data. RTK Query держит в `data` результат ПРЕДЫДУЩЕГО
  // аргумента, пока грузится новый, поэтому при переключении диалога на экране
  // на мгновение показывались чужие сообщения — отсюда ощущение «переписки смешиваются».
  const shownMessages = messagesQuery.currentData?.messages;
  useEffect(() => {
    const last = shownMessages?.[shownMessages.length - 1];
    if (threadId && last) markThreadSeen(threadId, last.createdAt);
  }, [threadId, shownMessages]);

  const active = threads.find((thread) => thread.id === threadId);
  const submit = async () => {
    if (!threadId || (!body.trim() && !image)) return;
    const form = new FormData();
    if (body.trim()) form.append('body', body.trim());
    if (image) form.append('image', image);
    try {
      await sendMessage({ threadId, form }).unwrap();
      setBody('');
      setImage(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (error) {
      toast({ title: 'Сообщение не отправлено', description: errorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <AuthGuard>
      <div className="academy-theme min-h-screen px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"><MessageCircle className="h-3.5 w-3.5" /> Сообщения Academy</div>
            <h1 className="text-3xl font-bold">Родитель и преподаватель</h1>
            <p className="mt-2 text-muted-foreground">Диалог создаётся автоматически при записи на первое занятие. Администратор может подключиться для помощи.</p>
          </div>
          <div className="grid min-h-[650px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:grid-cols-[300px_1fr]">
            <aside className="border-b border-border bg-muted/30 p-3 md:border-b-0 md:border-r">
              {threadsQuery.isLoading ? <Loader2 className="m-4 h-5 w-5 animate-spin" /> : threads.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Диалог появится после записи на занятие.</p>
              ) : threads.map((thread) => (
                <button key={thread.id} type="button" onClick={() => setThreadId(thread.id)} className={cn('mb-2 w-full rounded-xl p-3 text-left transition', thread.id === threadId ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>
                  <p className="font-semibold">{thread.childName}</p>
                  <p className={cn('mt-0.5 text-xs', thread.id === threadId ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{user?.role === 'TEACHER' ? thread.parentName : thread.teacherName}</p>
                  <p className={cn('mt-2 truncate text-xs', thread.id === threadId ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{thread.lastMessage?.body ?? (thread.lastMessage?.attachment ? 'Изображение' : 'Новый диалог')}</p>
                </button>
              ))}
            </aside>
            <section className="flex min-h-0 flex-col">
              {active ? (
                <>
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
                    <div className="min-w-0">
                      <p className="font-bold">{active.childName}</p>
                      <p className="text-xs text-muted-foreground">{active.parentName} · {active.teacherName}</p>
                    </div>
                    {/* Родитель может открыть профиль преподавателя прямо из переписки. */}
                    {user?.role !== 'TEACHER' && active.teacherId && (
                      <Link
                        href={`/teachers/${active.teacherId}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-accent"
                      >
                        <GraduationCap className="h-3.5 w-3.5" /> Профиль преподавателя
                      </Link>
                    )}
                  </header>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                    {!shownMessages ? <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin" /> : shownMessages.map((message) => {
                      const mine = message.role === (user?.role === 'TEACHER' ? 'TEACHER' : user?.role === 'ADMIN' ? 'ADMIN' : 'PARENT');
                      if (message.role === 'SYSTEM') return <div key={message.id} className="mx-auto max-w-md rounded-full bg-muted px-4 py-2 text-center text-xs text-muted-foreground">{message.body}</div>;
                      return (
                        <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                          <div className={cn('max-w-[82%] rounded-2xl px-4 py-3 text-sm', mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
                            <p className={cn('mb-1 text-[11px] font-semibold', mine ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{message.authorName}{message.role === 'ADMIN' && <ShieldCheck className="ml-1 inline h-3 w-3" />}</p>
                            {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
                            {message.attachment && <img src={message.attachment.fileUrl} alt={message.attachment.fileName} className="mt-2 max-h-72 rounded-xl object-contain" />}
                            <p className={cn('mt-1 text-right text-[10px]', mine ? 'text-primary-foreground/60' : 'text-muted-foreground')}>{new Date(message.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                  <div className="border-t border-border p-4">
                    {image && <p className="mb-2 text-xs text-muted-foreground">Изображение: {image.name}</p>}
                    <div className="flex items-end gap-2">
                      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
                      <Button type="button" size="icon" variant="outline" aria-label="Прикрепить изображение" onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" /></Button>
                      <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Напишите сообщение…" className="min-h-10 flex-1 resize-none" maxLength={2000} />
                      <Button type="button" size="icon" disabled={sendState.isLoading || (!body.trim() && !image)} aria-label="Отправить" onClick={() => void submit()}>{sendState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Не отправляйте личные контакты ребёнка. Изображения хранятся в закрытом хранилище.</p>
                  </div>
                </>
              ) : <Card className="m-auto border-0 shadow-none"><CardContent className="p-8 text-center text-muted-foreground">Выберите диалог слева.</CardContent></Card>}
            </section>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
