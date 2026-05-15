export class ProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function isProviderUserSafeError(error: unknown) {
  return error instanceof ProviderError
    && (error.code === 'DAILY_CAP_EXCEEDED' || error.code === 'LOW_PROVIDER_BALANCE');
}

export const providerUnavailableMessage =
  'Сервис временно перегружен, токены возвращены, попробуйте позже.';
