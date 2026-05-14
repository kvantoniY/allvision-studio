import { redirect } from 'next/navigation';

export default function LegacyBillingPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  params.set('tab', 'billing');
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === 'tab' || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else {
      params.set(key, value);
    }
  }
  redirect(`/profile?${params.toString()}`);
}
