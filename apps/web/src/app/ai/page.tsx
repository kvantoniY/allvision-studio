'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquare, PanelLeft, Trash2 } from 'lucide-react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { ChatForm } from '@/components/ai/ChatForm';
import { ChatHistoryList } from '@/components/ai/ChatHistoryList';
import { ChatResultView } from '@/components/ai/ChatResultView';
import type { SelectedInputSource } from '@/components/ai/InputSourcePicker';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  type ChatMessage,
  useCreateChatMutation,
  useDeleteChatMutation,
  useGetChatQuery,
  useListChatsQuery,
  useRenameChatMutation,
} from '@/store/api/user-chat-api';

export default function AllvisionAiPage() {
  return (
    <AuthGuard>
      <AiContent />
    </AuthGuard>
  );
}

function AiContent() {
  const chats = useListChatsQuery({ limit: 50, offset: 0 });
  const [createChat, createChatState] = useCreateChatMutation();
  const [renameChat] = useRenameChatMutation();
  const [deleteChat] = useDeleteChatMutation();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatListOpen, setChatListOpen] = useState(false);
  const [reference, setReference] = useState<SelectedInputSource | null>(null);
  const [retryPrompt, setRetryPrompt] = useState<string | undefined>();
  // Поллим часто (2с), пока в чате есть незавершённая генерация, иначе редкий heartbeat (8с),
  // чтобы готовый результат появлялся быстро, но не грузить API в простое.
  const [chatGenerating, setChatGenerating] = useState(false);
  const chatQuery = useGetChatQuery(activeChatId ?? '', {
    skip: !activeChatId,
    pollingInterval: chatGenerating ? 2000 : 8000,
  });

  useEffect(() => {
    const active = (chatQuery.data?.messages ?? []).some((message) => {
      const status = message.project?.status;
      return status === 'PENDING' || status === 'PROCESSING';
    });
    setChatGenerating((current) => (current === active ? current : active));
  }, [chatQuery.data]);

  useEffect(() => {
    if (activeChatId || chats.isLoading || createChatState.isLoading) return;
    const first = chats.data?.items[0];
    if (first) {
      setActiveChatId(first.id);
      return;
    }
    if (chats.data && chats.data.items.length === 0) {
      createChat({ title: 'Новый чат' })
        .unwrap()
        .then((result) => {
          setActiveChatId(result.chat.id);
          void chats.refetch();
        })
        .catch(() => undefined);
    }
  }, [activeChatId, chats, createChat, createChatState.isLoading]);

  const newChat = useCallback(async () => {
    const result = await createChat({ title: 'Новый чат' }).unwrap();
    setActiveChatId(result.chat.id);
    setChatListOpen(false);
    void chats.refetch();
  }, [chats, createChat]);

  const useAsReference = useCallback((projectId: string, url: string, mediaKind: 'image' | 'video') => {
    setReference({
      ref: `result:${projectId}`,
      url,
      title: 'Результат предыдущего сообщения',
      mediaKind,
      origin: 'result',
    });
  }, []);

  // Переиспользовать прикреплённый ранее референс: наш публичный /static URL — прямой вход.
  const reuseReference = useCallback((url: string, mediaKind: 'image' | 'video') => {
    setReference({ ref: url, url, title: 'Референс из истории', mediaKind, origin: 'result' });
  }, []);

  const rename = async () => {
    const current = chatQuery.data?.chat;
    if (!current || !activeChatId) return;
    const title = window.prompt('Название чата', current.title);
    if (!title?.trim()) return;
    await renameChat({ id: activeChatId, title: title.trim() }).unwrap();
    void chats.refetch();
    void chatQuery.refetch();
  };

  const remove = async () => {
    if (!activeChatId) return;
    if (!window.confirm('Удалить этот чат? Созданные материалы останутся в Нейролаборатории.')) return;
    await deleteChat(activeChatId).unwrap();
    setActiveChatId(null);
    void chats.refetch();
  };

  const activeTitle = chatQuery.data?.chat.title ?? 'Нейролаборатория';
  const messages = chatQuery.data?.messages ?? [];

  // Как в мессенджере: при открытии чата и при появлении нового сообщения прокручиваем ленту вниз
  // (к последним генерациям). Частый поллинг статуса не двигает скролл — длина сообщений не меняется,
  // поэтому не мешаем пользователю листать историю вверх.
  const threadRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeChatId, messages.length]);

  return (
    <div className="grid h-[calc(100dvh-56px)] min-h-0 overflow-hidden bg-background md:h-dvh md:grid-cols-[300px_minmax(0,1fr)]">
      <div className="hidden min-h-0 md:block">
        <ChatHistoryList
          items={chats.data?.items ?? []}
          selectedId={activeChatId}
          isLoading={chats.isLoading}
          onSelect={setActiveChatId}
          onNew={newChat}
        />
      </div>

      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={chatListOpen} onOpenChange={setChatListOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="md:hidden" aria-label="Открыть список чатов">
                  <PanelLeft className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="academy-theme w-80 bg-card p-0 text-foreground">
                <SheetHeader className="border-b border-border p-4">
                  <SheetTitle>Чаты</SheetTitle>
                </SheetHeader>
                <ChatHistoryList
                  items={chats.data?.items ?? []}
                  selectedId={activeChatId}
                  isLoading={chats.isLoading}
                  onSelect={(id) => {
                    setActiveChatId(id);
                    setChatListOpen(false);
                  }}
                  onNew={newChat}
                />
              </SheetContent>
            </Sheet>
            <MessageSquare className="hidden h-5 w-5 shrink-0 text-primary sm:block" />
            <button type="button" onClick={rename} className="min-w-0 truncate text-left text-lg font-semibold text-foreground">
              {activeTitle}
            </button>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" className="hidden border-border bg-card sm:inline-flex" onClick={rename}>
              Переименовать
            </Button>
            <Button type="button" variant="outline" size="icon" className="border-border bg-card" onClick={remove} aria-label="Удалить чат">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 [scrollbar-gutter:stable_both-edges] lg:px-8">
          <div className="mx-auto w-full max-w-3xl">
            <ChatResultView
              messages={messages}
              isLoading={chatQuery.isLoading && !!activeChatId}
              onUseAsReference={useAsReference}
              onReuseReference={reuseReference}
              onRetry={(message: ChatMessage) => setRetryPrompt(message.prompt)}
              onDeleted={() => {
                void chatQuery.refetch();
                void chats.refetch();
              }}
            />
          </div>
        </div>

        {activeChatId && (
          <div className="sticky bottom-0 border-t border-border bg-card px-4 py-3 backdrop-blur lg:px-8">
            <ChatForm
              chatId={activeChatId}
              initialReference={reference}
              initialPrompt={retryPrompt}
              onReferenceConsumed={() => setReference(null)}
              onPromptConsumed={() => setRetryPrompt(undefined)}
              onCreated={() => {
                void chatQuery.refetch();
                void chats.refetch();
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
