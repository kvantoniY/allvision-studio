import {
  academyGenerationSchema,
  buildAcademyGenerationPrompt,
  canMutateAcademyLibraryAsset,
  canPromoteAcademyAsset,
  canReadAcademyLibraryAsset,
  estimateAcademyGenerationCostUsd,
  generationKindToAsset,
} from '../academy/materials';

describe('academy material library rules', () => {
  it('routes generic materials to teacher media and child likeness to private assets', () => {
    expect(generationKindToAsset('background')).toEqual({ scope: 'teacher', assetKind: 'academy-background' });
    expect(generationKindToAsset('pose')).toEqual({ scope: 'child', assetKind: 'pose' });
    expect(generationKindToAsset('scene')).toEqual({ scope: 'child', assetKind: 'scene' });
  });

  it('shows a teacher only their own teacher library', () => {
    const base = { scope: 'teacher' as const, actorRole: 'TEACHER' as const, actorUserId: 'teacher-1' };
    expect(canReadAcademyLibraryAsset({ ...base, ownerUserId: 'teacher-1' })).toBe(true);
    expect(canReadAcademyLibraryAsset({ ...base, ownerUserId: 'teacher-2' })).toBe(false);
  });

  it('shows child assets to the parent, assigned teacher and admin, but not a methodist', () => {
    const base = { scope: 'child' as const, actorUserId: 'actor' };
    expect(canReadAcademyLibraryAsset({ ...base, actorRole: 'PARENT', childParentId: 'actor' })).toBe(true);
    expect(canReadAcademyLibraryAsset({ ...base, actorRole: 'TEACHER', teacherAssigned: true })).toBe(true);
    expect(canReadAcademyLibraryAsset({ ...base, actorRole: 'METHODIST' })).toBe(false);
    expect(canReadAcademyLibraryAsset({ ...base, actorRole: 'ADMIN' })).toBe(true);
  });

  it('allows child mutation only to the assigned creating teacher or admin', () => {
    const base = {
      scope: 'child' as const,
      actorRole: 'TEACHER' as const,
      actorUserId: 'teacher-1',
      teacherAssigned: true,
    };
    expect(canMutateAcademyLibraryAsset({ ...base, createdById: 'teacher-1' })).toBe(true);
    expect(canMutateAcademyLibraryAsset({ ...base, createdById: 'teacher-2' })).toBe(false);
  });

  it('allows only an admin to promote teacher media and never child media', () => {
    expect(canPromoteAcademyAsset('teacher', 'ADMIN')).toBe(true);
    expect(canPromoteAcademyAsset('teacher', 'TEACHER')).toBe(false);
    expect(canPromoteAcademyAsset('child', 'ADMIN')).toBe(false);
  });
});

describe('academy generation contract', () => {
  const base = {
    title: 'Замок',
    prompt: 'Старинный замок для задания с числами',
    maxCostUsd: 1,
  };

  it('rejects a child pose without a child and child references on generic media', () => {
    expect(academyGenerationSchema.safeParse({ ...base, kind: 'pose' }).success).toBe(false);
    expect(academyGenerationSchema.safeParse({
      ...base,
      kind: 'background',
      childId: 'child-1',
      characterReferenceIds: ['ref-1'],
    }).success).toBe(false);
  });

  it('requires a library reference for generic variation/inpaint/upscale', () => {
    expect(academyGenerationSchema.safeParse({ ...base, kind: 'prop', operation: 'variation' }).success).toBe(false);
    expect(academyGenerationSchema.safeParse({
      ...base,
      kind: 'prop',
      operation: 'variation',
      referenceAssetIds: ['asset-1'],
    }).success).toBe(true);
  });

  it('estimates cost before launch including count and transparent-background pass', () => {
    const normal = estimateAcademyGenerationCostUsd({
      model: 'nano-banana', quality: 'medium', resolution: '1K', aspectRatio: '1:1', count: 2, transparentBackground: false,
    });
    const transparent = estimateAcademyGenerationCostUsd({
      model: 'nano-banana', quality: 'medium', resolution: '1K', aspectRatio: '1:1', count: 2, transparentBackground: true,
    });
    expect(normal).toBe(0.24);
    expect(transparent).toBe(0.28);
  });

  it('builds a prompt with identity and pose details', () => {
    const input = academyGenerationSchema.parse({
      ...base,
      kind: 'pose',
      childId: 'child-1',
      outfit: 'костюм исследователя',
      emotion: 'радость',
    });
    const prompt = buildAcademyGenerationPrompt(input);
    expect(prompt).toContain('exact same child');
    expect(prompt).toContain('костюм исследователя');
    expect(prompt).toContain('радость');
  });
});
