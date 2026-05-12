'use client';

import Link from 'next/link';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useGetAdminDiagnosticsStateQuery,
  useRefreshPiAPIBalanceMutation,
  useReloadServicesCatalogMutation,
} from '@/store/api/admin-diagnostics-api';

function seconds(value: number | null | undefined) {
  if (value === null || value === undefined) return 'n/a';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function money(value: number | null | undefined) {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : 'n/a';
}

export default function AdminDiagnosticsPage() {
  const state = useGetAdminDiagnosticsStateQuery();
  const [refreshBalance, refreshState] = useRefreshPiAPIBalanceMutation();
  const [reloadCatalog, reloadState] = useReloadServicesCatalogMutation();
  const data = state.data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Diagnostics</h1>
          <p className="mt-2 text-sm text-slate-400">Production state, queues, recent failures, media files, and masked environment.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => state.refetch()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button type="button" variant="outline" disabled={refreshState.isLoading} onClick={() => refreshBalance()}>
            <RefreshCw className="h-4 w-4" />
            Refresh PiAPI balance
          </Button>
          <Button type="button" variant="outline" disabled={reloadState.isLoading} onClick={() => reloadCatalog()}>
            <RotateCcw className="h-4 w-4" />
            Reload services catalog
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Build" value={data?.build.version ?? 'loading'} detail={data?.build.gitSha ?? data?.build.nodeEnv ?? ''} />
        <Metric label="API uptime" value={seconds(data?.uptime.apiSeconds)} />
        <Metric label="Worker uptime" value={seconds(data?.uptime.workerSeconds)} />
        <Metric label="PiAPI balance" value={money(data?.piapiBalance.balanceUsd)} detail={data?.piapiBalance.errorCode ?? data?.piapiBalance.lastChecked ?? ''} tone={data?.piapiBalance.lowBalance ? 'danger' : 'ok'} />
      </div>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">BullMQ queues</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="p-2">Queue</th>
                <th className="p-2">Waiting</th>
                <th className="p-2">Active</th>
                <th className="p-2">Failed</th>
                <th className="p-2">Failed/hour</th>
                <th className="p-2">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(data?.queues ?? []).map((queue) => (
                <tr key={queue.name}>
                  <td className="p-2 text-white">{queue.name}</td>
                  <td className="p-2">{queue.waiting}</td>
                  <td className="p-2">{queue.active}</td>
                  <td className="p-2">{queue.failed}</td>
                  <td className="p-2">{queue.failedLastHour}</td>
                  <td className="p-2">
                    <Badge className={queue.available ? 'bg-emerald-600' : 'bg-red-700'}>{queue.available ? 'ok' : 'unavailable'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-semibold text-white">Recent projects</h2>
          <div className="mt-4 space-y-3">
            {(data?.recentProjects ?? []).map((project) => (
              <Link key={project.id} href={`/admin/projects/${project.id}`} className="block rounded-md border border-zinc-800 bg-zinc-900 p-3 hover:border-rose-400">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-white">{project.title}</span>
                  <Badge className={project.status === 'FAILED' ? 'bg-red-700' : 'bg-zinc-700'}>{project.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500">{project.service?.slug ?? 'no service'} · {new Date(project.createdAt).toLocaleString()}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-semibold text-white">Recent errors</h2>
          <div className="mt-4 space-y-3">
            {(data?.recentErrors ?? []).map((error, index) => (
              <details key={String(error.id ?? index)} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                <summary className="cursor-pointer text-sm text-rose-200">{String(error.errorCode ?? error.status ?? error.source ?? 'error')}</summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-400">{JSON.stringify(error, null, 2)}</pre>
              </details>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">Media assets</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="p-2">Kind</th>
                <th className="p-2">Title</th>
                <th className="p-2">File</th>
                <th className="p-2">Size</th>
                <th className="p-2">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(data?.mediaAssets ?? []).map((asset) => {
                const file = asset.file as { exists?: boolean; size?: number } | undefined;
                return (
                  <tr key={String(asset.id)}>
                    <td className="p-2">{String(asset.kind)}</td>
                    <td className="p-2 text-white">{String(asset.title)}</td>
                    <td className="p-2"><Badge className={file?.exists ? 'bg-emerald-600' : 'bg-red-700'}>{file?.exists ? 'exists' : 'missing'}</Badge></td>
                    <td className="p-2">{file?.size ? `${Math.round(file.size / 1024)} KB` : String(asset.fileSize ?? 'n/a')}</td>
                    <td className="p-2">{String(asset.isActive)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">Environment</h2>
        <div className="mt-4 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(data?.env ?? {}).map(([key, value]) => (
            <div key={key} className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
              <div className="font-medium text-slate-300">{key}</div>
              <div className="mt-1 break-all text-slate-500">{value ?? 'null'}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'ok' | 'danger' }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={tone === 'danger' ? 'mt-2 text-2xl font-bold text-red-300' : tone === 'ok' ? 'mt-2 text-2xl font-bold text-emerald-300' : 'mt-2 text-2xl font-bold text-white'}>{value}</div>
      {detail && <div className="mt-1 truncate text-xs text-slate-500">{detail}</div>}
    </div>
  );
}
