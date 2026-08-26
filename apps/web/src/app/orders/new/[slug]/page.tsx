'use client';

import { use } from 'react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { NewOrderPage } from '@/components/orders/NewOrderPage';

export default function CreateOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <AuthGuard>
      <NewOrderPage slug={slug} />
    </AuthGuard>
  );
}
