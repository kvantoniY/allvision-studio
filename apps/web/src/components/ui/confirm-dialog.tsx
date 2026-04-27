'use client';

import { Button } from '@/components/ui/button';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = 'Удалить',
  cancelText = 'Отмена',
  busy,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelText}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={busy}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
