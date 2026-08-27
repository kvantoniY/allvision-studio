'use client';

import { AuthGuard } from '@/components/auth/auth-guard';
import { NewOrderPage } from '@/components/orders/NewOrderPage';

export default function CreateOrderPage({ params }: { params: { slug: string } }) {
  return (
    <AuthGuard>
      <NewOrderPage slug={params.slug} />
    </AuthGuard>
  );
}
