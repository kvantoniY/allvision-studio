/**
 * Ретраи скачивания готового результата с fal CDN (прод-инцидент 05.07: fal завершил и списал
 * деньги, а download упал UND_ERR_CONNECT_TIMEOUT -> проект FAILED с refund'ом, оплаченный
 * результат выброшен). Контракт:
 *  - транспортный обрыв / 5xx -> повторяем с бэкоффом до downloadRetryAttempts заходов;
 *  - 4xx (файл удалён/недоступен) -> НЕ повторяем;
 *  - все заходы исчерпаны -> отдаём последнюю ошибку.
 */
import { FalClient } from '../providers/fal-client';
import { ProviderError } from '../providers/provider-errors';

const realFetch = global.fetch;

function okResponse(body = 'img') {
  return new Response(Buffer.from(body), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

function makeClient(attempts = 3, proxyUrl?: string) {
  return new FalClient({
    apiKey: 'test-key',
    downloadRetryAttempts: attempts,
    downloadRetryBackoffMs: [1, 1, 1],
    downloadProxyUrl: proxyUrl,
  });
}

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('FalClient.download retries', () => {
  it('retries transport failures and returns the file once the CDN answers', async () => {
    const fetchMock = jest.fn()
      // 1-й заход: обрыв + внутренний connectionRetry тоже обрыв
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      // 2-й заход: успех
      .mockResolvedValueOnce(okResponse());
    global.fetch = fetchMock as never;

    const client = makeClient();
    const result = await client.download('https://v3.fal.media/files/result.jpg');

    expect(result.contentType).toBe('image/jpeg');
    expect(result.buffer.toString()).toBe('img');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries HTTP 5xx from the CDN', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response('oops', { status: 502 }))
      .mockResolvedValueOnce(okResponse());
    global.fetch = fetchMock as never;

    const client = makeClient();
    const result = await client.download('https://v3.fal.media/files/result.jpg');

    expect(result.buffer.toString()).toBe('img');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry 4xx (result gone) and fails immediately', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('gone', { status: 404 }));
    global.fetch = fetchMock as never;

    const client = makeClient();
    await expect(client.download('https://v3.fal.media/files/result.jpg'))
      .rejects.toMatchObject({ code: 'FAL_DOWNLOAD_FAILED', status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up with the last error after all attempts', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    global.fetch = fetchMock as never;

    const client = makeClient(3);
    const error = await client.download('https://v3.fal.media/files/result.jpg').catch((err) => err);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe('FAL_NETWORK_ERROR');
    // 3 захода × (1 попытка + 1 connectionRetry) = 6 fetch-вызовов
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('falls back to the proxy route when direct egress to the CDN host is down', async () => {
    // Прод-кейс 05.07 (проект dca5b165): файл на v3b.fal.media, ВСЕ прямые заходы падают
    // UND_ERR_CONNECT_TIMEOUT — выручает только зарубежный прокси-маршрут.
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    global.fetch = fetchMock as never;

    const client = makeClient(3, 'http://user:pass@proxy.test:8888');
    const proxyMock = jest.fn(async () => ({ buffer: Buffer.from('img'), contentType: 'image/jpeg' }));
    (client as unknown as { downloadViaProxy: typeof proxyMock }).downloadViaProxy = proxyMock;

    const result = await client.download('https://v3b.fal.media/files/result.mp4');

    expect(result.buffer.toString()).toBe('img');
    // Заход 0 — прямой (2 fetch: попытка + connectionRetry), заход 1 — через прокси.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(proxyMock).toHaveBeenCalledTimes(1);
  });

  it('keeps working without a proxy configured (direct attempts only)', async () => {
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okResponse());
    global.fetch = fetchMock as never;

    const client = makeClient(3);
    const proxySpy = jest.spyOn(
      client as unknown as { downloadViaProxy: (url: string) => Promise<unknown> },
      'downloadViaProxy',
    );

    await client.download('https://v3.fal.media/files/result.jpg');
    expect(proxySpy).not.toHaveBeenCalled();
  });
});
