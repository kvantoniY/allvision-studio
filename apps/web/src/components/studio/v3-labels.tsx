import { Cat, Dog, Film, Image as ImageIcon, Users, UserRound } from 'lucide-react';
import type { CharacterStatus, CharacterType } from '@allvision/shared';

export const CHARACTER_TYPE_LABEL: Record<CharacterType, string> = {
  HUMAN: 'Человек',
  PET: 'Питомец',
  GROUP: 'Группа',
  MASCOT: 'Маскот',
};

export const CHARACTER_STATUS_LABEL: Record<CharacterStatus, string> = {
  DRAFT: 'Черновик',
  PROCESSING: 'Проверка',
  READY: 'Готов',
  REJECTED: 'Отклонён',
  PAYMENT_PENDING: 'Ожидает оплату',
};

export const CHARACTER_STATUS_CLASS: Record<CharacterStatus, string> = {
  DRAFT: 'bg-slate-700 text-slate-100',
  PROCESSING: 'bg-sky-600 text-white',
  READY: 'bg-emerald-600 text-white',
  REJECTED: 'bg-red-600 text-white',
  PAYMENT_PENDING: 'bg-amber-500 text-slate-950',
};

export const SCENE_CATEGORY_LABEL: Record<string, string> = {
  home: 'Дом',
  outdoor: 'Улица',
  studio: 'Студия',
};

export const TEMPLATE_CATEGORY_LABEL: Record<string, string> = {
  wedding: 'Свадьба',
  birthday: 'День рождения',
  newyear: 'Новый год',
  family: 'Семья',
  memorial: 'Память',
  kids: 'Детям',
  holiday: 'Праздник',
  pets: 'Питомцы',
  marketing: 'Маркетинг',
};

export const templateCategories = Object.entries(TEMPLATE_CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

export function CharacterTypeIcon({ type, className }: { type: CharacterType; className?: string }) {
  if (type === 'HUMAN') return <UserRound className={className} />;
  if (type === 'PET') return <Dog className={className} />;
  if (type === 'GROUP') return <Users className={className} />;
  return <Cat className={className} />;
}

export function StudioMetricIcon({ kind, className }: { kind: 'characters' | 'scenes' | 'episodes'; className?: string }) {
  if (kind === 'characters') return <Users className={className} />;
  if (kind === 'scenes') return <ImageIcon className={className} />;
  return <Film className={className} />;
}
