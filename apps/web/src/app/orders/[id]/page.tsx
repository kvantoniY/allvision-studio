'use client';

import { use } from 'react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { OrderDetail } from '@/components/orders/OrderDetail';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <OrderDetail id={id} />
    </AuthGuard>
  );
}
