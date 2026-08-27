'use client';

import { AuthGuard } from '@/components/auth/auth-guard';
import { OrderDetail } from '@/components/orders/OrderDetail';

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  return (
    <AuthGuard>
      <OrderDetail id={params.id} />
    </AuthGuard>
  );
}
