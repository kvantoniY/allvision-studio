'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, Check, CheckCircle2, Loader2, Pencil, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Шапка профиля: аватар, имя и почта одним блоком.
 *
 * Раньше на это уходил целый экран: две крупные кнопки под аватаром, отдельные поля имени
 * и почты, отдельная строка с датой. Всё это — одно действие раз в полгода, а места
 * занимало как основной инструмент.
 *
 * Теперь аватар меняется наведением, имя правится карандашом на месте, а почта живёт
 * подписью под именем — со значком, если подтверждена, и кнопкой, если нет.
 */
export function ProfileIdentityCard({
  name,
  email,
  avatar,
  initials,
  registeredAt,
  emailVerified,
  busy,
  savingName,
  verifying,
  onUploadAvatar,
  onRemoveAvatar,
  onSaveName,
  onVerifyEmail,
}: {
  name: string;
  email: string;
  avatar: string | null;
  initials: string;
  registeredAt: string;
  emailVerified: boolean;
  busy: boolean;
  savingName: boolean;
  verifying: boolean;
  onUploadAvatar: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAvatar: () => void;
  onSaveName: (value: string) => void;
  onVerifyEmail: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  const commit = () => {
    const value = draft.trim();
    setEditing(false);
    if (value.length >= 2 && value !== name) onSaveName(value);
    else setDraft(name);
  };

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/50 p-5 sm:flex-row sm:items-center sm:p-6">
      {/* Аватар меняется наведением: отдельная кнопка «Загрузить фото» тут была крупнее
          самого аватара. Крестик появляется только когда есть что удалять. */}
      <div className="group relative shrink-0">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Заменить аватар"
          className="relative block h-24 w-24 overflow-hidden rounded-full"
        >
          <Avatar className="h-24 w-24">
            {avatar && <AvatarImage src={avatar} alt={name || email} />}
            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
          </Avatar>
          <span className="absolute inset-0 grid place-items-center rounded-full bg-slate-950/70 opacity-0 transition group-hover:opacity-100">
            {busy ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
          </span>
        </button>

        {avatar && (
          <button
            type="button"
            onClick={onRemoveAvatar}
            disabled={busy}
            aria-label="Убрать аватар"
            className="absolute -right-1 -top-1 hidden h-6 w-6 place-items-center rounded-full border border-slate-700 bg-slate-950 text-slate-400 transition hover:border-rose-400/60 hover:text-rose-300 group-hover:grid"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <input ref={fileRef} className="sr-only" type="file" accept="image/*" onChange={onUploadAvatar} />
      </div>

      <div className="min-w-0 flex-1 text-center sm:text-left">
        {editing ? (
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <Input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit();
                if (event.key === 'Escape') {
                  setDraft(name);
                  setEditing(false);
                }
              }}
              className="h-9 max-w-[220px] border-slate-700 bg-slate-900 text-base font-semibold"
            />
            <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={commit} disabled={savingName}>
              {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group/name inline-flex items-center gap-2 text-xl font-bold text-white sm:text-2xl"
          >
            {name || 'Без имени'}
            <Pencil className="h-4 w-4 text-slate-500 transition group-hover/name:text-violet-300" />
          </button>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <span className="truncate text-sm text-slate-400">{email}</span>
          {emailVerified ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              подтверждён
            </span>
          ) : (
            <button
              type="button"
              onClick={onVerifyEmail}
              disabled={verifying}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/10 px-2.5 py-0.5',
                'text-[11px] font-semibold text-amber-200 transition hover:bg-amber-400 hover:text-slate-950',
              )}
            >
              {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Подтвердить
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-slate-500">С нами с {registeredAt}</p>
      </div>
    </div>
  );
}
