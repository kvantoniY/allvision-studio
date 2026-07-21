import { createEmptyScene, addElement } from '../academy/scene-editing';
import { pickCharacterReferenceKind, resolveInstanceScene } from '../academy/scene-instance';

function sceneWithCharacter() {
  const base = createEmptyScene();
  const { scene, elementId } = addElement(base, 'world', 'character');
  return { scene, characterId: elementId };
}

describe('resolveInstanceScene', () => {
  it('injects the child character asset into character elements', () => {
    const { scene, characterId } = sceneWithCharacter();
    const resolved = resolveInstanceScene(scene, {
      character: { assetId: 'ref1', fileUrl: '/api/academy/lesson-instances/i1/character/ref1/file', mimeType: 'image/jpeg' },
    });
    const el = resolved.layers.flatMap((l) => l.elements).find((e) => e.id === characterId);
    expect(el?.asset?.assetId).toBe('ref1');
    expect(el?.asset?.scope).toBe('child');
  });

  it('hides overridden elements', () => {
    const { scene, characterId } = sceneWithCharacter();
    const resolved = resolveInstanceScene(scene, { overrides: { hiddenElementIds: [characterId] } });
    const el = resolved.layers.flatMap((l) => l.elements).find((e) => e.id === characterId);
    expect(el?.visible).toBe(false);
  });

  it('does not mutate the original scene', () => {
    const { scene, characterId } = sceneWithCharacter();
    resolveInstanceScene(scene, { character: { assetId: 'x', fileUrl: '/f', mimeType: 'image/jpeg' } });
    const original = scene.layers.flatMap((l) => l.elements).find((e) => e.id === characterId);
    expect(original?.asset).toBeUndefined();
  });
});

describe('pickCharacterReferenceKind', () => {
  it('prefers full_body, then neutral_pose', () => {
    expect(pickCharacterReferenceKind(['portrait', 'full_body', 'neutral_pose'])).toBe('full_body');
    expect(pickCharacterReferenceKind(['portrait', 'neutral_pose'])).toBe('neutral_pose');
  });

  it('falls back to the first available kind', () => {
    expect(pickCharacterReferenceKind(['expression_joy'])).toBe('expression_joy');
    expect(pickCharacterReferenceKind([])).toBeNull();
  });
});
