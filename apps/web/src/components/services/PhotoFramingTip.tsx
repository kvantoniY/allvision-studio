import { cn } from '@/lib/utils';

// Аккуратная плашка-подсказка про кадрирование фото: лицо должно быть видно крупно, примерно
// по грудь. Слева — визуальная абстракция «правильного» портрета. Компактна на мобильных.
export function PhotoFramingTip({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-2.5 sm:p-3',
        className,
      )}
    >
      <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0 sm:h-11 sm:w-11" aria-hidden role="img">
        {/* рамка фото */}
        <rect x="3" y="3" width="42" height="42" rx="9" className="fill-amber-400/10 stroke-amber-400/55" strokeWidth="2" />
        {/* плечи/грудь — поднимаются до низа кадра */}
        <path d="M10 45 C10 33 38 33 38 45 Z" className="fill-amber-300/80" />
        {/* голова — крупная, лицо хорошо видно */}
        <circle cx="24" cy="19" r="8.5" className="fill-amber-300/80" />
        {/* галочка-бейдж «так правильно» */}
        <circle cx="38" cy="11" r="7" className="fill-emerald-500" />
        <path d="M34.7 11.2 L37 13.4 L41.4 8.9" className="stroke-white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-medium text-amber-100">Лицо крупно и чётко — примерно по грудь</p>
        <p className="mt-0.5 text-xs leading-snug text-amber-200/70">
          Так нейросеть точнее сохранит вашу внешность. На фото издалека или с мелким лицом результат может
          получиться неточным.
        </p>
      </div>
    </div>
  );
}
