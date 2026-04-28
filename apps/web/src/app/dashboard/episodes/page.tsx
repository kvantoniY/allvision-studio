import { Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/dashboard/EmptyState';

export default function EpisodesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Мои эпизоды</h1>
        <p className="mt-1 text-slate-400">Истории с вашими персонажами и сценами.</p>
      </div>

      <Card className="border-slate-800 bg-slate-900">
        <CardContent>
          <EmptyState
            size="lg"
            icon={<Film className="h-full w-full" />}
            title="Эпизоды появятся здесь"
            description="Здесь будут ваши эпизоды — сценарии с вашими персонажами в ваших сценах. Создание эпизодов появится в следующем обновлении."
          />
          <div className="flex justify-center pb-10">
            <Button disabled>Создать эпизод</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
