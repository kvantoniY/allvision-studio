/*
 * CLI-скрипт для восстановления зависших платежей на проде.
 *
 * Запуск:
 *   docker exec -it allvision-api node /app/apps/api/dist/scripts/payment-recover.js <command> [args]
 *
 * Команды:
 *   list                                  — последние 20 PENDING платежей
 *   show <id|invId>                       — показать платёж + историю webhook
 *   probe <invId>                         — сходить в OpStateExt Robokassa, распечатать raw статус
 *   recheck <id|invId>                    — reconcile через провайдера (применит ответ Робокассы)
 *   confirm <id|invId>                    — подтвердить вручную, начислить токены (используйте, когда деньги точно пришли в Робокассу)
 *   fail <id|invId>                       — пометить FAILED (для платежей, по которым деньги НЕ пришли)
 *
 * Все команды требуют DATABASE_URL и Robokassa env-vars из shared/.env.
 */

import '../config/env';
import { prisma } from '@allvision/database';
import {
  findPaymentByIdOrProviderId,
  manualConfirmPayment,
  manualMarkPaymentFailed,
  reconcilePaymentWithProvider,
} from '../services/payment-service';
import { getPaymentProvider } from '../services/payment-provider';

async function commandList() {
  const items = await prisma.payment.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { user: { select: { email: true } } },
  });
  if (items.length === 0) {
    console.log('Нет PENDING платежей.');
    return;
  }
  console.log(`Найдено PENDING: ${items.length}\n`);
  for (const p of items) {
    const ageMin = Math.round((Date.now() - p.createdAt.getTime()) / 60000);
    console.log(
      `  id=${p.id} invId=${p.providerPaymentId ?? '—'} ` +
        `${(p.amountRub / 100).toFixed(2)}₽ tokens=${p.tokensAdded ?? '—'} ` +
        `user=${p.user.email} created=${p.createdAt.toISOString()} (${ageMin} мин назад)`,
    );
  }
}

async function commandShow(idOrInvId: string) {
  const payment = await findPaymentByIdOrProviderId(idOrInvId);
  if (!payment) {
    console.error(`Платёж ${idOrInvId} не найден`);
    process.exitCode = 1;
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: payment.userId },
    select: { email: true, tokenBalance: true },
  });
  const tokenTx = await prisma.tokenTransaction.findFirst({
    where: { refId: payment.id, reason: 'topup' },
  });

  console.log(JSON.stringify({
    payment: {
      id: payment.id,
      providerPaymentId: payment.providerPaymentId,
      status: payment.status,
      provider: payment.provider,
      purpose: payment.purpose,
      amountRub: payment.amountRub,
      tokensAdded: payment.tokensAdded,
      createdAt: payment.createdAt,
      paidAt: payment.paidAt,
    },
    user,
    tokenTransaction: tokenTx,
    metadata: payment.metadata,
  }, null, 2));
}

async function commandProbe(invId: string) {
  console.log(`Запрашиваю OpStateExt для invId=${invId}...`);
  const provider = getPaymentProvider();
  const startedAt = Date.now();
  try {
    const status = await provider.getPaymentProviderStatus(invId);
    console.log(`OK: providerStatus=${status} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    console.error(`FAIL: ${(error as Error).message} (${Date.now() - startedAt}ms)`);
    process.exitCode = 1;
  }
}

async function commandRecheck(idOrInvId: string) {
  const payment = await findPaymentByIdOrProviderId(idOrInvId);
  if (!payment) {
    console.error(`Платёж ${idOrInvId} не найден`);
    process.exitCode = 1;
    return;
  }
  console.log(`Reconcile paymentId=${payment.id} (status=${payment.status})...`);
  const reconciled = await reconcilePaymentWithProvider(payment, { bypassCache: true, allowRevive: true });
  console.log(`Новый статус: ${reconciled.status} tokens=${reconciled.tokensAdded ?? '—'}`);
}

async function commandConfirm(idOrInvId: string) {
  const payment = await findPaymentByIdOrProviderId(idOrInvId);
  if (!payment) {
    console.error(`Платёж ${idOrInvId} не найден`);
    process.exitCode = 1;
    return;
  }
  if (payment.status === 'SUCCEEDED') {
    console.log(`Платёж уже SUCCEEDED. Ничего не делаю.`);
    return;
  }
  console.log(`MANUAL CONFIRM paymentId=${payment.id} (was ${payment.status}) → SUCCEEDED, начисляю ${payment.tokensAdded ?? 0} токенов`);
  const updated = await manualConfirmPayment(payment.id, 'cli');
  console.log(`Готово: status=${updated.status} paidAt=${updated.paidAt?.toISOString() ?? '—'}`);
}

async function commandFail(idOrInvId: string) {
  const payment = await findPaymentByIdOrProviderId(idOrInvId);
  if (!payment) {
    console.error(`Платёж ${idOrInvId} не найден`);
    process.exitCode = 1;
    return;
  }
  if (payment.status === 'SUCCEEDED') {
    console.error(`Платёж уже SUCCEEDED — отменить нельзя`);
    process.exitCode = 1;
    return;
  }
  console.log(`MANUAL FAIL paymentId=${payment.id} (was ${payment.status}) → FAILED`);
  const updated = await manualMarkPaymentFailed(payment.id, 'cli');
  console.log(`Готово: status=${updated.status}`);
}

async function main() {
  const [, , command, arg] = process.argv;

  if (!command) {
    console.error('Использование: payment-recover <list|show|probe|recheck|confirm|fail> [id|invId]');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'list':
        await commandList();
        break;
      case 'show':
        if (!arg) throw new Error('show требует <id|invId>');
        await commandShow(arg);
        break;
      case 'probe':
        if (!arg) throw new Error('probe требует <invId>');
        await commandProbe(arg);
        break;
      case 'recheck':
        if (!arg) throw new Error('recheck требует <id|invId>');
        await commandRecheck(arg);
        break;
      case 'confirm':
        if (!arg) throw new Error('confirm требует <id|invId>');
        await commandConfirm(arg);
        break;
      case 'fail':
        if (!arg) throw new Error('fail требует <id|invId>');
        await commandFail(arg);
        break;
      default:
        console.error(`Неизвестная команда: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Ошибка: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
