'use client';

import { useCallback, useState } from 'react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { ChatForm } from '@/components/ai/ChatForm';
import { ChatHistoryList } from '@/components/ai/ChatHistoryList';
import { ChatResultView } from '@/components/ai/ChatResultView';
import type { SelectedInputSource } from '@/components/ai/InputSourcePicker';
import { useGetChatHistoryQuery } from '@/store/api/user-chat-api';

export default function AllvisionAiPage() {
  return (
    <AuthGuard>
      <div className="flex min-h-[calc(100vh-64px)]">
        <DashboardSidebar />
        <main className="min-w-0 flex-1 bg-slate-950">
          <AiContent />
        </main>
      </div>
    </AuthGuard>
  );
}

function AiContent() {
  const history = useGetChatHistoryQuery({ limit: 50, offset: 0 }, { pollingInterval: 5000 });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [reference, setReference] = useState<SelectedInputSource | null>(null);

  const useAsReference = useCallback((url: string) => {
    setReference({
      ref: url,
      url,
      title: 'Результат предыдущего чата',
      mediaKind: 'image',
      origin: 'result',
    });
  }, []);

  return (
    <div className="grid min-h-[calc(100vh-64px)] lg:grid-cols-[320px_1fr]">
      <ChatHistoryList
        items={history.data?.items ?? []}
        selectedId={selectedProjectId}
        isLoading={history.isLoading}
        onSelect={setSelectedProjectId}
        onNew={() => setSelectedProjectId(null)}
      />

      <section className="flex min-w-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <ChatResultView projectId={selectedProjectId} onUseAsReference={useAsReference} />
        </div>
        <div className="sticky bottom-0 border-t border-slate-800 bg-slate-950/95 p-4 backdrop-blur lg:p-6">
          <ChatForm
            initialReference={reference}
            onReferenceConsumed={() => setReference(null)}
            onCreated={(projectId) => {
              setSelectedProjectId(projectId);
              void history.refetch();
            }}
          />
        </div>
      </section>
    </div>
  );
}
