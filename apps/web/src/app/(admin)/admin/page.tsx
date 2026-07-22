import { redirect } from 'next/navigation';
import { getServerMe } from '@/lib/auth';

export default async function AdminIndexPage() {
  const me = await getServerMe();
  if (me?.role === 'METHODIST') redirect('/admin/curriculum');
  redirect('/admin/services');
}
