'use client';

import { formatMoney } from '@allvision/shared';
import { useGetFalModelsQuery } from '@/store/api/admin-usage-api';
import { useGetAdminSettingsQuery } from '@/store/api/admin-settings-api';

export default function AdminModelsPage() {
  const { data, isLoading, isError, refetch, isFetching } = useGetFalModelsQuery();
  const settings = useGetAdminSettingsQuery();
  const usdToRub = settings.data?.settings.usdToRub ?? 80;

  const models = data?.models ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Модели и цены (fal.ai)</h1>
          <p className="mt-1 text-sm text-slate-400">
            Живые цены моделей напрямую из fal (api.fal.ai/v1/models/pricing). Итоговая себестоимость
            генерации = цена за единицу × количество единиц (секунды видео / картинки). Курс USD→RUB: {usdToRub}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-zinc-800"
        >
          {isFetching ? 'Обновление…' : 'Обновить'}
        </button>
      </div>

      {isLoading && <div className="text-sm text-slate-400">Загрузка цен…</div>}
      {isError && <div className="text-sm text-red-300">Не удалось загрузить цены fal. Проверьте FAL_BILLING_KEY/FAL_KEY.</div>}

      {models.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Модель</th>
                <th className="px-3 py-2">Категория</th>
                <th className="px-3 py-2">fal endpoint</th>
                <th className="px-3 py-2">Цена за единицу</th>
                <th className="px-3 py-2">Единица</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {models.map((m) => (
                <tr key={m.slug} className="text-slate-300">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-100">{m.title}</div>
                    <div className="text-[11px] text-slate-500">{m.slug}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{m.category}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{m.endpoint}</td>
                  <td className="px-3 py-2">
                    {typeof m.unitPrice === 'number'
                      ? formatMoney({ usd: m.unitPrice }, { primary: 'usd', showAll: true, usdToRub })
                      : <span className="text-slate-600">н/д</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{m.unit ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
