'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGetAdminUsageQuery, useGetPiAPIAccountQuery } from '@/store/api/admin-usage-api';

function usd(value: number) {
  return `$${value.toFixed(4)}`;
}

function statusClass(status: string) {
  if (status === 'success') return 'bg-emerald-600';
  if (status === 'timeout') return 'bg-amber-600';
  return 'bg-red-700';
}

export default function AdminUsagePage() {
  const [filters, setFilters] = useState({ provider: '', blockSlug: '', model: '', status: '' });
  const usage = useGetAdminUsageQuery({
    provider: filters.provider || undefined,
    blockSlug: filters.blockSlug || undefined,
    model: filters.model || undefined,
    status: filters.status || undefined,
  });
  const account = useGetPiAPIAccountQuery();
  const maxSpend = Math.max(0.01, ...(usage.data?.byDay.map((day) => day.totalCostUsd) ?? [0.01]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Usage analytics</h1>
          <p className="mt-2 text-sm text-slate-400">PiAPI spend, request health, recent provider failures, and model-level trends.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { usage.refetch(); account.refetch(); }}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        {account.data ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-slate-400">PiAPI balance</div>
              <div className={account.data.lowBalance ? 'text-2xl font-bold text-red-300' : 'text-2xl font-bold text-emerald-300'}>
                ${account.data.balanceUsd.toFixed(2)}
              </div>
            </div>
            <div className="text-sm text-slate-500">Last checked {new Date(account.data.lastChecked).toLocaleString()}</div>
          </div>
        ) : (
          <div className="text-sm text-amber-200">PiAPI balance unavailable: {account.error ? 'check API env or provider access' : 'loading...'}</div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Metric label="Total calls" value={String(usage.data?.summary.totalRequests ?? 0)} />
        <Metric label="Success" value={String(usage.data?.summary.successCount ?? 0)} />
        <Metric label="Failed" value={String(usage.data?.summary.failedCount ?? 0)} />
        <Metric label="Timeouts" value={String(usage.data?.summary.timeoutCount ?? 0)} />
        <Metric label="Spend" value={usd(usage.data?.summary.totalCostUsd ?? 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-semibold text-white">Spend by day</h2>
          <div className="mt-5 flex h-48 items-end gap-3">
            {(usage.data?.byDay ?? []).map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t bg-rose-500"
                  style={{ height: `${Math.max(4, (day.totalCostUsd / maxSpend) * 160)}px` }}
                  title={`${day.date}: ${usd(day.totalCostUsd)}`}
                />
                <div className="text-[10px] text-slate-500">{day.date.slice(5)}</div>
              </div>
            ))}
            {(usage.data?.byDay.length ?? 0) === 0 && <div className="text-sm text-slate-500">No usage in this period</div>}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-semibold text-white">By model</h2>
          <div className="mt-4 space-y-3">
            {(usage.data?.byModel ?? []).map((item) => (
              <div key={item.model} className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-white">{item.model}</span>
                  <span className="text-slate-400">{usd(item.totalCostUsd)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{item.requestCount} calls · avg {Math.round(item.avgDurationMs / 1000)}s</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <div className="grid gap-4 md:grid-cols-4">
          {(['provider', 'blockSlug', 'model', 'status'] as const).map((key) => (
            <div key={key} className="space-y-2">
              <Label>{key}</Label>
              <Input value={filters[key]} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))} />
            </div>
          ))}
        </div>
      </section>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950 text-slate-400">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Service</th>
              <th className="p-3">Block/model</th>
              <th className="p-3">Status</th>
              <th className="p-3">Cost</th>
              <th className="p-3">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {(usage.data?.logs ?? []).map((log) => (
              <tr key={log.id} className="bg-zinc-900/60">
                <td className="p-3 text-slate-300">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="p-3">
                  <div className="text-white">{log.project?.service?.title ?? log.project?.title ?? 'n/a'}</div>
                  <div className="text-xs text-slate-500">{log.userId ?? 'no user'}</div>
                </td>
                <td className="p-3 text-slate-300">
                  <div>{log.blockSlug}</div>
                  <div className="text-xs text-slate-500">{log.model}</div>
                </td>
                <td className="p-3"><Badge className={statusClass(log.status)}>{log.status}</Badge></td>
                <td className="p-3 text-slate-300">{usd(log.costUsd)} · {Math.round(log.durationMs / 1000)}s</td>
                <td className="p-3">
                  {log.errorCode ? (
                    <details>
                      <summary className="cursor-pointer text-rose-300">{log.errorCode}</summary>
                      <p className="mt-2 max-w-md text-xs text-slate-400">{log.errorMessage}</p>
                    </details>
                  ) : (
                    <span className="text-slate-600">none</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}
