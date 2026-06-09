export const PRICING_USD_TO_RUB_DEFAULT = 80;
export const PRICING_RUB_PER_TOKEN_DEFAULT = 1;

export function rubToTokens(rub: number, rubPerToken = PRICING_RUB_PER_TOKEN_DEFAULT) {
  if (!Number.isFinite(rub) || rub <= 0) {
    return 0;
  }

  const rate = Number.isFinite(rubPerToken) && rubPerToken > 0 ? rubPerToken : PRICING_RUB_PER_TOKEN_DEFAULT;
  return Math.ceil(rub / rate);
}

export function tokensToRub(tokens: number, rubPerToken = PRICING_RUB_PER_TOKEN_DEFAULT) {
  if (!Number.isFinite(tokens)) {
    return 0;
  }

  const rate = Number.isFinite(rubPerToken) && rubPerToken > 0 ? rubPerToken : PRICING_RUB_PER_TOKEN_DEFAULT;
  return Math.round(tokens * rate);
}

export function usdToTokens(
  usd: number,
  usdToRub = PRICING_USD_TO_RUB_DEFAULT,
  rubPerToken = PRICING_RUB_PER_TOKEN_DEFAULT,
) {
  return rubToTokens(usd * usdToRub, rubPerToken);
}

export const EPISODE_REGENERATION_PRICE_TOKENS = rubToTokens(30);
export const EPISODE_WATERMARK_REMOVAL_PRICE_TOKENS = rubToTokens(60);
