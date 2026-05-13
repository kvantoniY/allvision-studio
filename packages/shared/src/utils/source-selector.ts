export type SourceMediaKind = 'image' | 'video';

export type ParsedSourceValue =
  | { kind: 'empty'; raw: string }
  | { kind: 'user'; raw: string; id: string }
  | { kind: 'step'; raw: string; id: string }
  | { kind: 'asset'; raw: string; id: string }
  | { kind: 'plain'; raw: string };

export type SourceSelectDescription = {
  mediaKind: SourceMediaKind;
  label?: string;
  description?: string;
};

export function parseSourceValue(value: unknown): ParsedSourceValue {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { kind: 'empty', raw };

  const userMatch = raw.match(/^{{\s*user\.([a-zA-Z0-9_-]+)\s*}}$/);
  if (userMatch) return { kind: 'user', raw, id: userMatch[1] };

  const stepMatch = raw.match(/^{{\s*(step_[a-zA-Z0-9_-]+)\.output\s*}}$/);
  if (stepMatch) return { kind: 'step', raw, id: stepMatch[1] };

  const assetMatch = raw.match(/^asset:([a-zA-Z0-9_-]+)$/);
  if (assetMatch) return { kind: 'asset', raw, id: assetMatch[1] };

  return { kind: 'plain', raw };
}

export function parseSourceSelectDescription(description: string | undefined): SourceSelectDescription | null {
  if (!description?.startsWith('source-select:')) return null;
  const [, rest] = description.split('source-select:', 2);
  const [kind, label, ...descriptionParts] = rest.split('|');
  if (kind !== 'image' && kind !== 'video') return null;
  return {
    mediaKind: kind,
    label: label?.trim() || undefined,
    description: descriptionParts.join('|').trim() || undefined,
  };
}

export function buildUserSourceValue(fieldId: string) {
  return `{{user.${fieldId}}}`;
}

export function buildStepSourceValue(stepId: string) {
  return `{{${stepId}.output}}`;
}

export function buildAssetSourceValue(assetId: string) {
  return `asset:${assetId}`;
}
