import Link from 'next/link';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { TokenTransaction } from '@allvision/shared';
import { cn } from '@/lib/utils';
import { formatDateTime, transactionDescription } from './labels';

export function TransactionRow({ tx }: { tx: TokenTransaction }) {
  const isTopup = tx.amount > 0;
  const projectReasons = new Set(['project_created', 'service_launch', 'free_chat', 'library_generation']);
  return (
    <tr className="border-b border-slate-800">
      <td className="py-3 px-3 text-sm text-slate-400 whitespace-nowrap">{formatDateTime(tx.createdAt)}</td>
      <td className="py-3 px-3">
        <span
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-full',
            isTopup ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
          )}
        >
          {isTopup ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
        </span>
      </td>
      <td className="py-3 px-3 text-sm">
        <div>{transactionDescription(tx.reason)}</div>
        {tx.refId && projectReasons.has(tx.reason) && (
          <Link
            href={`/dashboard/projects/${tx.refId}`}
            className="text-xs text-violet-400 hover:underline"
          >
            → см. проект
          </Link>
        )}
      </td>
      <td
        className={cn(
          'py-3 px-3 text-sm font-semibold whitespace-nowrap',
          isTopup ? 'text-emerald-400' : 'text-red-400',
        )}
      >
        {isTopup ? '+' : ''}
        {tx.amount} токен.
      </td>
      <td className="py-3 px-3 text-sm text-slate-400 whitespace-nowrap">{tx.balanceAfter}</td>
    </tr>
  );
}
