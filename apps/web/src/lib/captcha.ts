export const YANDEX_SMARTCAPTCHA_SITE_KEY = (process.env.NEXT_PUBLIC_YANDEX_SMARTCAPTCHA_SITE_KEY ?? '').trim();

export function captchaEnabled() {
  const flag = (process.env.NEXT_PUBLIC_CAPTCHA_ENABLED ?? '').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  if (flag === '1' || flag === 'true' || flag === 'on') return true;
  return Boolean(YANDEX_SMARTCAPTCHA_SITE_KEY);
}
