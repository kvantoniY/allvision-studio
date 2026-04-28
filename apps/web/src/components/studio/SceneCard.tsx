'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import type { Scene } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SCENE_CATEGORY_LABEL } from './v3-labels';

type SceneCardProps = {
  scene: Scene;
  onDelete: (scene: Scene) => void;
};

export function SceneCard({ scene, onDelete }: SceneCardProps) {
  const image = scene.referenceImages[0];

  return (
    <Card className="overflow-hidden border-slate-800 bg-slate-900">
      <CardContent className="p-0">
        <div className="aspect-[4/3] bg-slate-800">
          {image ? <img src={image} alt={scene.name} className="h-full w-full object-cover" /> : null}
        </div>
        <div className="space-y-4 p-4">
          <div>
            <h3 className="truncate font-semibold text-white">{scene.name}</h3>
            {scene.category && (
              <div className="mt-1 text-sm text-violet-300">{SCENE_CATEGORY_LABEL[scene.category] ?? scene.category}</div>
            )}
          </div>
          <p className="line-clamp-3 min-h-16 text-sm leading-5 text-slate-400">{scene.description}</p>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link href={`/dashboard/scenes/${scene.id}`}>Редактировать</Link>
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => onDelete(scene)}>
              Удалить
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
