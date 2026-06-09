'use client';

import { useState, type FormEvent, type MouseEvent } from 'react';
import { Flag, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useReportProjectMutation } from '@/store/api/projects-api';
import { cn } from '@/lib/utils';

const REPORT_REASONS = [
  { value: 'Плохой результат', label: 'Плохой результат' },
  { value: 'Не похоже на исходник', label: 'Не похоже на исходник' },
  { value: 'Небезопасный или неуместный контент', label: 'Небезопасный контент' },
  { value: 'Другое', label: 'Другое' },
];

type ReportGenerationButtonProps = {
  projectId: string;
  className?: string;
  label?: string;
};

function errorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось отправить жалобу';
}

export function ReportGenerationButton({ projectId, className, label = 'Пожаловаться' }: ReportGenerationButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0].value);
  const [message, setMessage] = useState('');
  const [reportProject, reportState] = useReportProjectMutation();

  const openModal = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setOpen(true);
  };

  const closeModal = () => {
    if (!reportState.isLoading) setOpen(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await reportProject({ id: projectId, reason, message: message.trim() || undefined }).unwrap();
      toast({ title: 'Жалоба отправлена' });
      setMessage('');
      setOpen(false);
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn('border-slate-700 bg-slate-900', className)}
        onClick={openModal}
      >
        <Flag className="h-4 w-4" />
        {label}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <form
            onSubmit={submit}
            className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Жалоба на генерацию</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">Администратор увидит обращение в поддержке.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="text-slate-400 hover:text-white" onClick={closeModal} aria-label="Закрыть">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor={`generation-report-reason-${projectId}`}>
              Причина
            </label>
            <select
              id={`generation-report-reason-${projectId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none transition focus:border-amber-400"
            >
              {REPORT_REASONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>

            <label className="mt-4 block text-sm font-medium text-slate-200" htmlFor={`generation-report-message-${projectId}`}>
              Комментарий
            </label>
            <Textarea
              id={`generation-report-message-${projectId}`}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Что именно пошло не так?"
              className="mt-2 border-slate-700 bg-slate-950 text-white"
            />

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="border-slate-700 bg-slate-950" onClick={closeModal}>
                Отмена
              </Button>
              <Button type="submit" disabled={reportState.isLoading} className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                {reportState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                Отправить
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
