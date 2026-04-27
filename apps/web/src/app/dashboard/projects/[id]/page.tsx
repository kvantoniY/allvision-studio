import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ProjectPageContent } from './ProjectPageContent';
import type { ProjectDetails } from '@/store/api/projects-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type ProjectPageProps = {
  params: { id: string };
};

async function getInitialProject(id: string): Promise<ProjectDetails | null> {
  const res = await fetch(`${API_URL}/api/projects/${id}`, {
    headers: { cookie: cookies().toString() },
    cache: 'no-store',
  });

  if (res.status === 404) {
    const body = await res.json().catch(() => null);
    if (body?.error?.code === 'PROJECT_NOT_FOUND') notFound();
  }

  if (!res.ok) return null;
  return res.json();
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const initialProject = await getInitialProject(params.id);
  return <ProjectPageContent id={params.id} initialProject={initialProject} />;
}
