'use client';

import { ImageIcon, Plus, Search, Video as VideoIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(url);
}
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImageWithSkeleton } from '@/components/ui/image-with-skeleton';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/components/dashboard/labels';
import type { ChatSummary } from '@/store/api/user-chat-api';

type ChatHistoryListProps = {
  items: ChatSummary[];
  selectedId?: string | null;
  isLoading?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function ChatHistoryList({ items, selectedId, isLoading, onSelect, onNew }: ChatHistoryListProps) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.title.toLowerCase().includes(query));
  }, [items, search]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-800 bg-slate-950">
      <div className="space-y-3 border-b border-slate-800 p-4">
        <Button type="button" onClick={onNew} className="w-full bg-violet-600 hover:bg-violet-500">
          <Plus className="h-4 w-4" />
          Новый чат
        </Button>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск"
            className="h-9 bg-slate-900 pl-9"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-md bg-slate-900" />
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-800 p-4 text-sm text-slate-500">
            Чатов пока нет.
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((item) => {
            const selected = item.id === selectedId;
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
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-slate-900">
                  {item.lastResultPreview && !isVideoUrl(item.lastResultPreview) ? (
                    <ImageWithSkeleton
                      wrapperClassName="h-full w-full"
                      src={item.lastResultPreview}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-slate-500">
                      {item.lastResultPreview && isVideoUrl(item.lastResultPreview) ? (
                        <VideoIcon className="h-5 w-5" />
                      ) : (
                        <ImageIcon className="h-5 w-5" />
                      )}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-medium text-slate-100">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.updatedAt)}</div>
                  <div className="mt-2 text-xs text-slate-500">{item.messageCount} сообщений</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
