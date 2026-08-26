'use client';

import { AuthGuard } from '@/components/auth/auth-guard';
import { OrdersList } from '@/components/orders/OrdersList';

export default function OrdersPage() {
  return (
    <AuthGuard>
      <OrdersList />
    </AuthGuard>
  );
}
