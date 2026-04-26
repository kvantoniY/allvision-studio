import path from 'node:path';
import type { PaymentProvider, StorageProvider } from '@allvision/shared';
import { LocalFileStorage } from './local-file-storage';
import { MockPaymentProvider } from './mock-payment-provider';

let storageSingleton: StorageProvider | undefined;
let paymentSingleton: PaymentProvider | undefined;

export function getStorageProvider(): StorageProvider {
  if (storageSingleton) return storageSingleton;

  const provider = process.env.STORAGE_PROVIDER ?? 'local';

  if (provider === 'local') {
    const rootDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR ?? './uploads');
    const publicBaseUrl = `${process.env.PUBLIC_API_URL ?? 'http://localhost:4000'}/static`;
    storageSingleton = new LocalFileStorage({ rootDir, publicBaseUrl });
    return storageSingleton;
  }

  if (provider === 'yandex-s3') {
    throw new Error('STORAGE_PROVIDER yandex-s3 пока не реализован');
  }

  throw new Error(`Unknown storage provider: ${provider}`);
}

export function getPaymentProvider(): PaymentProvider {
  if (paymentSingleton) return paymentSingleton;

  const provider = process.env.PAYMENT_PROVIDER ?? 'mock';
  if (provider === 'mock') {
    paymentSingleton = new MockPaymentProvider();
    return paymentSingleton;
  }

  throw new Error(`Unknown payment provider: ${provider}`);
}

/** Сброс синглтонов — только для тестов. */
export function _resetProvidersForTests() {
  storageSingleton = undefined;
  paymentSingleton = undefined;
}

export { LocalFileStorage } from './local-file-storage';
export { MockPaymentProvider } from './mock-payment-provider';
