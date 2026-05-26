/*
 * CLI-скрипт для восстановления зависших платежей на проде.
 *
 * Запуск:
 *   docker exec -it allvision-api node /app/apps/api/dist/scripts/payment-recover.js <command> [args]
 *
 * Команды:
 *   list                                       — последние 20 PENDING платежей
 *   show <id|invId>                            — показать платёж + историю webhook
 *   probe <invId>                              — сходить в OpStateExt Robokassa, распечатать raw статус
 *   recheck <id|invId>                         — reconcile через провайдера (применит ответ Робокассы)
 *   confirm <id|invId>                         — подтвердить вручную, начислить токены (используйте, когда деньги точно пришли в Робокассу)
 *   fail <id|invId>                            — пометить FAILED (для платежей, по которым деньги НЕ пришли)
 *   diag-signature '<url-encoded-body>'        — перебрать пароли/форматы OutSum для битой подписи
 *   confirm-bulk <invId1> <invId2> ...         — подтвердить несколько платежей за раз
 *
 * Все команды требуют DATABASE_URL и Robokassa env-vars из shared/.env.
 */

import '../config/env';
import crypto from 'node:crypto';
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

async function commandConfirmBulk(invIds: string[]) {
  if (invIds.length === 0) {
    console.error('confirm-bulk требует хотя бы один InvId');
    process.exitCode = 1;
    return;
  }
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const invId of invIds) {
    try {
      const payment = await findPaymentByIdOrProviderId(invId);
      if (!payment) {
        console.warn(`  ${invId}: НЕ НАЙДЕН`);
        fail += 1;
        continue;
      }
      if (payment.status === 'SUCCEEDED') {
        console.log(`  ${invId}: уже SUCCEEDED`);
        skip += 1;
        continue;
      }
      const updated = await manualConfirmPayment(payment.id, 'cli-bulk');
      console.log(`  ${invId}: ${payment.status} → ${updated.status} (+${payment.tokensAdded ?? 0} токенов)`);
      ok += 1;
    } catch (error) {
      console.error(`  ${invId}: ОШИБКА: ${(error as Error).message}`);
      fail += 1;
    }
  }
  console.log(`\nИтого: confirmed=${ok}, skipped=${skip}, failed=${fail}`);
}

function parseUrlEncodedBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

function md5Hex(value: string) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

function sha1Hex(value: string) {
  return crypto.createHash('sha1').update(value, 'utf8').digest('hex');
}

function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

async function commandDiagSignature(body: string) {
  const payload = parseUrlEncodedBody(body);
  const outSum = payload.OutSum ?? payload.out_summ;
  const invId = payload.InvId ?? payload.inv_id;
  const received = (payload.SignatureValue ?? payload.crc ?? '').toLowerCase();

  if (!outSum || !invId || !received) {
    console.error('Не нашёл OutSum/InvId/SignatureValue в теле. Пример формата:');
    console.error('  payment-recover diag-signature "OutSum=99.000000&InvId=180699419&SignatureValue=XXXX&Shp_paymentId=YYY&Shp_purpose=topup"');
    process.exitCode = 1;
    return;
  }

  const shp = Object.entries(payload)
    .filter(([k]) => k.startsWith('Shp_'))
    .sort(([a], [b]) => a.localeCompare(b));

  console.log(`Анализ подписи для InvId=${invId}, OutSum=${outSum}`);
  console.log(`Received signature: ${received}`);
  console.log(`Shp_ params: ${shp.map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}\n`);

  const passwords: Array<{ label: string; value: string }> = [
    { label: 'PASSWORD2', value: process.env.ROBOKASSA_PASSWORD2 ?? '' },
    { label: 'PASSWORD1', value: process.env.ROBOKASSA_PASSWORD1 ?? '' },
    { label: 'PASSWORD3', value: process.env.ROBOKASSA_PASSWORD3 ?? '' },
  ].filter((p) => p.value);

  const outSumNum = Number(String(outSum).replace(',', '.'));
  const outSumFormats = new Set<string>([
    outSum,
    String(outSum).replace(',', '.'),
  ]);
  if (Number.isFinite(outSumNum)) {
    outSumFormats.add(outSumNum.toFixed(2));
    outSumFormats.add(outSumNum.toFixed(4));
    outSumFormats.add(outSumNum.toFixed(6));
    outSumFormats.add(String(outSumNum));
  }

  const hashes: Array<{ label: string; fn: (s: string) => string }> = [
    { label: 'md5', fn: md5Hex },
    { label: 'sha1', fn: sha1Hex },
    { label: 'sha256', fn: sha256Hex },
  ];

  let matches = 0;

  for (const pwd of passwords) {
    for (const outSumFmt of outSumFormats) {
      for (const hashAlg of hashes) {
        // Вариант 1: со Shp_ полями
        const withShp = [outSumFmt, invId, pwd.value, ...shp.map(([k, v]) => `${k}=${v}`)].join(':');
        const sigWithShp = hashAlg.fn(withShp).toLowerCase();
        if (sigWithShp === received) {
          console.log(`✅ MATCH: password=${pwd.label} outSum="${outSumFmt}" algo=${hashAlg.label} (with Shp_)`);
          matches += 1;
        }

        // Вариант 2: без Shp_ полей (на случай нестандарта)
        const withoutShp = [outSumFmt, invId, pwd.value].join(':');
        const sigWithoutShp = hashAlg.fn(withoutShp).toLowerCase();
        if (sigWithoutShp === received) {
          console.log(`✅ MATCH: password=${pwd.label} outSum="${outSumFmt}" algo=${hashAlg.label} (WITHOUT Shp_)`);
          matches += 1;
        }
      }
    }
  }

  if (matches === 0) {
    console.log('❌ Ни одна комбинация не дала совпадение.');
    console.log('   Возможно, в Robokassa установлен новый Пароль#2, а в env остался старый.');
    console.log('   Либо для метода оплаты (SBP/Card/etc.) Robokassa использует особую схему.');
    console.log('\nЗайдите в Robokassa → сгенерируйте новый Пароль#2 → обновите ROBOKASSA_PASSWORD2 в shared/.env → перезапустите контейнер api.');
  } else {
    console.log(`\nНайдено совпадений: ${matches}.`);
  }
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
  const [, , command, ...rest] = process.argv;
  const arg = rest[0];

  if (!command) {
    console.error('Использование: payment-recover <list|show|probe|recheck|confirm|confirm-bulk|fail|diag-signature> [args]');
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
      case 'confirm-bulk':
        await commandConfirmBulk(rest);
        break;
      case 'fail':
        if (!arg) throw new Error('fail требует <id|invId>');
        await commandFail(arg);
        break;
      case 'diag-signature':
        if (!arg) throw new Error('diag-signature требует "<url-encoded-body>" в кавычках');
        await commandDiagSignature(arg);
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
