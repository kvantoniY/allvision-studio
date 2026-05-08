export type RuntimeProviderMode = 'mock' | 'piapi' | 'stub';

export function resolveRuntimeProviderMode(
  rawMode: string | undefined,
  nodeEnv: string | undefined,
): RuntimeProviderMode {
  if (nodeEnv === 'test') return 'stub';

  const mode = (rawMode ?? 'mock').trim();
  if (mode === 'mock' || mode === 'piapi') return mode;
  if (mode === 'stub') {
    throw new Error('PROVIDER_MODE=stub is only allowed when NODE_ENV=test');
  }

  throw new Error(`Unknown PROVIDER_MODE: ${mode || '(empty)'}`);
}
