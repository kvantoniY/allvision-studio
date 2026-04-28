import type { OrderStatus, OrderType, ProjectStatus } from '@allvision/shared';

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PENDING: 'В очереди',
  PROCESSING: 'В обработке',
  COMPLETED: 'Готово',
  FAILED: 'Ошибка',
};

export const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  PENDING: 'bg-slate-700 text-slate-200',
  PROCESSING: 'bg-amber-500/20 text-amber-300',
  COMPLETED: 'bg-emerald-500/20 text-emerald-300',
  FAILED: 'bg-red-500/20 text-red-300',
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: 'Новый',
  NEGOTIATING: 'Согласование',
  PRICE_SET: 'Цена назначена',
  PAID: 'Оплачен',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
};

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  NEW: 'bg-sky-500/20 text-sky-300',
  NEGOTIATING: 'bg-yellow-500/20 text-yellow-300',
  PRICE_SET: 'bg-orange-500/20 text-orange-300',
  PAID: 'bg-violet-500/20 text-violet-300',
  IN_PROGRESS: 'bg-amber-500/20 text-amber-300',
  REVIEW: 'bg-cyan-500/20 text-cyan-300',
  COMPLETED: 'bg-emerald-500/20 text-emerald-300',
  CANCELLED: 'bg-slate-600 text-slate-300',
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  CARTOON: 'Мультфильм',
  REALISTIC: 'Реалистичное видео',
  FAIRY_TALE: 'Видео-сказка',
};

export const TRANSACTION_REASON_LABEL: Record<string, string> = {
  welcome_bonus: 'Приветственный бонус 🎁',
  topup: 'Пополнение баланса',
  project_created: 'Создание проекта',
  character_slot: 'Создание персонажа',
  refund: 'Возврат средств',
  admin_credit: 'Начисление от администратора',
  admin_debit: 'Списание администратором',
  order_payment: 'Оплата заказа',
};

export function transactionDescription(reason: string): string {
  return TRANSACTION_REASON_LABEL[reason] ?? reason;
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
