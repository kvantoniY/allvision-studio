'use client';

import { useCallback, useEffect, useState } from 'react';
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
  const chatQuery = useGetChatQuery(activeChatId ?? '', {
    skip: !activeChatId,
    pollingInterval: 5000,
  });

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
    if (!window.confirm('Удалить этот чат? Результаты проектов останутся в Студии.')) return;
    await deleteChat(activeChatId).unwrap();
    setActiveChatId(null);
    void chats.refetch();
  };

  const activeTitle = chatQuery.data?.chat.title ?? 'Allvision AI';
  const messages = chatQuery.data?.messages ?? [];

  return (
    <div className="grid h-[calc(100vh-56px)] min-h-[560px] overflow-hidden bg-slate-950 md:h-screen md:grid-cols-[300px_minmax(0,1fr)]">
      <div className="hidden min-h-0 md:block">
        <ChatHistoryList
          items={chats.data?.items ?? []}
          selectedId={activeChatId}
          isLoading={chats.isLoading}
          onSelect={setActiveChatId}
          onNew={newChat}
        />
      </div>

      <section className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={chatListOpen} onOpenChange={setChatListOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="md:hidden" aria-label="Открыть список чатов">
                  <PanelLeft className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetHeader className="border-b border-slate-800 p-4">
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
            <MessageSquare className="hidden h-5 w-5 shrink-0 text-violet-300 sm:block" />
            <button type="button" onClick={rename} className="min-w-0 truncate text-left text-lg font-semibold text-white">
              {activeTitle}
            </button>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" className="hidden border-slate-700 bg-slate-900 sm:inline-flex" onClick={rename}>
              Переименовать
            </Button>
            <Button type="button" variant="outline" size="icon" className="border-slate-700 bg-slate-900" onClick={remove} aria-label="Удалить чат">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-8">
          <ChatResultView
            messages={messages}
            isLoading={chatQuery.isLoading && !!activeChatId}
            onUseAsReference={useAsReference}
            onRetry={(message: ChatMessage) => setRetryPrompt(message.prompt)}
          />
        </div>

        {activeChatId && (
          <div className="sticky bottom-0 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur lg:px-8">
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
