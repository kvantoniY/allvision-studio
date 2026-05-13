'use client';

import { ImageIcon, Plus, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_COLOR, PROJECT_STATUS_LABEL, formatDateTime } from '@/components/dashboard/labels';
import type { ChatHistoryItem } from '@/store/api/user-chat-api';

type ChatHistoryListProps = {
  items: ChatHistoryItem[];
  selectedId?: string | null;
  isLoading?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function ChatHistoryList({ items, selectedId, isLoading, onSelect, onNew }: ChatHistoryListProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 p-4">
        <Button type="button" onClick={onNew} className="w-full bg-violet-600 hover:bg-violet-500">
          <Plus className="h-4 w-4" />
          Новый чат
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-md bg-slate-900" />
            ))}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-800 p-4 text-sm text-slate-500">
            История пока пустая. Первый запрос появится здесь после запуска генерации.
          </div>
        )}

        <div className="space-y-2">
          {items.map((item) => {
            const selected = item.id === selectedId;
            const Icon = item.category === 'video' ? Video : ImageIcon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  'flex w-full gap-3 rounded-md border p-3 text-left transition',
                  selected
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800',
                )}
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-950">
                  {item.outputPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.outputPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-slate-500">
                      <Icon className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-medium text-slate-100">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.createdAt)}</div>
                  <Badge className={cn('mt-2 rounded-md text-[10px]', PROJECT_STATUS_COLOR[item.status])}>
                    {PROJECT_STATUS_LABEL[item.status]}
                  </Badge>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
