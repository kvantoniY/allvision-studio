'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeleteProjectMutation } from '@/store/api/projects-api';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type DeleteGenerationButtonProps = {
  projectId: string;
  title?: string;
  className?: string;
  onDeleted?: () => void;
};

export function DeleteGenerationButton({ projectId, title, className, onDeleted }: DeleteGenerationButtonProps) {
  const [deleteProject, state] = useDeleteProjectMutation();

  const remove = async () => {
    const name = title ? ` "${title}"` : '';
    if (!window.confirm(`Удалить генерацию${name}? Файл результата и история будут удалены полностью.`)) return;
    try {
      await deleteProject(projectId).unwrap();
      toast({ title: 'Генерация удалена' });
      onDeleted?.();
    } catch {
      toast({ title: 'Не удалось удалить генерацию', variant: 'destructive' });
    }
  };

  return (
    <Button
      type="button"
      variant="destructive"
      className={cn('border-red-500/60 bg-red-950 text-red-100 hover:bg-red-900', className)}
      disabled={state.isLoading}
      onClick={() => void remove()}
    >
      {state.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      Удалить
    </Button>
  );
}
