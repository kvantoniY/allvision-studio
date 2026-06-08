export const GENERATION_RETENTION_DAYS = 3;
export const GENERATION_RETENTION_MS = GENERATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function generationExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + GENERATION_RETENTION_MS);
}
