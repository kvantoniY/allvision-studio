'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Coins, ImagePlus, Loader2, LogIn, RefreshCw, UploadCloud, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useCreateProjectMutation } from '@/store/api/projects-api';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ProjectUploaderProps {
  serviceSlug: 'photo-restore' | 'photo-animate';
  tokensCost: number;
  ctaLabel: string;
  loginRedirect: string;
}

function errorCode(error: unknown): string | undefined {
  const data = (error as { data?: { error?: { code?: string } } })?.data;
  return data?.error?.code;
}

export function humanProjectError(error: unknown): string {
  switch (errorCode(error)) {
    case 'INSUFFICIENT_TOKENS':
      return 'Недостаточно токенов, пополните баланс';
    case 'FILE_TOO_LARGE':
      return 'Файл слишком большой (макс. 25 MB)';
    case 'UNSUPPORTED_FORMAT':
      return 'Формат не поддерживается. JPEG, PNG или WebP';
    case 'QUEUE_UNAVAILABLE':
      return 'Сервис временно недоступен, попробуйте через минуту. Токены возвращены';
    default:
      return 'Что-то пошло не так. Попробуйте ещё раз';
  }
}

function loginLabel(serviceSlug: ProjectUploaderProps['serviceSlug']) {
  return serviceSlug === 'photo-animate' ? 'Войти и оживить' : 'Войти и улучшить';
}

function lowBalanceDescription(serviceSlug: ProjectUploaderProps['serviceSlug']) {
  return serviceSlug === 'photo-animate'
    ? 'Пополните баланс, чтобы запустить оживление фото.'
    : 'Пополните баланс, чтобы запустить улучшение фото.';
}

export function ProjectUploader({
  serviceSlug,
  tokensCost,
  ctaLabel,
  loginRedirect,
}: ProjectUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const { user, isLoading } = useAuth();
  const [createProject, { isLoading: isCreating }] = useCreateProjectMutation();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (nextFile.size > MAX_FILE_SIZE) {
      toast({ title: 'Файл слишком большой (макс. 25 MB)', variant: 'destructive' });
      return;
    }
    if (!ALLOWED_TYPES.has(nextFile.type)) {
      toast({ title: 'Формат не поддерживается. JPEG, PNG или WebP', variant: 'destructive' });
      return;
    }
    setFile(nextFile);
  };

  const submit = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('serviceSlug', serviceSlug);
    formData.append('image', file);

    try {
      const result = await createProject(formData).unwrap();
      router.push(`/dashboard/projects/${result.project.id}`);
    } catch (error) {
      toast({ title: humanProjectError(error), variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-400">
        Проверяем баланс...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
        <Button asChild size="lg" className="bg-amber-500 text-slate-950 hover:bg-amber-400">
          <Link href={`/login?redirect=${loginRedirect}`}>
            <LogIn className="h-4 w-4" />
            {loginLabel(serviceSlug)}
          </Link>
        </Button>
      </div>
    );
  }

  if (user.tokenBalance < tokensCost) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Wallet className="mt-1 h-5 w-5 text-amber-300" />
            <div>
              <div className="font-semibold text-amber-100">
                Не хватает токенов: ваш баланс {user.tokenBalance}, нужно {tokensCost}
              </div>
              <p className="mt-1 text-sm text-amber-100/70">{lowBalanceDescription(serviceSlug)}</p>
            </div>
          </div>
          <Button asChild className="shrink-0 bg-amber-500 text-slate-950 hover:bg-amber-400">
            <Link href="/pricing">Пополнить</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          pickFile(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />

      {!file ? (
        <button
          type="button"
          className={cn(
            'flex min-h-64 w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/50 p-6 text-center transition hover:border-violet-400 hover:bg-slate-900',
            isDragging && 'border-violet-400 bg-violet-500/10',
          )}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            pickFile(event.dataTransfer.files?.[0]);
          }}
        >
          <UploadCloud className="h-10 w-10 text-violet-300" />
          <span className="mt-4 text-lg font-semibold">Перетащите фото сюда или нажмите для выбора</span>
          <span className="mt-2 text-sm text-slate-400">Один файл JPEG, PNG или WebP, максимум 25 MB</span>
        </button>
      ) : (
        <div className="grid gap-5 md:grid-cols-[220px_1fr] md:items-center">
          <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
            {previewUrl ? (
              <Image src={previewUrl} alt={file.name} fill className="object-cover" unoptimized />
            ) : (
              <div className="grid h-full place-items-center text-slate-600">
                <ImagePlus className="h-10 w-10" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{file.name}</div>
            <div className="mt-1 text-sm text-slate-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={isCreating}
              >
                <RefreshCw className="h-4 w-4" />
                Заменить
              </Button>
              <Button
                type="button"
                className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                onClick={submit}
                disabled={!file || isCreating}
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                {ctaLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
