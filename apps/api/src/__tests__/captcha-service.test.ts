import { verifyCaptchaToken } from '../services/captcha-service';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function setProductionEnv() {
  process.env.NODE_ENV = 'production';
  process.env.CAPTCHA_ENABLED = 'true';
  process.env.YANDEX_SMARTCAPTCHA_SECRET_KEY = 'secret-key';
  process.env.YANDEX_SMARTCAPTCHA_VERIFY_URL = 'https://captcha.example/validate';
}

describe('captcha-service', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    setProductionEnv();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('skips validation when captcha is disabled', async () => {
    process.env.CAPTCHA_ENABLED = 'false';

    await expect(verifyCaptchaToken('')).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requires a token when captcha is enabled', async () => {
    await expect(verifyCaptchaToken('')).rejects.toMatchObject({
      status: 400,
      code: 'CAPTCHA_REQUIRED',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends token and ip to Yandex validation endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    });

    await expect(verifyCaptchaToken('captcha-token', '127.0.0.1')).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://captcha.example/validate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams),
      }),
    );
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams;
    expect(body.get('secret')).toBe('secret-key');
    expect(body.get('token')).toBe('captcha-token');
    expect(body.get('ip')).toBe('127.0.0.1');
  });

  it('rejects failed provider responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'failed', message: 'bad token' }),
    });

    await expect(verifyCaptchaToken('bad-token')).rejects.toMatchObject({
      status: 400,
      code: 'CAPTCHA_INVALID',
    });
  });
});
