'use client';

import Link from 'next/link';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { SupportConversation } from '@/components/support/SupportConversation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  useAddAdminSupportMessageMutation,
  useGetAdminSupportTicketQuery,
  useResolveAdminSupportTicketMutation,
} from '@/store/api/admin-support-api';

function appendFiles(formData: FormData, files: File[]) {
  files.slice(0, 5).forEach((file) => formData.append('files', file));
}

export default function AdminSupportTicketPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const ticket = useGetAdminSupportTicketQuery(params.id, { pollingInterval: 10000 });
  const [addMessage, addState] = useAddAdminSupportMessageMutation();
  const [resolveTicket, resolveState] = useResolveAdminSupportTicketMutation();

  const onSend = async (body: string, files: File[]) => {
    const formData = new FormData();
    formData.set('body', body);
    appendFiles(formData, files);
    try {
      await addMessage({ id: params.id, body: formData }).unwrap();
      toast({ title: 'Ответ отправлен' });
    } catch (error) {
      toast({
        title: 'Не удалось отправить ответ',
        description: (error as { data?: { error?: { message?: string } } })?.data?.error?.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const onResolve = async () => {
    try {
      await resolveTicket(params.id).unwrap();
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
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/admin/support" className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Назад к тикетам
          </Link>
          <div className="mt-4 flex items-center gap-2 text-sm text-violet-300">
            <LifeBuoy className="h-4 w-4" />
            Поддержка
          </div>
          <h1 className="mt-2 text-3xl font-bold text-white">Диалог по тикету</h1>
        </div>
        {ticket.data?.ticket.userId && (
          <Button asChild variant="outline">
            <Link href={`/admin/users/${ticket.data.ticket.userId}`}>Профиль пользователя</Link>
          </Button>
        )}
      </div>

      {ticket.isLoading ? (
        <Skeleton className="h-[620px] rounded-md" />
      ) : (
        <SupportConversation
          ticket={ticket.data?.ticket ?? null}
          currentUserId={user?.id}
          adminView
          onSend={onSend}
          onResolve={onResolve}
          sending={addState.isLoading}
          resolving={resolveState.isLoading}
        />
      )}
    </div>
  );
}
