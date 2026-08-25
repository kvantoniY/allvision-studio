'use client';

import { Loader2, Mail, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  useDeleteAdminWaitlistLeadMutation,
  useListAdminWaitlistQuery,
  type AdminWaitlistLead,
} from '@/store/api/admin-waitlist-api';

const TOPIC_LABELS: Record<string, string> = {
  albums: 'Альбомы и печать',
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LeadRow({ lead, onDelete, busy }: { lead: AdminWaitlistLead; onDelete: () => void; busy: boolean }) {
  return (
    <tr className="border-t border-zinc-800 align-top">
      <td className="px-4 py-3 text-slate-400">{formatDate(lead.createdAt)}</td>
      <td className="px-4 py-3">
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-slate-300">
          {TOPIC_LABELS[lead.topic] ?? lead.topic}
        </span>
      </td>
      <td className="px-4 py-3">
        <a href={`mailto:${lead.email}`} className="font-medium text-violet-300 hover:underline">
          {lead.email}
        </a>
        {lead.name && <div className="text-xs text-slate-500">{lead.name}</div>}
        {lead.userId && <div className="text-xs text-slate-600">есть аккаунт</div>}
      </td>
      <td className="max-w-md px-4 py-3 text-slate-300">{lead.comment ?? '—'}</td>
      <td className="px-4 py-3 text-right">
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={busy} aria-label="Удалить заявку">
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

export default function AdminLeadsPage() {
  const { data, isLoading } = useListAdminWaitlistQuery({ limit: 200 });
  const [deleteLead, deleteState] = useDeleteAdminWaitlistLeadMutation();

  const leads = data?.items ?? [];

  const onDelete = async (id: string) => {
    try {
      await deleteLead(id).unwrap();
      toast({ title: 'Заявка удалена' });
    } catch {
      toast({ title: 'Не удалось удалить заявку', variant: 'destructive' });
    }
  };

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold">Заявки на будущие разделы</h1>
        <p className="mt-2 text-sm text-slate-400">
          Кто оставил почту на заглушках витрины. Пишите этим людям первыми, когда раздел заработает.
        </p>
      </div>

      {isLoading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем заявки...
        </div>
      ) : leads.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/50 p-8 text-center text-sm text-slate-400">
          <Mail className="mx-auto h-5 w-5 text-slate-600" />
          <p className="mt-3">Заявок пока нет.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 text-sm text-slate-400">Всего заявок: {data?.total ?? leads.length}</div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3">Раздел</th>
                  <th className="px-4 py-3">Контакт</th>
                  <th className="px-4 py-3">Комментарий</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    busy={deleteState.isLoading}
                    onDelete={() => onDelete(lead.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
