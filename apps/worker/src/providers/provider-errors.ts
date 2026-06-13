export class ProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
    // Транспортные детали для решений выше по стеку (например, gpt-image edit:
    // дошёл ли запрос до провайдера, начался ли ответ). Не показывается юзеру.
    public meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function isProviderUserSafeError(error: unknown) {
  return error instanceof ProviderError
    && (
      error.code === 'DAILY_CAP_EXCEEDED'
      || error.code === 'LOW_PROVIDER_BALANCE'
      || error.code === 'PIAPI_UPSTREAM_BUSY'
    );
}

export const providerUnavailableMessage =
  'Сервис временно перегружен, токены возвращены, попробуйте позже.';
