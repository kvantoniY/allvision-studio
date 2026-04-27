import Link from 'next/link';
import Image from 'next/image';
import { ImageIcon, Video } from 'lucide-react';
import type { Project } from '@allvision/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_COLOR, PROJECT_STATUS_LABEL, formatDate } from './labels';

export function ProjectCard({ project }: { project: Project }) {
  const previewImage = project.resultThumbnail ?? project.resultImage;
  return (
    <Link href={`/dashboard/projects/${project.id}`} className="group">
      <Card className="bg-slate-900 border-slate-800 transition hover:border-violet-500/50 hover:shadow-[0_0_0_1px_rgba(139,92,246,0.2)]">
        <CardContent className="p-0">
          <div className="aspect-video relative overflow-hidden rounded-t-lg bg-slate-800">
            {previewImage ? (
              <Image
                src={previewImage}
                alt={project.title}
                fill
                className="object-cover transition group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
            ) : project.resultVideo ? (
              <video
                src={project.resultVideo}
                muted
                preload="metadata"
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
            ) : (
              <div className="grid h-full place-items-center text-slate-600">
                {project.tokensCost >= 80 ? <Video className="h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
              </div>
            )}
            <span
              className={cn(
                'absolute top-2 right-2 rounded-md px-2 py-1 text-xs font-medium',
                PROJECT_STATUS_COLOR[project.status],
              )}
            >
              {PROJECT_STATUS_LABEL[project.status]}
            </span>
          </div>
          <div className="p-4">
            <h3 className="font-semibold line-clamp-1">{project.title}</h3>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>{formatDate(project.createdAt)}</span>
              <span>{project.tokensCost} ток.</span>
            </div>
            {project.status === 'PROCESSING' && (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  style={{ width: `${project.progress ?? 0}%` }}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
