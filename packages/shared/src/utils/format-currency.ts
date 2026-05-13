export type MoneyAmount = {
  usd?: number | null;
  coins?: number | null;
  rub?: number | null;
};

export type FormatMoneyOptions = {
  primary: 'usd' | 'coins' | 'rub';
  showAll?: boolean;
  usdToRub?: number;
};

export function usdToRub(usd: number, rate = 80) {
  return Math.round(usd * rate);
}

export function coinsToRub(coins: number) {
  return Math.round(coins);
}

export function formatMoney(amount: MoneyAmount, opts: FormatMoneyOptions) {
  const showAll = opts.showAll ?? false;
  const rate = Number.isFinite(opts.usdToRub) ? opts.usdToRub! : 80;
  const rub = amount.rub ?? (typeof amount.usd === 'number' ? usdToRub(amount.usd, rate) : typeof amount.coins === 'number' ? coinsToRub(amount.coins) : undefined);
  const parts: string[] = [];

  const pushUsd = () => {
    if (typeof amount.usd === 'number') parts.push(formatUsd(amount.usd));
  };
  const pushCoins = () => {
    if (typeof amount.coins === 'number') parts.push(`${Math.round(amount.coins)} ${coinWord(Math.round(amount.coins))}`);
  };
  const pushRub = () => {
    if (typeof rub === 'number') parts.push(formatApproxRub(rub));
  };

  if (opts.primary === 'usd') {
    pushUsd();
    if (showAll) pushRub();
  } else if (opts.primary === 'coins') {
    pushCoins();
    if (showAll) pushRub();
  } else {
    pushRub();
    if (showAll) pushUsd();
  }

  if (parts.length === 0) return '—';
  return parts.join(' · ');
}

export function formatRub(value: number) {
  return `${formatInteger(Math.round(value))} ₽`;
}

function formatUsd(value: number) {
  return value < 0 ? `-$${Math.abs(value).toFixed(2)}` : `$${value.toFixed(2)}`;
}

function formatApproxRub(value: number) {
  return value < 0 ? `~-${formatInteger(Math.abs(value))} ₽` : `~${formatInteger(value)} ₽`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value).replace(/\s/g, ' ');
}

function coinWord(value: number) {
  const abs = Math.abs(value);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'коин';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'коина';
  return 'коинов';
}
