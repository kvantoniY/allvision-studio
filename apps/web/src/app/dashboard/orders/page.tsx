import { redirect } from 'next/navigation';

// Старый пустой экран заказов заменён рабочим разделом /orders (G6).
export default function LegacyOrdersPage() {
  redirect('/orders');
}
