import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

function messageRoot(): string {
  return path.resolve(process.cwd(), process.env.ACADEMY_MESSAGES_DIR ?? './private-uploads/academy-messages');
}

function payoutRoot(): string {
  return path.resolve(process.cwd(), process.env.PAYOUT_PROOFS_DIR ?? './private-uploads/payout-proofs');
}

function resolveSafe(root: string, storageKey: string): string {
  const target = path.resolve(root, storageKey.replace(/^[/\\]+/, ''));
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error(`INVALID_ACADEMY_PRIVATE_KEY: ${storageKey}`);
  }
  return target;
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'jpg';
}

async function save(root: string, storageKey: string, buffer: Buffer): Promise<string> {
  const target = resolveSafe(root, storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
  return storageKey;
}

export async function saveThreadAttachment(params: {
  parentId: string;
  childId: string;
  threadId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  return save(messageRoot(), path.posix.join(
    params.parentId,
    params.childId,
    params.threadId,
    `${crypto.randomUUID()}.${extensionFor(params.mimeType)}`,
  ), params.buffer);
}

export async function readThreadAttachment(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveSafe(messageRoot(), storageKey));
}

export async function savePayoutProof(params: {
  payoutId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  return save(payoutRoot(), path.posix.join(
    params.payoutId,
    `${crypto.randomUUID()}.${extensionFor(params.mimeType)}`,
  ), params.buffer);
}

export async function readPayoutProof(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveSafe(payoutRoot(), storageKey));
}
