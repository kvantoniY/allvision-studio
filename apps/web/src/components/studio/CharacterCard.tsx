'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import type { Character } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  CHARACTER_STATUS_CLASS,
  CHARACTER_STATUS_LABEL,
  CHARACTER_TYPE_LABEL,
  CharacterTypeIcon,
} from './v3-labels';

type CharacterCardProps = {
  character: Character;
  onDelete: (character: Character) => void;
};

export function CharacterCard({ character, onDelete }: CharacterCardProps) {
  const image = character.referenceImages[character.primaryImageId] ?? character.referenceImages[0];

  return (
    <Card className="overflow-hidden border-slate-800 bg-slate-900">
      <CardContent className="p-0">
        <div className="aspect-[4/3] bg-slate-800">
          {image ? (
            <img src={image} alt={character.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-slate-500">
              <CharacterTypeIcon type={character.type} className="h-10 w-10" />
            </div>
          )}
        </div>
        <div className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-white">{character.name}</h3>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                <CharacterTypeIcon type={character.type} className="h-4 w-4" />
                {CHARACTER_TYPE_LABEL[character.type]}
              </div>
            </div>
            <Badge className={CHARACTER_STATUS_CLASS[character.status]}>
              {CHARACTER_STATUS_LABEL[character.status]}
            </Badge>
          </div>

          <div className="text-sm text-slate-400">Использован в {character.episodesCount} эпизодах</div>

          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link href={`/dashboard/characters/${character.id}`}>Редактировать</Link>
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => onDelete(character)}>
              Удалить
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
